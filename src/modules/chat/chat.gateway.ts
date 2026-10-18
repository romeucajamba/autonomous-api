import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Injectable, Logger, UseFilters } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

interface AuthenticatedSocket extends Socket {
  data: {
    user: JwtPayload;
  };
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly chatService: ChatService,
  ) {}

  /**
   * Autenticação e conexão do socket em tempo real
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      const authHeader =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization ||
        client.handshake.query?.token;

      if (!authHeader) {
        this.logger.warn(`[WS_AUTH_FAILED] Conexão rejeitada: Token ausente (${client.id})`);
        client.disconnect(true);
        return;
      }

      const token = String(authHeader).replace(/^Bearer\s+/i, '');
      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'super_secret_jwt_key_at_least_32_characters_long';

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      client.data = { user: payload };

      this.logger.log(
        `[WS_CONNECTED] Utilizador ${payload.name || payload.email} (${payload.sub} - ${payload.role}) conectado ao socket ${client.id}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[WS_AUTH_FAILED] Token JWT inválido ou expirado no socket ${client.id}: ${err.message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.data?.user;
    this.logger.log(
      `[WS_DISCONNECTED] Socket ${client.id} desconectado ${user ? `(${user.sub})` : ''}`,
    );
  }

  /**
   * Entrar na sala de chat temporária do agendamento
   */
  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    const user = client.data?.user;
    if (!user) {
      return { event: 'error', message: 'Não autenticado.' };
    }

    try {
      // Valida se a sala existe e se o utilizador é participante legítimo
      const room = await this.chatService.getRoomById(data.roomId, user);
      const roomChannel = `room_${data.roomId}`;

      client.join(roomChannel);

      this.logger.log(
        `[WS_JOIN_ROOM] ${user.name} (${user.sub}) ingressou no canal ${roomChannel}`,
      );

      return {
        event: 'joined_room',
        data: {
          roomId: data.roomId,
          status: room.status,
          deletedAt: room.deletedAt,
          isClosed: room.status === 'closed' || room.deletedAt !== null,
        },
      };
    } catch (error: any) {
      return {
        event: 'error',
        message: error.message || 'Erro ao aceder à sala de chat.',
      };
    }
  }

  /**
   * Sair da sala de chat temporária
   */
  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    const roomChannel = `room_${data.roomId}`;
    client.leave(roomChannel);
    return { event: 'left_room', roomId: data.roomId };
  }

  /**
   * Envio de mensagem em tempo real com validação estrita de Soft-Delete
   */
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; content: string },
  ) {
    const user = client.data?.user;
    if (!user) {
      return { event: 'error', message: 'Não autenticado.' };
    }

    try {
      const savedMessage = await this.chatService.sendMessage(
        data.roomId,
        { content: data.content },
        user,
        client.handshake.address,
      );

      const roomChannel = `room_${data.roomId}`;

      // Transmite a mensagem em tempo real para todos os participantes na sala (cliente e prestador)
      this.server.to(roomChannel).emit('new_message', {
        roomId: data.roomId,
        message: savedMessage,
      });

      return { success: true, message: savedMessage };
    } catch (error: any) {
      return {
        event: 'error',
        message:
          error.message ||
          'Não foi possível enviar a mensagem. Chat pode estar encerrado.',
      };
    }
  }

  /**
   * Indicador visual de digitação ("A digitar...") para a interface React
   */
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; isTyping: boolean },
  ) {
    const user = client.data?.user;
    if (!user) return;

    const roomChannel = `room_${data.roomId}`;
    // Notifica o outro participante (excluindo quem está a digitar)
    client.to(roomChannel).emit('user_typing', {
      roomId: data.roomId,
      userId: user.sub,
      name: user.name || 'Utilizador',
      isTyping: Boolean(data.isTyping),
    });
  }

  /**
   * Notificar o encerramento do chat em tempo real via WebSocket
   * Chamado quando o serviço prestado é concluído ou cancelado
   */
  notifyRoomClosed(roomId: string, reason?: string) {
    const roomChannel = `room_${roomId}`;
    this.server.to(roomChannel).emit('room_closed', {
      roomId,
      reason: reason || 'Serviço concluído com sucesso. Chat temporário arquivado.',
      closedAt: new Date().toISOString(),
    });
    this.logger.log(
      `[WS_ROOM_CLOSED] Evento realtime emitido para o canal ${roomChannel} (Encerramento do chat)`,
    );
  }
}
