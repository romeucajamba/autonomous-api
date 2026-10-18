import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ServiceCategoryRepository } from './service-category.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { QueryCategoryDto } from './dto/query-category.dto.js';
import { ServiceCategory, Role } from '../../generated/prisma/client.js';

@Injectable()
export class ServiceCategoryService {
  private readonly logger = new Logger(ServiceCategoryService.name);

  constructor(
    private readonly repository: ServiceCategoryRepository,
    private readonly auditService: AuditService,
  ) {}

  private slugify(text: string): string {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove diacríticos/acentos
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9 ]/g, '') // remove caracteres especiais
      .replace(/\s+/g, '-'); // substitui espaços por hífens
  }

  /**
   * Listar categorias com filtros e paginação
   */
  async listCategories(
    query: QueryCategoryDto,
    userRole?: Role,
  ): Promise<{
    data: ServiceCategory[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    // Utilizadores que não são administradores apenas veem categorias ativas
    const isActive = userRole === Role.ADMIN ? query.isActive : true;

    const { items, total } = await this.repository.findMany({
      skip,
      take: limit,
      search: query.search,
      isActive,
    });

    return {
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Obter categoria por ID ou Slug
   */
  async getByIdOrSlug(idOrSlug: string): Promise<ServiceCategory> {
    const category = await this.repository.findByIdOrSlug(idOrSlug);
    if (!category) {
      throw new NotFoundException('Categoria de serviço não encontrada.');
    }
    return category;
  }

  /**
   * Criar categoria de serviço (Exclusivo Admin)
   */
  async createCategory(
    dto: CreateCategoryDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<ServiceCategory> {
    const slug = dto.slug?.trim() || this.slugify(dto.name);

    const existing = await this.repository.findBySlug(slug);
    if (existing) {
      throw new ConflictException(`Já existe uma categoria registada com o slug "${slug}".`);
    }

    const created = await this.repository.create({
      name: dto.name.trim(),
      slug,
      description: dto.description?.trim(),
      icon: dto.icon?.trim(),
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    this.logger.log(
      `[CATEGORY_CREATED] Categoria "${created.name}" (${created.slug}) criada pelo Admin ${adminId} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: adminId,
      action: 'CATEGORY_CREATED',
      entity: 'ServiceCategory',
      entityId: created.id,
      details: {
        name: created.name,
        slug: created.slug,
        isActive: created.isActive,
      },
      ipAddress,
    });

    return created;
  }

  /**
   * Atualizar categoria de serviço (Exclusivo Admin)
   */
  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
    adminId: string,
    ipAddress?: string,
  ): Promise<ServiceCategory> {
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundException('Categoria de serviço não encontrada.');
    }

    let slug = category.slug;
    if (dto.slug && dto.slug !== category.slug) {
      slug = dto.slug.trim();
      const existing = await this.repository.findBySlug(slug);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Já existe outra categoria registada com o slug "${slug}".`);
      }
    } else if (dto.name && !dto.slug && dto.name !== category.name) {
      const generatedSlug = this.slugify(dto.name);
      const existing = await this.repository.findBySlug(generatedSlug);
      if (!existing || existing.id === id) {
        slug = generatedSlug;
      }
    }

    const updated = await this.repository.update(id, {
      name: dto.name !== undefined ? dto.name.trim() : undefined,
      slug,
      description: dto.description !== undefined ? dto.description.trim() : undefined,
      icon: dto.icon !== undefined ? dto.icon.trim() : undefined,
      isActive: dto.isActive !== undefined ? dto.isActive : undefined,
    });

    this.logger.log(
      `[CATEGORY_UPDATED] Categoria ${id} ("${updated.name}") atualizada pelo Admin ${adminId} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: adminId,
      action: 'CATEGORY_UPDATED',
      entity: 'ServiceCategory',
      entityId: id,
      details: {
        previousName: category.name,
        newName: updated.name,
        slug: updated.slug,
        isActive: updated.isActive,
      },
      ipAddress,
    });

    return updated;
  }

  /**
   * Eliminar categoria de serviço (Exclusivo Admin)
   */
  async deleteCategory(
    id: string,
    adminId: string,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const category = await this.repository.findById(id);
    if (!category) {
      throw new NotFoundException('Categoria de serviço não encontrada.');
    }

    await this.repository.delete(id);

    this.logger.log(
      `[CATEGORY_DELETED] Categoria ${id} ("${category.name}") eliminada pelo Admin ${adminId} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: adminId,
      action: 'CATEGORY_DELETED',
      entity: 'ServiceCategory',
      entityId: id,
      details: {
        name: category.name,
        slug: category.slug,
      },
      ipAddress,
    });

    return {
      message: 'Categoria de serviço eliminada com sucesso.',
    };
  }
}
