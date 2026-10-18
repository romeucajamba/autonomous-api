import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { BookingsRepository } from './bookings.repository.js';
import { ChatRepository } from '../chat/chat.repository.js';
import { ChatGateway } from '../chat/chat.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateBookingRequestDto } from './dto/create-booking-request.dto.js';
import { AutoMatchBookingDto } from './dto/auto-match-booking.dto.js';
import { QueryBookingRequestsDto } from './dto/query-booking-requests.dto.js';
import { Request, Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly repository: BookingsRepository,
    private readonly chatRepository: ChatRepository,
    private readonly chatGateway: ChatGateway,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Criar solicitação básica de serviço (Cliente para Prestador selecionado)
   */
  async createRequest(
    dto: CreateBookingRequestDto,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<Request & { chatRoomId?: string }> {
    // 1. Obter perfil do cliente
    let clientProfile = await this.repository.findProfileByIdOrUserId(
      currentUser.profileId || currentUser.sub,
    );
    if (!clientProfile) {
      clientProfile = await this.repository.findProfileByIdOrUserId(currentUser.sub);
    }
    if (!clientProfile) {
      throw new NotFoundException('Perfil de cliente não encontrado.');
    }

    // 2. Obter perfil do prestador
    const providerProfile = await this.repository.findProfileByIdOrUserId(
      dto.providerId,
    );
    if (!providerProfile) {
      throw new NotFoundException('Prestador de serviços não encontrado.');
    }

    // 3. Impedir auto-solicitação
    if (
      clientProfile.id === providerProfile.id ||
      (clientProfile.userId && clientProfile.userId === providerProfile.userId)
    ) {
      throw new BadRequestException('Não é permitido solicitar serviços a si próprio.');
    }

    const priceAmount = dto.priceAmount !== undefined ? dto.priceAmount : 0;
    const currency = dto.currency || 'AOA';

    const created = await this.repository.create({
      client: { connect: { id: clientProfile.id } },
      clientName: clientProfile.name || currentUser.name || 'Cliente',
      clientAvatarUrl: clientProfile.avatarUrl,
      provider: { connect: { id: providerProfile.id } },
      providerName: providerProfile.name,
      providerAvatarUrl: providerProfile.avatarUrl,
      serviceName: dto.serviceName.trim(),
      description: dto.description.trim(),
      location: dto.location?.trim(),
      serviceDate: dto.serviceDate?.trim(),
      serviceTime: dto.serviceTime?.trim(),
      status: 'pending',
      priceAmount,
      currency,
      paymentStatus: 'pending',
      escrowStatus: 'none',
      agreedAmount: priceAmount,
    });

    // Cria sala de chat temporária vinculada a esta solicitação
    const room = await this.chatRepository.createRoom({
      requestId: created.id,
      clientId: clientProfile.id,
      providerId: providerProfile.id,
    });

    await this.chatRepository.createMessage({
      chatRoomId: room.id,
      senderId: clientProfile.id,
      senderRole: 'admin',
      content:
        'Chat temporário aberto. Utilizem este canal para alinhar detalhes, localização e confirmação do serviço prestado.',
    });

    this.logger.log(
      `[REQUEST_CREATED] Solicitação ${created.id} criada pelo Cliente ${created.clientName} para o Prestador ${created.providerName} | Chat temporário: ${room.id} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REQUEST_CREATED',
      entity: 'Request',
      entityId: created.id,
      details: {
        clientId: clientProfile.id,
        providerId: providerProfile.id,
        serviceName: created.serviceName,
        priceAmount: created.priceAmount,
        chatRoomId: room.id,
      },
      ipAddress,
    });

    return {
      ...created,
      chatRoomId: room.id,
    };
  }

  /**
   * Procura automática e vinculação de prestador de serviços (Auto-matching estilo Yango)
   */
  async autoMatchAndBook(
    dto: AutoMatchBookingDto,
    currentUser: JwtPayload,
    ipAddress?: string,
  ) {
    let clientProfile = await this.repository.findProfileByIdOrUserId(
      currentUser.profileId || currentUser.sub,
    );
    if (!clientProfile) {
      clientProfile = await this.repository.findProfileByIdOrUserId(currentUser.sub);
    }
    if (!clientProfile) {
      throw new NotFoundException('Perfil de cliente não encontrado.');
    }

    const candidates = await this.repository.findCandidatesForAutoMatch(
      dto.serviceQuery,
    );

    // Filtra o próprio cliente caso também possua perfil de prestador
    const eligibleProviders = candidates.filter(
      (p) => p.id !== clientProfile?.id && p.userId !== currentUser.sub,
    );

    if (eligibleProviders.length === 0) {
      throw new NotFoundException(
        `Nenhum prestador disponível encontrado para o termo "${dto.serviceQuery}". Tente pesquisar por outros termos ou categorias.`,
      );
    }

    // Algoritmo de Pontuação e Ranking (Média de avaliações, volume de serviços e preço)
    const scoredProviders = eligibleProviders.map((provider) => {
      const reviews = provider.reviewsReceived || [];
      const totalReviews = reviews.length;
      const averageRating =
        totalReviews > 0
          ? reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews
          : 5.0; // Novos prestadores iniciam com 5.0 estrelas

      const matchedCatalogItem = provider.catalogItems?.[0];
      const estimatedPrice = matchedCatalogItem
        ? matchedCatalogItem.priceAmount
        : dto.maxBudget || 15000;

      let score = averageRating * 20; // 0..100
      if (totalReviews > 0) score += Math.min(20, totalReviews * 2);
      if (dto.maxBudget && estimatedPrice <= dto.maxBudget) score += 15;

      return {
        provider,
        averageRating: Number(averageRating.toFixed(1)),
        totalReviews,
        matchedCatalogItem,
        estimatedPrice,
        score,
      };
    });

    // Ordena pelo maior score
    scoredProviders.sort((a, b) => b.score - a.score);
    const bestMatch = scoredProviders[0];
    const selectedProvider = bestMatch.provider;

    const priceAmount = bestMatch.estimatedPrice;
    const currency = 'AOA';

    const created = await this.repository.create({
      client: { connect: { id: clientProfile.id } },
      clientName: clientProfile.name || currentUser.name || 'Cliente',
      clientAvatarUrl: clientProfile.avatarUrl,
      provider: { connect: { id: selectedProvider.id } },
      providerName: selectedProvider.name,
      providerAvatarUrl: selectedProvider.avatarUrl,
      serviceName: dto.serviceQuery.trim(),
      description: dto.description.trim(),
      location: dto.location.trim(),
      serviceDate: dto.serviceDate?.trim(),
      serviceTime: dto.serviceTime?.trim(),
      status: 'pending',
      priceAmount,
      currency,
      paymentStatus: 'pending',
      escrowStatus: 'none',
      agreedAmount: priceAmount,
    });

    // Cria sala de chat temporária vinculada
    const room = await this.chatRepository.createRoom({
      requestId: created.id,
      clientId: clientProfile.id,
      providerId: selectedProvider.id,
    });

    await this.chatRepository.createMessage({
      chatRoomId: room.id,
      senderId: clientProfile.id,
      senderRole: 'admin',
      content: `Prestador ${selectedProvider.name} (Avaliação: ${bestMatch.averageRating}/5) vinculado automaticamente. Utilizem este chat temporário para alinhar detalhes e confirmação do serviço.`,
    });

    this.logger.log(
      `[AUTO_MATCH] Prestador "${selectedProvider.name}" (${selectedProvider.id}) vinculado automaticamente ao Cliente "${clientProfile.name}" para o serviço "${dto.serviceQuery}" | Score: ${bestMatch.score} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REQUEST_AUTO_MATCHED',
      entity: 'Request',
      entityId: created.id,
      details: {
        providerId: selectedProvider.id,
        serviceQuery: dto.serviceQuery,
        averageRating: bestMatch.averageRating,
        priceAmount,
        chatRoomId: room.id,
      },
      ipAddress,
    });

    return {
      message: 'Prestador encontrado e vinculado com sucesso! Chat temporário aberto.',
      request: created,
      matchedProvider: {
        id: selectedProvider.id,
        name: selectedProvider.name,
        avatarUrl: selectedProvider.avatarUrl,
        workArea: selectedProvider.workArea,
        reputation: {
          averageRating: bestMatch.averageRating,
          totalReviews: bestMatch.totalReviews,
        },
      },
      chatRoomId: room.id,
    };
  }

  /**
   * Listar solicitações de serviços associadas ao utilizador
   */
  async listRequests(
    query: QueryBookingRequestsDto,
    currentUser: JwtPayload,
  ): Promise<{
    data: Request[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    let clientId: string | undefined;
    let providerId: string | undefined;

    if (currentUser.role === Role.CLIENT) {
      const clientProfile = await this.repository.findProfileByIdOrUserId(
        currentUser.profileId || currentUser.sub,
      );
      clientId = clientProfile?.id || currentUser.profileId;
    } else if (currentUser.role === Role.PROVIDER) {
      const providerProfile = await this.repository.findProfileByIdOrUserId(
        currentUser.profileId || currentUser.sub,
      );
      providerId = providerProfile?.id || currentUser.profileId;
    }

    const { items, total } = await this.repository.findMany({
      skip,
      take: limit,
      clientId,
      providerId,
      status: query.status,
    });

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Obter detalhes de uma solicitação de serviço
   */
  async getRequestById(id: string, currentUser: JwtPayload): Promise<Request> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Solicitação de serviço não encontrada.');
    }

    if (currentUser.role !== Role.ADMIN && currentUser.role !== Role.FINANCIAL) {
      const isClient =
        request.client.userId === currentUser.sub ||
        request.clientId === currentUser.profileId;
      const isProvider =
        request.provider.userId === currentUser.sub ||
        request.providerId === currentUser.profileId;

      if (!isClient && !isProvider) {
        throw new ForbiddenException(
          'Acesso negado: não tem permissão para visualizar esta solicitação de serviço.',
        );
      }
    }

    return request;
  }

  /**
   * Aceitar solicitação de serviço (Prestador)
   */
  async acceptRequest(
    id: string,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; request: Request }> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Solicitação de serviço não encontrada.');
    }

    if (currentUser.role !== Role.ADMIN) {
      const isProvider =
        request.provider.userId === currentUser.sub ||
        request.providerId === currentUser.profileId;

      if (!isProvider) {
        throw new ForbiddenException(
          'Acesso negado: apenas o prestador destinatário pode aceitar esta solicitação.',
        );
      }
    }

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Apenas solicitações pendentes podem ser aceites (estado atual: ${request.status}).`,
      );
    }

    const updated = await this.repository.update(id, {
      status: 'accepted',
      acceptedAt: new Date(),
    });

    this.logger.log(
      `[REQUEST_ACCEPTED] Solicitação ${id} aceite pelo Prestador ${request.providerName} (${currentUser.sub}) | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REQUEST_ACCEPTED',
      entity: 'Request',
      entityId: id,
      details: {
        clientId: request.clientId,
        providerId: request.providerId,
        serviceName: request.serviceName,
      },
      ipAddress,
    });

    return {
      message: 'Solicitação de serviço aceite com sucesso.',
      request: updated,
    };
  }

  /**
   * Rejeitar solicitação de serviço (Prestador)
   */
  async rejectRequest(
    id: string,
    reason: string | undefined,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; request: Request }> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Solicitação de serviço não encontrada.');
    }

    if (currentUser.role !== Role.ADMIN) {
      const isProvider =
        request.provider.userId === currentUser.sub ||
        request.providerId === currentUser.profileId;

      if (!isProvider) {
        throw new ForbiddenException(
          'Acesso negado: apenas o prestador destinatário pode rejeitar esta solicitação.',
        );
      }
    }

    if (request.status !== 'pending') {
      throw new BadRequestException(
        `Apenas solicitações pendentes podem ser rejeitadas (estado atual: ${request.status}).`,
      );
    }

    const updated = await this.repository.update(id, {
      status: 'rejected',
      rejectedAt: new Date(),
      cancelReason: reason || 'Rejeitado pelo prestador',
      cancelledBy: 'provider',
    });

    this.logger.log(
      `[REQUEST_REJECTED] Solicitação ${id} rejeitada pelo Prestador ${request.providerName} (${currentUser.sub}) | Motivo: ${reason || 'N/A'} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REQUEST_REJECTED',
      entity: 'Request',
      entityId: id,
      details: {
        reason: reason || 'N/A',
        rejectedBy: currentUser.sub,
      },
      ipAddress,
    });

    return {
      message: 'Solicitação de serviço rejeitada.',
      request: updated,
    };
  }

  /**
   * Cancelar solicitação de serviço (Cliente ou Admin)
   */
  async cancelRequest(
    id: string,
    reason: string | undefined,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; request: Request }> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Solicitação de serviço não encontrada.');
    }

    if (currentUser.role !== Role.ADMIN) {
      const isClient =
        request.client.userId === currentUser.sub ||
        request.clientId === currentUser.profileId;

      if (!isClient) {
        throw new ForbiddenException(
          'Acesso negado: apenas o cliente solicitante pode cancelar este pedido.',
        );
      }
    }

    if (request.status === 'completed' || request.status === 'cancelled') {
      throw new BadRequestException(
        `Esta solicitação não pode ser cancelada (estado atual: ${request.status}).`,
      );
    }

    const updated = await this.repository.update(id, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: reason || 'Cancelado pelo cliente',
      cancelledBy: 'client',
    });

    // Encerra a sala de chat caso tenha sido cancelada
    const closedRoom = await this.chatRepository.softDeleteRoomByRequestId(id);
    if (closedRoom) {
      this.chatGateway.notifyRoomClosed(
        closedRoom.id,
        reason || 'Solicitação cancelada.',
      );
    }

    this.logger.log(
      `[REQUEST_CANCELLED] Solicitação ${id} cancelada pelo Cliente (${currentUser.sub}) | Motivo: ${reason || 'N/A'} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REQUEST_CANCELLED',
      entity: 'Request',
      entityId: id,
      details: {
        reason: reason || 'N/A',
        cancelledBy: currentUser.sub,
      },
      ipAddress,
    });

    return {
      message: 'Solicitação de serviço cancelada com sucesso.',
      request: updated,
    };
  }

  /**
   * Concluir serviço (Prestador ou Admin) e aplicar Soft-Delete ao Chat Temporário
   */
  async completeRequest(
    id: string,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; request: Request; chatClosed: boolean }> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('Solicitação de serviço não encontrada.');
    }

    if (currentUser.role !== Role.ADMIN) {
      const isProvider =
        request.provider.userId === currentUser.sub ||
        request.providerId === currentUser.profileId;

      if (!isProvider) {
        throw new ForbiddenException(
          'Acesso negado: apenas o prestador associado pode concluir este serviço.',
        );
      }
    }

    if (request.status !== 'accepted') {
      throw new BadRequestException(
        `Apenas solicitações com estado "accepted" podem ser concluídas (estado atual: ${request.status}).`,
      );
    }

    const updated = await this.repository.update(id, {
      status: 'completed',
      completedAt: new Date(),
    });

    // Encerra e aplica Soft-Delete no Chat Temporário
    const closedRoom = await this.chatRepository.softDeleteRoomByRequestId(id);
    if (closedRoom) {
      this.chatGateway.notifyRoomClosed(
        closedRoom.id,
        'Serviço concluído com sucesso. Chat arquivado.',
      );
    }

    this.logger.log(
      `[REQUEST_COMPLETED] Serviço ${id} concluído pelo Prestador ${request.providerName} (${currentUser.sub}) | Chat temporário encerrado com soft-delete | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REQUEST_COMPLETED',
      entity: 'Request',
      entityId: id,
      details: {
        clientId: request.clientId,
        providerId: request.providerId,
        chatClosedWithSoftDelete: true,
      },
      ipAddress,
    });

    return {
      message:
        'Serviço concluído com sucesso. O chat temporário foi arquivado e o cliente já pode submeter a sua avaliação.',
      request: updated,
      chatClosed: true,
    };
  }
}
