import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ProviderCatalog, Profile, Prisma } from '../../generated/prisma/client.js';

export interface FindCatalogParams {
  skip: number;
  take: number;
  providerId?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
}

export interface FindProvidersParams {
  skip: number;
  take: number;
  search?: string;
  workArea?: string;
}

@Injectable()
export class ProvidersRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Listar itens do catálogo com filtros e dados do prestador
   */
  async findCatalogItems(params: FindCatalogParams): Promise<{
    items: (ProviderCatalog & {
      provider: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'workArea' | 'phone'>;
    })[];
    total: number;
  }> {
    const where: Prisma.ProviderCatalogWhereInput = {};

    if (params.providerId) {
      where.providerId = params.providerId;
    }

    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (params.minPrice !== undefined || params.maxPrice !== undefined) {
      where.priceAmount = {};
      if (params.minPrice !== undefined) {
        where.priceAmount.gte = params.minPrice;
      }
      if (params.maxPrice !== undefined) {
        where.priceAmount.lte = params.maxPrice;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.providerCatalog.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          provider: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
              workArea: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.providerCatalog.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Buscar um item de catálogo específico pelo ID
   */
  async findCatalogItemById(id: string): Promise<
    | (ProviderCatalog & {
        provider: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'workArea' | 'phone' | 'bio' | 'userId'>;
      })
    | null
  > {
    return this.prisma.providerCatalog.findUnique({
      where: { id },
      include: {
        provider: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            workArea: true,
            phone: true,
            bio: true,
            userId: true,
          },
        },
      },
    });
  }

  /**
   * Criar novo serviço no catálogo de um prestador
   */
  async createCatalogItem(data: {
    providerId: string;
    name: string;
    description?: string;
    priceAmount: number;
    currency?: string;
    imageUrl?: string;
  }): Promise<ProviderCatalog> {
    return this.prisma.providerCatalog.create({
      data: {
        providerId: data.providerId,
        name: data.name.trim(),
        description: data.description?.trim(),
        priceAmount: data.priceAmount,
        currency: data.currency || 'AOA',
        imageUrl: data.imageUrl,
      },
    });
  }

  /**
   * Atualizar serviço de catálogo existente
   */
  async updateCatalogItem(
    id: string,
    data: Prisma.ProviderCatalogUpdateInput,
  ): Promise<ProviderCatalog> {
    return this.prisma.providerCatalog.update({
      where: { id },
      data,
    });
  }

  /**
   * Eliminar serviço do catálogo
   */
  async deleteCatalogItem(id: string): Promise<ProviderCatalog> {
    return this.prisma.providerCatalog.delete({
      where: { id },
    });
  }

  /**
   * Descoberta de prestadores de serviços ativos e aprovados
   */
  async findProviders(params: FindProvidersParams): Promise<{
    providers: (Profile & {
      catalogItems: ProviderCatalog[];
    })[];
    total: number;
  }> {
    const where: Prisma.ProfileWhereInput = {
      role: 'professional',
      approvalStatus: 'approved',
    };

    if (params.workArea) {
      where.workArea = {
        contains: params.workArea.trim(),
        mode: 'insensitive',
      };
    }

    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { bio: { contains: term, mode: 'insensitive' } },
        { workArea: { contains: term, mode: 'insensitive' } },
        { workDescription: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [providers, total] = await Promise.all([
      this.prisma.profile.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: 'asc' },
        include: {
          catalogItems: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      }),
      this.prisma.profile.count({ where }),
    ]);

    return { providers, total };
  }

  /**
   * Obter perfil completo de um prestador por ID de perfil ou ID de utilizador
   */
  async findProviderById(idOrUserId: string): Promise<
    | (Profile & {
        catalogItems: ProviderCatalog[];
      })
    | null
  > {
    const byProfileId = await this.prisma.profile.findUnique({
      where: { id: idOrUserId },
      include: {
        catalogItems: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (byProfileId) return byProfileId;

    return this.prisma.profile.findFirst({
      where: { userId: idOrUserId },
      include: {
        catalogItems: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  /**
   * Buscar perfil pelo ID do utilizador (userId)
   */
  async findProfileByUserId(userId: string): Promise<Profile | null> {
    return this.prisma.profile.findUnique({
      where: { userId },
    });
  }
}
