import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

describe('BookingsService', () => {
  let service: BookingsService;
  let mockRepository: any;
  let mockChatRepository: any;
  let mockChatGateway: any;
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
    name: 'Outro Utilizador',
  };

  const mockAdminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@autonomous.ao',
    role: Role.ADMIN,
    name: 'Administrador',
  };

  const mockClientProfile = {
    id: 'profile-client-1',
    userId: 'user-client-1',
    name: 'Cliente Manuel',
    avatarUrl: 'https://cdn.example.com/client.jpg',
    role: 'client',
  };

  const mockProviderProfile = {
    id: 'profile-provider-1',
    userId: 'user-provider-1',
    name: 'João Prestador',
    avatarUrl: 'https://cdn.example.com/provider.jpg',
    role: 'professional',
    workArea: 'Canalização',
  };

  const mockRequest = {
    id: 'req-1',
    clientId: 'profile-client-1',
    clientName: 'Cliente Manuel',
    clientAvatarUrl: 'https://cdn.example.com/client.jpg',
    providerId: 'profile-provider-1',
    providerName: 'João Prestador',
    providerAvatarUrl: 'https://cdn.example.com/provider.jpg',
    serviceName: 'Reparação de Torneira',
    description: 'A torneira da cozinha está a verter água',
    location: 'Bairro Alvalade, Luanda',
    serviceDate: '2026-10-25',
    serviceTime: '14:00',
    status: 'pending',
    priceAmount: 15000,
    currency: 'AOA',
    client: {
      id: 'profile-client-1',
      name: 'Cliente Manuel',
      avatarUrl: 'https://cdn.example.com/client.jpg',
      phone: '+244923000111',
      userId: 'user-client-1',
    },
    provider: {
      id: 'profile-provider-1',
      name: 'João Prestador',
      avatarUrl: 'https://cdn.example.com/provider.jpg',
      phone: '+244923222333',
      workArea: 'Canalização',
      userId: 'user-provider-1',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepository = {
      findMany: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findProfileByIdOrUserId: vi.fn(),
      findCandidatesForAutoMatch: vi.fn(),
    };

    mockChatRepository = {
      createRoom: vi.fn().mockResolvedValue({ id: 'chat-room-1', status: 'active', deletedAt: null }),
      createMessage: vi.fn().mockResolvedValue({ id: 'msg-1' }),
      softDeleteRoomByRequestId: vi.fn().mockResolvedValue({ count: 1 }),
      softDeleteRoom: vi.fn().mockResolvedValue({ id: 'chat-room-1', status: 'closed', deletedAt: new Date() }),
    };

    mockChatGateway = {
      notifyRoomClosed: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new BookingsService(
      mockRepository,
      mockChatRepository,
      mockChatGateway,
      mockAuditService,
    );
  });

  describe('createRequest', () => {
    it('deve criar solicitação direta de serviço com sucesso (sem matching automático)', async () => {
      mockRepository.findProfileByIdOrUserId
        .mockResolvedValueOnce(mockClientProfile) // client
        .mockResolvedValueOnce(mockProviderProfile); // provider

      mockRepository.create.mockResolvedValue(mockRequest);

      const dto = {
        providerId: 'profile-provider-1',
        serviceName: 'Reparação de Torneira',
        description: 'A torneira da cozinha está a verter água',
        location: 'Bairro Alvalade, Luanda',
        priceAmount: 15000,
      };

      const result = await service.createRequest(dto, mockClientUser, '192.168.1.5');

      expect(result.id).toBe('req-1');
      expect(result.status).toBe('pending');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: 'Reparação de Torneira',
          priceAmount: 15000,
          status: 'pending',
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_CREATED' }),
      );
    });

    it('deve impedir que o cliente faça uma solicitação para si próprio', async () => {
      mockRepository.findProfileByIdOrUserId
        .mockResolvedValueOnce(mockClientProfile)
        .mockResolvedValueOnce(mockClientProfile);

      const dto = {
        providerId: 'profile-client-1',
        serviceName: 'Auto-serviço',
        description: 'Descrição de teste',
      };

      await expect(service.createRequest(dto, mockClientUser)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('autoMatchAndBook', () => {
    it('deve encontrar o prestador com melhor reputação, vincular cliente e prestador e iniciar chat temporário', async () => {
      mockRepository.findProfileByIdOrUserId.mockResolvedValue(mockClientProfile);
      mockRepository.findCandidatesForAutoMatch.mockResolvedValue([
        {
          id: 'profile-provider-1',
          name: 'João Prestador',
          avatarUrl: 'https://cdn.example.com/p1.jpg',
          workArea: 'Eletricidade',
          user: { id: 'user-p1', status: 'ACTIVE' },
          catalogItems: [{ id: 'srv-1', title: 'Eletricista Geral', priceAmount: 10000 }],
          reviewsReceived: [{ rating: 5 }, { rating: 5 }, { rating: 4.8 }],
        },
        {
          id: 'profile-provider-2',
          name: 'Carlos Prestador',
          avatarUrl: 'https://cdn.example.com/p2.jpg',
          workArea: 'Eletricidade',
          user: { id: 'user-p2', status: 'ACTIVE' },
          catalogItems: [{ id: 'srv-2', title: 'Eletricista Residencial', priceAmount: 12000 }],
          reviewsReceived: [{ rating: 4 }, { rating: 3.5 }],
        },
      ]);

      mockRepository.create.mockResolvedValue({
        ...mockRequest,
        providerId: 'profile-provider-1',
        providerName: 'João Prestador',
      });

      const dto = {
        serviceQuery: 'Eletricista',
        description: 'Preciso de consertar o disjuntor do quadro elétrico',
        location: 'Luanda, Maianga',
        maxBudget: 15000,
      };

      const result = await service.autoMatchAndBook(
        dto,
        mockClientUser,
        '192.168.1.10',
      );

      expect(result.request).toBeDefined();
      expect(result.matchedProvider.id).toBe('profile-provider-1');
      expect(result.chatRoomId).toBe('chat-room-1');
      expect(result.matchedProvider.reputation.averageRating).toBeGreaterThanOrEqual(4.5);
      expect(mockChatRepository.createRoom).toHaveBeenCalledWith({
        requestId: 'req-1',
        clientId: 'profile-client-1',
        providerId: 'profile-provider-1',
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_AUTO_MATCHED' }),
      );
    });

    it('deve lançar NotFoundException se nenhum prestador ativo for encontrado', async () => {
      mockRepository.findProfileByIdOrUserId.mockResolvedValue(mockClientProfile);
      mockRepository.findCandidatesForAutoMatch.mockResolvedValue([]);

      const dto = {
        serviceQuery: 'Acrobata Subaquático',
        description: 'Serviço inexistente',
        location: 'Luanda',
      };

      await expect(
        service.autoMatchAndBook(dto, mockClientUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('acceptRequest', () => {
    it('deve permitir ao prestador destinatário aceitar a solicitação', async () => {
      mockRepository.findById.mockResolvedValue(mockRequest);
      mockRepository.update.mockResolvedValue({
        ...mockRequest,
        status: 'accepted',
      });

      const result = await service.acceptRequest('req-1', mockProviderUser);

      expect(result.message).toContain('aceite com sucesso');
      expect(result.request.status).toBe('accepted');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_ACCEPTED' }),
      );
    });

    it('deve impedir que outro utilizador aceite a solicitação', async () => {
      mockRepository.findById.mockResolvedValue(mockRequest);

      await expect(
        service.acceptRequest('req-1', mockOtherUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rejectRequest', () => {
    it('deve permitir ao prestador rejeitar com motivo', async () => {
      mockRepository.findById.mockResolvedValue(mockRequest);
      mockRepository.update.mockResolvedValue({
        ...mockRequest,
        status: 'rejected',
        cancelReason: 'Indisponibilidade de agenda',
      });

      const result = await service.rejectRequest(
        'req-1',
        'Indisponibilidade de agenda',
        mockProviderUser,
      );

      expect(result.message).toContain('rejeitada');
      expect(result.request.status).toBe('rejected');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_REJECTED' }),
      );
    });
  });

  describe('cancelRequest', () => {
    it('deve permitir ao cliente cancelar o seu pedido', async () => {
      mockRepository.findById.mockResolvedValue(mockRequest);
      mockRepository.update.mockResolvedValue({
        ...mockRequest,
        status: 'cancelled',
      });

      const result = await service.cancelRequest(
        'req-1',
        'Não preciso mais',
        mockClientUser,
      );

      expect(result.message).toContain('cancelada com sucesso');
      expect(result.request.status).toBe('cancelled');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_CANCELLED' }),
      );
    });
  });

  describe('completeRequest', () => {
    it('deve permitir ao prestador concluir um serviço previamente aceite', async () => {
      mockRepository.findById.mockResolvedValue({
        ...mockRequest,
        status: 'accepted',
      });
      mockRepository.update.mockResolvedValue({
        ...mockRequest,
        status: 'completed',
      });

      const result = await service.completeRequest('req-1', mockProviderUser);

      expect(result.message).toContain('concluído com sucesso');
      expect(result.request.status).toBe('completed');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUEST_COMPLETED' }),
      );
    });

    it('deve impedir a conclusão de um serviço que ainda está pendente', async () => {
      mockRepository.findById.mockResolvedValue(mockRequest); // status: pending

      await expect(
        service.completeRequest('req-1', mockProviderUser),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
