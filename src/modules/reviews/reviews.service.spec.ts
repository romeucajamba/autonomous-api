import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service.js';
import { Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockRepository: any;
  let mockAuditService: any;

  const mockClientUser: JwtPayload = {
    sub: 'user-client-1',
    email: 'cliente@teste.ao',
    role: Role.CLIENT,
    profileId: 'profile-client-1',
    name: 'Cliente Manuel',
  };

  const mockOtherUser: JwtPayload = {
    sub: 'user-other-1',
    email: 'outro@teste.ao',
    role: Role.CLIENT,
    profileId: 'profile-other-1',
    name: 'Outro',
  };

  const mockCompletedRequest = {
    id: 'req-1',
    clientId: 'profile-client-1',
    clientName: 'Cliente Manuel',
    clientAvatarUrl: 'https://cdn.example.com/client.jpg',
    providerId: 'profile-provider-1',
    providerName: 'João Prestador',
    status: 'completed',
    client: { userId: 'user-client-1', name: 'Cliente Manuel' },
    provider: { userId: 'user-provider-1', name: 'João Prestador' },
    review: null,
  };

  const mockReputation = {
    averageRating: 4.8,
    totalReviews: 12,
    recommendationRate: 91.7,
  };

  beforeEach(() => {
    mockRepository = {
      findRequestForReview: vi.fn(),
      createReview: vi.fn(),
      calculateProviderReputation: vi.fn(),
      findReviewsByProviderId: vi.fn(),
      findReviewsForUser: vi.fn(),
      findAllReviewsForAdmin: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new ReviewsService(mockRepository, mockAuditService);
  });

  describe('createReview', () => {
    it('deve submeter avaliação de 0 a 5 estrelas estilo Yango com sucesso para serviço concluído', async () => {
      mockRepository.findRequestForReview.mockResolvedValue(mockCompletedRequest);
      mockRepository.createReview.mockResolvedValue({
        id: 'rev-1',
        requestId: 'req-1',
        rating: 5,
        comment: 'Excelente trabalho e pontualidade exemplar!',
        wellExecuted: true,
        wouldRecommend: true,
        inappropriateBehavior: false,
      });
      mockRepository.calculateProviderReputation.mockResolvedValue(mockReputation);

      const dto = {
        requestId: 'req-1',
        rating: 5,
        comment: 'Excelente trabalho e pontualidade exemplar!',
        wellExecuted: true,
        wouldRecommend: true,
      };

      const result = await service.createReview(dto, mockClientUser, '192.168.1.1');

      expect(result.message).toContain('com sucesso');
      expect(result.review.rating).toBe(5);
      expect(result.providerReputation.averageRating).toBe(4.8);
      expect(mockRepository.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          rating: 5,
          wellExecuted: true,
          wouldRecommend: true,
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REVIEW_SUBMITTED' }),
      );
    });

    it('deve bloquear avaliação se o serviço ainda não estiver concluído', async () => {
      mockRepository.findRequestForReview.mockResolvedValue({
        ...mockCompletedRequest,
        status: 'accepted',
      });

      const dto = {
        requestId: 'req-1',
        rating: 4,
      };

      await expect(service.createReview(dto, mockClientUser)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockRepository.createReview).not.toHaveBeenCalled();
    });

    it('deve impedir avaliação duplicada da mesma solicitação', async () => {
      mockRepository.findRequestForReview.mockResolvedValue({
        ...mockCompletedRequest,
        review: { id: 'rev-existente', rating: 5 },
      });

      const dto = {
        requestId: 'req-1',
        rating: 5,
      };

      await expect(service.createReview(dto, mockClientUser)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.createReview).not.toHaveBeenCalled();
    });

    it('deve impedir que utilizadores que não sejam o cliente contratante avaliem o serviço', async () => {
      mockRepository.findRequestForReview.mockResolvedValue(mockCompletedRequest);

      const dto = {
        requestId: 'req-1',
        rating: 5,
      };

      await expect(service.createReview(dto, mockOtherUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('deve sinalizar alerta de conduta indevida na auditoria se o cliente marcar conduta inapropriada', async () => {
      mockRepository.findRequestForReview.mockResolvedValue(mockCompletedRequest);
      mockRepository.createReview.mockResolvedValue({
        id: 'rev-alerta',
        requestId: 'req-1',
        rating: 1,
        comment: 'Comportamento grosseiro e desrespeitoso',
        inappropriateBehavior: true,
      });
      mockRepository.calculateProviderReputation.mockResolvedValue(mockReputation);

      const dto = {
        requestId: 'req-1',
        rating: 1,
        comment: 'Comportamento grosseiro e desrespeitoso',
        inappropriateBehavior: true,
      };

      await service.createReview(dto, mockClientUser);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ inappropriateBehavior: true }),
        }),
      );
    });
  });

  describe('getProviderReviews', () => {
    it('deve retornar métricas de reputação e avaliações do prestador', async () => {
      mockRepository.calculateProviderReputation.mockResolvedValue(mockReputation);
      mockRepository.findReviewsByProviderId.mockResolvedValue({
        reviews: [{ id: 'rev-1', rating: 5 }],
        total: 1,
      });

      const result = await service.getProviderReviews('profile-provider-1', {
        page: 1,
        limit: 10,
      });

      expect(result.providerId).toBe('profile-provider-1');
      expect(result.reputation.averageRating).toBe(4.8);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('adminListAllReviews', () => {
    it('deve retornar listagem de moderação para administradores', async () => {
      mockRepository.findAllReviewsForAdmin.mockResolvedValue({
        reviews: [{ id: 'rev-1', rating: 5 }],
        total: 1,
      });

      const result = await service.adminListAllReviews({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
