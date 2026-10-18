import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ChatRepository } from './chat.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { QueryChatMessagesDto } from './dto/query-chat.dto.js';
import { Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly repository: ChatRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Listar salas de chat temporárias ativas do utilizador autenticado
   */
  async getMyRooms(currentUser: JwtPayload) {
    const role = currentUser.role === Role.PROVIDER ? 'professional' : 'client';
    const profileId = currentUser.profileId || currentUser.sub;

    return this.repository.findRoomsForUser(profileId, role);
  }

  /**
   * Obter detalhes da sala de chat (valida participação ou privilégio ADMIN)
   */
  async getRoomById(roomId: string, currentUser: JwtPayload) {
    const isAdmin = currentUser.role === Role.ADMIN;
    const room = await this.repository.findRoomById(roomId, isAdmin);

    if (!room) {
      throw new NotFoundException('Sala de chat não encontrada ou já encerrada.');
    }

    if (!isAdmin) {
      const isClient =
        room.client.userId === currentUser.sub ||
        room.clientId === currentUser.profileId;
      const isProvider =
        room.provider.userId === currentUser.sub ||
        room.providerId === currentUser.profileId;

      if (!isClient && !isProvider) {
        throw new ForbiddenException(
          'Acesso negado: não tem permissão para aceder a esta conversa.',
        );
      }
    }

    return room;
  }

  /**
   * Obter mensagens da sala de chat temporária
   */
  async getMessages(
    roomId: string,
    query: QueryChatMessagesDto,
    currentUser: JwtPayload,
  ) {
    // Garante que o utilizador tem permissão de leitura
    await this.getRoomById(roomId, currentUser);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const { messages, total } = await this.repository.findMessages(
      roomId,
      skip,
      limit,
    );

    return {
      data: messages,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Enviar mensagem no chat temporário (Bloqueado se tiver sofrido soft-delete)
   */
  async sendMessage(
    roomId: string,
    dto: SendMessageDto,
    currentUser: JwtPayload,
    ipAddress?: string,
  ) {
    // Busca a sala (inclusive se fechada, para validar o motivo exato)
    const room = await this.repository.findRoomById(roomId, true);
    if (!room) {
      throw new NotFoundException('Sala de chat não encontrada.');
    }

    // Validação estrita de Soft-delete
    if (room.deletedAt !== null || room.status === 'closed') {
      throw new BadRequestException(
        'Este chat temporário foi encerrado com a finalização do serviço prestado. Não é possível enviar novas mensagens.',
      );
    }

    let senderId: string;
    let senderRole: string;

    const isClient =
      room.client.userId === currentUser.sub ||
      room.clientId === currentUser.profileId;
    const isProvider =
      room.provider.userId === currentUser.sub ||
      room.providerId === currentUser.profileId;

    if (isClient) {
      senderId = room.clientId;
      senderRole = 'client';
    } else if (isProvider) {
      senderId = room.providerId;
      senderRole = 'provider';
    } else if (currentUser.role === Role.ADMIN) {
      senderId = room.clientId;
      senderRole = 'admin';
    } else {
      throw new ForbiddenException(
        'Acesso negado: apenas o cliente e o prestador vinculados a este serviço podem trocar mensagens.',
      );
    }

    const message = await this.repository.createMessage({
      chatRoomId: roomId,
      senderId,
      senderRole,
      content: dto.content,
    });

    this.logger.log(
      `[CHAT_MESSAGE] Mensagem enviada na sala ${roomId} por ${senderRole} (${currentUser.sub}) | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'CHAT_MESSAGE_SENT',
      entity: 'ChatMessage',
      entityId: message.id,
      details: {
        chatRoomId: roomId,
        senderRole,
        requestId: room.requestId,
      },
      ipAddress,
    });

    return message;
  }

  /**
   * Encerrar sala de chat com Soft-Delete ao fechar/concluir o serviço prestado
   */
  async closeAndSoftDeleteRoom(requestId: string, reason?: string) {
    const room = await this.repository.softDeleteRoomByRequestId(requestId);
    if (!room) return null;

    this.logger.log(
      `[CHAT_CLOSED_SOFTDELETE] Sala de chat ${room.id} vinculada à solicitação ${requestId} foi encerrada e arquivada via soft-delete.`,
    );

    await this.auditService.log({
      action: 'CHAT_ROOM_SOFT_DELETED',
      entity: 'ChatRoom',
      entityId: room.id,
      details: {
        requestId,
        reason: reason || 'Serviço concluído',
        deletedAt: room.deletedAt,
      },
    });

    return room;
  }

  /**
   * Painel de Moderação do Administrador: Listar todas as salas (mesmo encerradas)
   */
  async adminListAllRooms(query: QueryChatMessagesDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const { rooms, total } = await this.repository.findAllRoomsForAdmin(
      skip,
      limit,
    );

    return {
      data: rooms,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Painel de Moderação do Administrador: Consultar mensagens arquivadas de qualquer sala
   */
  async adminGetRoomMessages(roomId: string, query: QueryChatMessagesDto) {
    const room = await this.repository.findRoomById(roomId, true);
    if (!room) {
      throw new NotFoundException('Sala de chat não encontrada.');
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 100));
    const skip = (page - 1) * limit;

    const { messages, total } = await this.repository.findMessages(
      roomId,
      skip,
      limit,
    );

    return {
      room,
      messages: {
        data: messages,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    };
  }
}
