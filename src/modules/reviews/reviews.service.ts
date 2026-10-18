import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ReviewsRepository } from './reviews.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { QueryReviewsDto } from './dto/query-reviews.dto.js';
import { Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly repository: ReviewsRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Avaliar prestador de serviços (0 a 5 estrelas estilo Yango) após a conclusão do serviço
   */
  async createReview(
    dto: CreateReviewDto,
    currentUser: JwtPayload,
    ipAddress?: string,
  ) {
    const request = await this.repository.findRequestForReview(dto.requestId);
    if (!request) {
      throw new NotFoundException('Solicitação de serviço não encontrada.');
    }

    // 1. Validação de participante: Apenas o cliente contratante pode submeter a avaliação
    const isClient =
      request.client.userId === currentUser.sub ||
      request.clientId === currentUser.profileId;

    if (!isClient && currentUser.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Acesso negado: apenas o cliente solicitante pode avaliar o serviço prestado.',
      );
    }

    // 2. Validação de estado: Só pode avaliar se o serviço estiver concluído
    if (request.status !== 'completed') {
      throw new BadRequestException(
        `Apenas serviços com status "completed" (concluídos) podem receber avaliação (estado atual: ${request.status}).`,
      );
    }

    // 3. Validação de unicidade: Apenas uma avaliação por serviço
    if (request.review) {
      throw new ConflictException(
        'Esta solicitação de serviço já foi avaliada anteriormente.',
      );
    }

    const review = await this.repository.createReview({
      request: { connect: { id: request.id } },
      client: { connect: { id: request.clientId } },
      clientAvatarUrl: request.clientAvatarUrl,
      provider: { connect: { id: request.providerId } },
      rating: dto.rating,
      comment: dto.comment?.trim(),
      wellExecuted: dto.wellExecuted !== undefined ? dto.wellExecuted : true,
      wouldRecommend: dto.wouldRecommend !== undefined ? dto.wouldRecommend : true,
      inappropriateBehavior: dto.inappropriateBehavior || false,
    });

    const reputation = await this.repository.calculateProviderReputation(
      request.providerId,
    );

    this.logger.log(
      `[REVIEW_SUBMITTED] Cliente "${request.clientName}" avaliou o Prestador "${request.providerName}" com ${dto.rating}/5 estrelas | Média atual: ${reputation.averageRating}/5 (${reputation.totalReviews} avaliações) | IP: ${ipAddress || 'unknown'}`,
    );

    if (dto.inappropriateBehavior) {
      this.logger.warn(
        `[SECURITY_ALERT] Comportamento impróprio sinalizado na avaliação ${review.id} referente ao prestador ${request.providerId} pelo cliente ${request.clientId}`,
      );
    }

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'REVIEW_SUBMITTED',
      entity: 'Review',
      entityId: review.id,
      details: {
        requestId: request.id,
        providerId: request.providerId,
        rating: dto.rating,
        inappropriateBehavior: dto.inappropriateBehavior || false,
        newAverageRating: reputation.averageRating,
      },
      ipAddress,
    });

    return {
      message: 'Avaliação submetida com sucesso.',
      review,
      providerReputation: reputation,
    };
  }

  /**
   * Obter avaliações e métricas de reputação de um prestador
   */
  async getProviderReviews(providerId: string, query: QueryReviewsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const [reputation, { reviews, total }] = await Promise.all([
      this.repository.calculateProviderReputation(providerId),
      this.repository.findReviewsByProviderId(providerId, skip, limit),
    ]);

    return {
      providerId,
      reputation,
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Listar avaliações associadas ao utilizador logado
   */
  async getMyReviews(currentUser: JwtPayload) {
    const isProvider = currentUser.role === Role.PROVIDER;
    const profileId = currentUser.profileId || currentUser.sub;

    const reviews = await this.repository.findReviewsForUser(
      profileId,
      isProvider,
    );

    let reputation = null;
    if (isProvider) {
      reputation = await this.repository.calculateProviderReputation(profileId);
    }

    return {
      reputation,
      data: reviews,
    };
  }

  /**
   * Moderação do Administrador: Consultar todas as avaliações com alerta de comportamento
   */
  async adminListAllReviews(query: QueryReviewsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const { reviews, total } = await this.repository.findAllReviewsForAdmin(
      skip,
      limit,
    );

    return {
      data: reviews,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
