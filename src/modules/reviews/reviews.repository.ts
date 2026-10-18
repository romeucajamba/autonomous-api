import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Review, Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Buscar dados da solicitação para validação da avaliação
   */
  async findRequestForReview(requestId: string) {
    return this.prisma.request.findUnique({
      where: { id: requestId },
      include: {
        client: true,
        provider: true,
        review: true,
      },
    });
  }

  /**
   * Buscar avaliação já existente pela solicitação
   */
  async findReviewByRequestId(requestId: string): Promise<Review | null> {
    return this.prisma.review.findUnique({
      where: { requestId },
    });
  }

  /**
   * Registar nova avaliação do cliente ao prestador
   */
  async createReview(data: Prisma.ReviewCreateInput): Promise<Review> {
    return this.prisma.review.create({
      data,
      include: {
        client: {
          select: { id: true, name: true, avatarUrl: true },
        },
        provider: {
          select: { id: true, name: true, workArea: true },
        },
      },
    });
  }

  /**
   * Listar avaliações recebidas por um prestador
   */
  async findReviewsByProviderId(providerId: string, skip: number, take: number) {
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { providerId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, name: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.review.count({ where: { providerId } }),
    ]);

    return { reviews, total };
  }

  /**
   * Calcular reputação agregada do prestador (Média de 0 a 5 estrelas e taxa de recomendação)
   */
  async calculateProviderReputation(providerId: string) {
    const aggregations = await this.prisma.review.aggregate({
      where: { providerId },
      _avg: { rating: true },
      _count: { id: true },
    });

    const recommendedCount = await this.prisma.review.count({
      where: {
        providerId,
        wouldRecommend: true,
      },
    });

    const totalReviews = aggregations._count.id;
    const averageRating = aggregations._avg.rating
      ? Number(aggregations._avg.rating.toFixed(1))
      : 5.0; // Padrão 5.0 inicial para novos prestadores
    const recommendationRate =
      totalReviews > 0
        ? Math.round((recommendedCount / totalReviews) * 100)
        : 100;

    return {
      averageRating,
      totalReviews,
      recommendationRate,
    };
  }

  /**
   * Listar avaliações dadas pelo cliente ou recebidas pelo prestador
   */
  async findReviewsForUser(profileId: string, isProvider: boolean) {
    const where: Prisma.ReviewWhereInput = isProvider
      ? { providerId: profileId }
      : { clientId: profileId };

    return this.prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        client: {
          select: { id: true, name: true, avatarUrl: true },
        },
        provider: {
          select: { id: true, name: true, avatarUrl: true, workArea: true },
        },
        request: {
          select: { id: true, serviceName: true, completedAt: true },
        },
      },
    });
  }

  /**
   * Listar todas as avaliações para moderação do Administrador
   */
  async findAllReviewsForAdmin(skip: number, take: number) {
    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: { id: true, name: true, userId: true },
          },
          provider: {
            select: { id: true, name: true, userId: true, workArea: true },
          },
          request: {
            select: { id: true, serviceName: true, status: true },
          },
        },
      }),
      this.prisma.review.count(),
    ]);

    return { reviews, total };
  }
}
