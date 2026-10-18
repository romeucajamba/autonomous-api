import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

describe('ChatService', () => {
  let service: ChatService;
  let mockRepository: any;
  let mockAuditService: any;

  const mockClientUser: JwtPayload = {
    sub: 'user-client-1',
    email: 'cliente@teste.ao',
    role: Role.CLIENT,
    profileId: 'profile-client-1',
    name: 'Cliente Manuel',
  };

  const mockProviderUser: JwtPayload = {
    sub: 'user-provider-1',
    email: 'prestador@teste.ao',
    role: Role.PROVIDER,
    profileId: 'profile-provider-1',
    name: 'João Prestador',
  };

  const mockOtherUser: JwtPayload = {
    sub: 'user-other-1',
    email: 'outro@teste.ao',
    role: Role.CLIENT,
    profileId: 'profile-other-1',
    name: 'Outro',
  };

  const mockAdminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@autonomous.ao',
    role: Role.ADMIN,
    name: 'Admin',
  };

  const mockActiveRoom = {
    id: 'room-1',
    requestId: 'req-1',
    clientId: 'profile-client-1',
    providerId: 'profile-provider-1',
    status: 'active',
    deletedAt: null,
    client: { userId: 'user-client-1', name: 'Cliente Manuel' },
    provider: { userId: 'user-provider-1', name: 'João Prestador' },
    request: { id: 'req-1', serviceName: 'Pintura', status: 'accepted' },
  };

  const mockSoftDeletedRoom = {
    ...mockActiveRoom,
    status: 'closed',
    deletedAt: new Date(),
  };

  beforeEach(() => {
    mockRepository = {
      findRoomsForUser: vi.fn(),
      findRoomById: vi.fn(),
      findMessages: vi.fn(),
      createMessage: vi.fn(),
      softDeleteRoomByRequestId: vi.fn(),
      findAllRoomsForAdmin: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new ChatService(mockRepository, mockAuditService);
  });

  describe('getMyRooms', () => {
    it('deve listar salas ativas do utilizador autenticado', async () => {
      mockRepository.findRoomsForUser.mockResolvedValue([mockActiveRoom]);

      const result = await service.getMyRooms(mockClientUser);

      expect(result).toHaveLength(1);
      expect(mockRepository.findRoomsForUser).toHaveBeenCalledWith(
        'profile-client-1',
        'client',
      );
    });
  });

  describe('getRoomById', () => {
    it('deve retornar sala para participante cliente', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockActiveRoom);

      const result = await service.getRoomById('room-1', mockClientUser);

      expect(result.id).toBe('room-1');
    });

    it('deve permitir acesso total ao administrador', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockActiveRoom);

      const result = await service.getRoomById('room-1', mockAdminUser);

      expect(result.id).toBe('room-1');
      expect(mockRepository.findRoomById).toHaveBeenCalledWith('room-1', true);
    });

    it('deve lançar ForbiddenException para utilizador estranho', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockActiveRoom);

      await expect(
        service.getRoomById('room-1', mockOtherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve lançar NotFoundException se a sala não existir', async () => {
      mockRepository.findRoomById.mockResolvedValue(null);

      await expect(
        service.getRoomById('room-nao-existe', mockClientUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMessage', () => {
    it('deve permitir envio de mensagem em sala ativa e registrar auditoria', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockActiveRoom);
      mockRepository.createMessage.mockResolvedValue({
        id: 'msg-1',
        chatRoomId: 'room-1',
        senderId: 'profile-client-1',
        senderRole: 'client',
        content: 'Olá, a que horas chega?',
        createdAt: new Date(),
      });

      const result = await service.sendMessage(
        'room-1',
        { content: 'Olá, a que horas chega?' },
        mockClientUser,
        '127.0.0.1',
      );

      expect(result.id).toBe('msg-1');
      expect(mockRepository.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          chatRoomId: 'room-1',
          senderRole: 'client',
          content: 'Olá, a que horas chega?',
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CHAT_MESSAGE_SENT' }),
      );
    });

    it('deve bloquear envio de mensagem se a sala tiver sofrido soft-delete (conclusão do serviço)', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockSoftDeletedRoom);

      await expect(
        service.sendMessage(
          'room-1',
          { content: 'Tentativa de mensagem tardia' },
          mockClientUser,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(mockRepository.createMessage).not.toHaveBeenCalled();
    });

    it('deve bloquear envio se o utilizador não pertencer ao chat', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockActiveRoom);

      await expect(
        service.sendMessage(
          'room-1',
          { content: 'Intruso' },
          mockOtherUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('closeAndSoftDeleteRoom', () => {
    it('deve aplicar soft-delete e registrar auditoria quando solicitado', async () => {
      mockRepository.softDeleteRoomByRequestId.mockResolvedValue(mockSoftDeletedRoom);

      const result = await service.closeAndSoftDeleteRoom('req-1', 'Serviço concluído');

      expect(result?.status).toBe('closed');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CHAT_ROOM_SOFT_DELETED' }),
      );
    });
  });

  describe('admin moderation', () => {
    it('deve listar todas as salas para o painel administrativo de moderação', async () => {
      mockRepository.findAllRoomsForAdmin.mockResolvedValue({
        rooms: [mockActiveRoom, mockSoftDeletedRoom],
        total: 2,
      });

      const result = await service.adminListAllRooms({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });

    it('deve permitir ao admin inspecionar mensagens completas arquivadas', async () => {
      mockRepository.findRoomById.mockResolvedValue(mockSoftDeletedRoom);
      mockRepository.findMessages.mockResolvedValue({
        messages: [{ id: 'msg-1', content: 'Mensagem antiga' }],
        total: 1,
      });

      const result = await service.adminGetRoomMessages('room-1', { page: 1, limit: 50 });

      expect(result.room.id).toBe('room-1');
      expect(result.messages.data).toHaveLength(1);
    });
  });
});
