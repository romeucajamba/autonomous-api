import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ProvidersRepository } from './providers.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';
import { QueryCatalogDto } from './dto/query-catalog.dto.js';
import { QueryProvidersDto } from './dto/query-providers.dto.js';
import { Role, ProviderCatalog, Profile } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly repository: ProvidersRepository,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Listar todos os serviços de catálogo com filtros de busca e preço (Acessível a Clientes e Admins)
   */
  async listCatalog(query: QueryCatalogDto): Promise<{
    data: (ProviderCatalog & {
      provider: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'workArea' | 'phone'>;
    })[];
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

    let providerId = query.providerId;
    if (providerId) {
      const p = await this.repository.findProviderById(providerId);
      if (p) providerId = p.id;
    }

    const { items, total } = await this.repository.findCatalogItems({
      skip,
      take: limit,
      providerId,
      search: query.search,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
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
   * Obter detalhes de um item específico do catálogo
   */
  async getCatalogItemById(id: string): Promise<
    ProviderCatalog & {
      provider: Pick<Profile, 'id' | 'name' | 'avatarUrl' | 'workArea' | 'phone' | 'bio'>;
    }
  > {
    const item = await this.repository.findCatalogItemById(id);
    if (!item) {
      throw new NotFoundException('Serviço de catálogo não encontrado.');
    }
    return item;
  }

  /**
   * Criar serviço de catálogo (Prestador cria para si; Admin cria e vincula a um prestador)
   */
  async createCatalogItem(
    dto: CreateCatalogItemDto,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<ProviderCatalog> {
    let targetProviderProfileId: string;

    if (currentUser.role === Role.ADMIN) {
      if (!dto.providerId) {
        throw new BadRequestException(
          'O administrador deve especificar o ID do prestador (providerId) a quem vincular este serviço.',
        );
      }
      const provider = await this.repository.findProviderById(dto.providerId);
      if (!provider) {
        throw new NotFoundException('Prestador de serviços indicado não foi encontrado.');
      }
      targetProviderProfileId = provider.id;
    } else if (currentUser.role === Role.PROVIDER) {
      let profileId = currentUser.profileId;
      if (!profileId) {
        const profile = await this.repository.findProfileByUserId(currentUser.sub);
        profileId = profile?.id;
      }
      if (!profileId) {
        throw tropicalProviderNotFound();
      }
      targetProviderProfileId = profileId;
    } else {
      throw new ForbiddenException(
        'Apenas prestadores de serviços e administradores têm permissão para adicionar serviços ao catálogo.',
      );
    }

    const created = await this.repository.createCatalogItem({
      providerId: targetProviderProfileId,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      priceAmount: dto.priceAmount,
      currency: dto.currency || 'AOA',
      imageUrl: dto.imageUrl,
    });

    this.logger.log(
      `[SERVICE_CREATED] Serviço "${created.name}" (${created.priceAmount} AOA) criado e vinculado ao Prestador ${targetProviderProfileId} por ${currentUser.sub} (${currentUser.role}) | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'SERVICE_CATALOG_CREATED',
      entity: 'ProviderCatalog',
      entityId: created.id,
      details: {
        name: created.name,
        priceAmount: created.priceAmount,
        currency: created.currency,
        providerId: targetProviderProfileId,
        creatorRole: currentUser.role,
      },
      ipAddress,
    });

    return created;
  }

  /**
   * Atualizar serviço de catálogo (Prestador dono ou Admin)
   */
  async updateCatalogItem(
    id: string,
    dto: UpdateCatalogItemDto,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<ProviderCatalog> {
    const item = await this.repository.findCatalogItemById(id);
    if (!item) {
      throw new NotFoundException('Serviço de catálogo não encontrado.');
    }

    // Validação de posse: prestador só pode editar o seu próprio serviço; Admin pode editar qualquer um
    if (currentUser.role !== Role.ADMIN) {
      const isOwner =
        item.provider.userId === currentUser.sub ||
        item.providerId === currentUser.profileId;

      if (!isOwner) {
        throw new ForbiddenException(
          'Acesso negado: não tem permissão para modificar serviços de outro prestador.',
        );
      }
    }

    const updated = await this.repository.updateCatalogItem(id, {
      name: dto.name !== undefined ? dto.name.trim() : undefined,
      description: dto.description !== undefined ? dto.description.trim() : undefined,
      priceAmount: dto.priceAmount !== undefined ? dto.priceAmount : undefined,
      currency: dto.currency !== undefined ? dto.currency : undefined,
      imageUrl: dto.imageUrl !== undefined ? dto.imageUrl : undefined,
    });

    this.logger.log(
      `[SERVICE_UPDATED] Serviço ${id} ("${updated.name}") atualizado por ${currentUser.sub} (${currentUser.role}) | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'SERVICE_CATALOG_UPDATED',
      entity: 'ProviderCatalog',
      entityId: id,
      details: {
        previousName: item.name,
        newName: updated.name,
        priceAmount: updated.priceAmount,
        providerId: item.providerId,
      },
      ipAddress,
    });

    return updated;
  }

  /**
   * Eliminar serviço de catálogo (Prestador dono ou Admin)
   */
  async deleteCatalogItem(
    id: string,
    currentUser: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const item = await this.repository.findCatalogItemById(id);
    if (!item) {
      throw new NotFoundException('Serviço de catálogo não encontrado.');
    }

    if (currentUser.role !== Role.ADMIN) {
      const isOwner =
        item.provider.userId === currentUser.sub ||
        item.providerId === currentUser.profileId;

      if (!isOwner) {
        throw new ForbiddenException(
          'Acesso negado: não tem permissão para eliminar serviços de outro prestador.',
        );
      }
    }

    await this.repository.deleteCatalogItem(id);

    this.logger.log(
      `[SERVICE_DELETED] Serviço ${id} ("${item.name}") eliminado por ${currentUser.sub} (${currentUser.role}) | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: currentUser.sub,
      action: 'SERVICE_CATALOG_DELETED',
      entity: 'ProviderCatalog',
      entityId: id,
      details: {
        name: item.name,
        providerId: item.providerId,
      },
      ipAddress,
    });

    return {
      message: 'Serviço removido do catálogo com sucesso.',
    };
  }

  /**
   * Listar catálogo do prestador autenticado
   */
  async getMyCatalog(currentUser: JwtPayload): Promise<ProviderCatalog[]> {
    let profileId = currentUser.profileId;
    if (!profileId) {
      const profile = await this.repository.findProfileByUserId(currentUser.sub);
      profileId = profile?.id;
    }
    if (!profileId) {
      throw tropicalProviderNotFound();
    }

    const { items } = await this.repository.findCatalogItems({
      skip: 0,
      take: 100,
      providerId: profileId,
    });

    return items;
  }

  /**
   * Descoberta de prestadores de serviços (Clientes e Admin)
   */
  async listProviders(query: QueryProvidersDto): Promise<{
    data: (Profile & { catalogItems: ProviderCatalog[] })[];
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

    const { providers, total } = await this.repository.findProviders({
      skip,
      take: limit,
      search: query.search,
      workArea: query.workArea,
    });

    return {
      data: providers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Obter perfil completo de prestador e catálogo
   */
  async getProviderById(id: string): Promise<Profile & { catalogItems: ProviderCatalog[] }> {
    const provider = await this.repository.findProviderById(id);
    if (!provider) {
      throw new NotFoundException('Prestador de serviços não encontrado.');
    }
    return provider;
  }
}

function tropicalProviderNotFound(): NotFoundException {
  return new NotFoundException(
    'Perfil de prestador não encontrado. Certifique-se de que a sua conta de prestador está ativa.',
  );
}
