import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Request, Profile, Prisma } from '../../generated/prisma/client.js';

export interface FindRequestsParams {
  skip: number;
  take: number;
  clientId?: string;
  providerId?: string;
  status?: string;
}

@Injectable()
export class BookingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listar solicitações de serviço com paginação e filtros
   */
  async findMany(params: FindRequestsParams): Promise<{
    items: (Request & {
      client: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'phone' | 'userId'>;
      provider: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'phone' | 'workArea' | 'userId'>;
    })[];
    total: number;
  }> {
    const where: Prisma.RequestWhereInput = {};

    if (params.clientId) {
      where.clientId = params.clientId;
    }

    if (params.providerId) {
      where.providerId = params.providerId;
    }

    if (params.status) {
      where.status = params.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          client: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              phone: true,
              userId: true,
            },
          },
          provider: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              phone: true,
              workArea: true,
              userId: true,
            },
          },
        },
      }),
      this.prisma.request.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Buscar detalhes de uma solicitação específica pelo ID
   */
  async findById(id: string): Promise<
    | (Request & {
        client: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'phone' | 'userId'>;
        provider: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'phone' | 'workArea' | 'userId'>;
      })
    | null
  > {
    return this.prisma.request.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            phone: true,
            userId: true,
          },
        },
        provider: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            phone: true,
            workArea: true,
            userId: true,
          },
        },
      },
    });
  }

  /**
   * Criar nova solicitação de serviço
   */
  async create(data: Prisma.RequestCreateInput): Promise<Request> {
    return this.prisma.request.create({
      data,
    });
  }

  /**
   * Atualizar dados ou status de uma solicitação
   */
  async update(id: string, data: Prisma.RequestUpdateInput): Promise<Request> {
    return this.prisma.request.update({
      where: { id },
      data,
    });
  }

  /**
   * Buscar perfil pelo ID do perfil ou ID de utilizador
   */
  async findProfileByIdOrUserId(idOrUserId: string): Promise<Profile | null> {
    const byId = await this.prisma.profile.findUnique({
      where: { id: idOrUserId },
    });
    if (byId) return byId;

    return this.prisma.profile.findFirst({
      where: { userId: idOrUserId },
    });
  }

  /**
   * Buscar prestadores candidatos para auto-matching inteligente
   */
  async findCandidatesForAutoMatch(serviceQuery: string) {
    const term = serviceQuery.trim();

    return this.prisma.profile.findMany({
      where: {
        role: 'professional',
        approvalStatus: 'approved',
        user: {
          status: 'ACTIVE',
        },
        OR: [
          { workArea: { contains: term, mode: 'insensitive' } },
          { workDescription: { contains: term, mode: 'insensitive' } },
          {
            catalogItems: {
              some: {
                name: { contains: term, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      include: {
        catalogItems: {
          where: {
            name: { contains: term, mode: 'insensitive' },
          },
          take: 3,
        },
        reviewsReceived: {
          select: {
            rating: true,
            wouldRecommend: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            status: true,
          },
        },
      },
    });
  }
}
