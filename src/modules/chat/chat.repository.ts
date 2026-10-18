import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ChatRoom, ChatMessage, Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Buscar sala de chat por ID (com opção de incluir soft-deleted para o Admin)
   */
  async findRoomById(id: string, includeDeleted = false) {
    const where: Prisma.ChatRoomWhereInput = { id };
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    return this.prisma.chatRoom.findFirst({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            userId: true,
            phone: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            userId: true,
            phone: true,
            workArea: true,
          },
        },
        request: {
          select: {
            id: true,
            serviceName: true,
            status: true,
            priceAmount: true,
            currency: true,
            serviceDate: true,
            serviceTime: true,
            location: true,
          },
        },
      },
    });
  }

  /**
   * Buscar sala de chat pelo ID da solicitação de serviço
   */
  async findRoomByRequestId(requestId: string, includeDeleted = false) {
    const where: Prisma.ChatRoomWhereInput = { requestId };
    if (!includeDeleted) {
      where.deletedAt = null;
    }

    return this.prisma.chatRoom.findFirst({
      where,
      include: {
        client: true,
        provider: true,
      },
    });
  }

  /**
   * Listar salas de chat ativas para um utilizador (Cliente ou Prestador)
   */
  async findRoomsForUser(profileId: string, role: string) {
    const where: Prisma.ChatRoomWhereInput = {
      deletedAt: null, // Apenas salas ativas que não sofreram soft-delete
    };

    if (role === 'professional') {
      where.providerId = profileId;
    } else {
      where.clientId = profileId;
    }

    return this.prisma.chatRoom.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: {
          select: { id: true, name: true, avatarUrl: true, phone: true },
        },
        provider: {
          select: { id: true, name: true, avatarUrl: true, phone: true, workArea: true },
        },
        request: {
          select: { id: true, serviceName: true, status: true, priceAmount: true },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Listar todas as salas para o Administrador (inclui ativas e arquivadas/soft-deleted)
   */
  async findAllRoomsForAdmin(skip: number, take: number) {
    const [rooms, total] = await Promise.all([
      this.prisma.chatRoom.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, name: true, avatarUrl: true, userId: true },
          },
          provider: {
            select: { id: true, name: true, avatarUrl: true, userId: true, workArea: true },
          },
          request: {
            select: { id: true, serviceName: true, status: true },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      this.prisma.chatRoom.count(),
    ]);

    return { rooms, total };
  }

  /**
   * Criar sala de chat temporária vinculada à solicitação
   */
  async createRoom(data: {
    requestId: string;
    clientId: string;
    providerId: string;
  }): Promise<ChatRoom> {
    return this.prisma.chatRoom.create({
      data: {
        requestId: data.requestId,
        clientId: data.clientId,
        providerId: data.providerId,
        status: 'active',
      },
    });
  }

  /**
   * Gravar mensagem enviada no chat
   */
  async createMessage(data: {
    chatRoomId: string;
    senderId: string;
    senderRole: string;
    content: string;
  }): Promise<ChatMessage> {
    const [message] = await Promise.all([
      this.prisma.chatMessage.create({
        data: {
          chatRoomId: data.chatRoomId,
          senderId: data.senderId,
          senderRole: data.senderRole,
          content: data.content.trim(),
        },
      }),
      // Atualiza updatedAt da sala para ordenar conversas mais recentes
      this.prisma.chatRoom.update({
        where: { id: data.chatRoomId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return message;
  }

  /**
   * Listar mensagens de uma sala de chat
   */
  async findMessages(chatRoomId: string, skip: number, take: number): Promise<{
    messages: (ChatMessage & {
      sender: { id: string; name: string; avatarUrl: string | null };
    })[];
    total: number;
  }> {
    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { chatRoomId },
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.chatMessage.count({ where: { chatRoomId } }),
    ]);

    return { messages, total };
  }

  /**
   * Aplicar Soft-Delete à sala de chat temporária (chamado quando o serviço termina)
   */
  async softDeleteRoomByRequestId(requestId: string): Promise<ChatRoom | null> {
    const room = await this.prisma.chatRoom.findUnique({
      where: { requestId },
    });

    if (!room) return null;

    return this.prisma.chatRoom.update({
      where: { id: room.id },
      data: {
        status: 'closed',
        deletedAt: new Date(),
      },
    });
  }

  /**
   * Aplicar Soft-Delete por ID da sala
   */
  async softDeleteRoomById(id: string): Promise<ChatRoom> {
    return this.prisma.chatRoom.update({
      where: { id },
      data: {
        status: 'closed',
        deletedAt: new Date(),
      },
    });
  }
}
