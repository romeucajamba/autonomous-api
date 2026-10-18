import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { ServiceCategory, Prisma } from '../../generated/prisma/client.js';

export interface FindCategoriesParams {
  skip: number;
  take: number;
  search?: string;
  isActive?: boolean;
}

@Injectable()
export class ServiceCategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: FindCategoriesParams): Promise<{
    items: ServiceCategory[];
    total: number;
  }> {
    const where: Prisma.ServiceCategoryWhereInput = {};

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.serviceCategory.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.serviceCategory.count({ where }),
    ]);

    return { items, total };
  }

  async findById(id: string): Promise<ServiceCategory | null> {
    return this.prisma.serviceCategory.findUnique({
      where: { id },
    });
  }

  async findBySlug(slug: string): Promise<ServiceCategory | null> {
    return this.prisma.serviceCategory.findUnique({
      where: { slug },
    });
  }

  async findByIdOrSlug(idOrSlug: string): Promise<ServiceCategory | null> {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        idOrSlug,
      );

    if (isUuid) {
      const byId = await this.findById(idOrSlug);
      if (byId) return byId;
    }

    return this.findBySlug(idOrSlug);
  }

  async create(data: Prisma.ServiceCategoryCreateInput): Promise<ServiceCategory> {
    return this.prisma.serviceCategory.create({
      data,
    });
  }

  async update(
    id: string,
    data: Prisma.ServiceCategoryUpdateInput,
  ): Promise<ServiceCategory> {
    return this.prisma.serviceCategory.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<ServiceCategory> {
    return this.prisma.serviceCategory.delete({
      where: { id },
    });
  }
}
