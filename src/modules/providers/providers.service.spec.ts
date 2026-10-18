import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ProvidersService } from './providers.service.js';
import { Role } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let mockRepository: any;
  let mockAuditService: any;

  const mockProviderUser: JwtPayload = {
    sub: 'user-provider-1',
    email: 'prestador@teste.ao',
    role: Role.PROVIDER,
    profileId: 'profile-provider-1',
    name: 'João Prestador',
  };

  const mockOtherProviderUser: JwtPayload = {
    sub: 'user-provider-2',
    email: 'outro.prestador@teste.ao',
    role: Role.PROVIDER,
    profileId: 'profile-provider-2',
    name: 'Outro Prestador',
  };

  const mockAdminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@autonomous.ao',
    role: Role.ADMIN,
    name: 'Administrador',
  };

  const mockClientUser: JwtPayload = {
    sub: 'client-1',
    email: 'cliente@teste.ao',
    role: Role.CLIENT,
    profileId: 'profile-client-1',
    name: 'Cliente Manuel',
  };

  const mockCatalogItem = {
    id: 'item-1',
    providerId: 'profile-provider-1',
    name: 'Reparação Hidráulica',
    description: 'Reparação de canos e torneiras',
    priceAmount: 15000,
    currency: 'AOA',
    imageUrl: 'https://cdn.example.com/item.jpg',
    createdAt: new Date(),
    provider: {
      id: 'profile-provider-1',
      name: 'João Prestador',
      avatarUrl: null,
      workArea: 'Canalização',
      phone: '+244923111222',
      bio: 'Especialista há 10 anos',
      userId: 'user-provider-1',
    },
  };

  beforeEach(() => {
    mockRepository = {
      findCatalogItems: vi.fn(),
      findCatalogItemById: vi.fn(),
      createCatalogItem: vi.fn(),
      updateCatalogItem: vi.fn(),
      deleteCatalogItem: vi.fn(),
      findProviders: vi.fn(),
      findProviderById: vi.fn(),
      findProfileByUserId: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new ProvidersService(mockRepository, mockAuditService);
  });

  describe('createCatalogItem', () => {
    it('deve permitir ao prestador adicionar serviço ao seu próprio catálogo', async () => {
      mockRepository.createCatalogItem.mockResolvedValue(mockCatalogItem);

      const dto = {
        name: 'Reparação Hidráulica',
        priceAmount: 15000,
      };

      const result = await service.createCatalogItem(
        dto,
        mockProviderUser,
        '192.168.1.1',
      );

      expect(result.id).toBe('item-1');
      expect(mockRepository.createCatalogItem).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'profile-provider-1',
          name: 'Reparação Hidráulica',
          priceAmount: 15000,
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SERVICE_CATALOG_CREATED' }),
      );
    });

    it('deve permitir ao ADMIN criar e vincular serviço a um prestador', async () => {
      mockRepository.findProviderById.mockResolvedValue({
        id: 'profile-provider-1',
        name: 'João Prestador',
      });
      mockRepository.createCatalogItem.mockResolvedValue(mockCatalogItem);

      const dto = {
        name: 'Reparação Hidráulica Admin',
        priceAmount: 20000,
        providerId: 'profile-provider-1',
      };

      const result = await service.createCatalogItem(dto, mockAdminUser);

      expect(result.id).toBe('item-1');
      expect(mockRepository.findProviderById).toHaveBeenCalledWith('profile-provider-1');
      expect(mockRepository.createCatalogItem).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'profile-provider-1',
          name: 'Reparação Hidráulica Admin',
        }),
      );
    });

    it('deve lançar BadRequestException se o ADMIN tentar criar sem fornecer providerId', async () => {
      const dto = {
        name: 'Serviço Sem Prestador',
        priceAmount: 10000,
      };

      await expect(service.createCatalogItem(dto, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve lançar ForbiddenException se um cliente tentar criar serviço no catálogo', async () => {
      const dto = {
        name: 'Serviço Proibido',
        priceAmount: 5000,
      };

      await expect(service.createCatalogItem(dto, mockClientUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateCatalogItem', () => {
    it('deve permitir ao prestador dono atualizar o serviço', async () => {
      mockRepository.findCatalogItemById.mockResolvedValue(mockCatalogItem);
      mockRepository.updateCatalogItem.mockResolvedValue({
        ...mockCatalogItem,
        priceAmount: 18000,
      });

      const result = await service.updateCatalogItem(
        'item-1',
        { priceAmount: 18000 },
        mockProviderUser,
      );

      expect(result.priceAmount).toBe(18000);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SERVICE_CATALOG_UPDATED' }),
      );
    });

    it('deve impedir que outro prestador altere o serviço alheio', async () => {
      mockRepository.findCatalogItemById.mockResolvedValue(mockCatalogItem);

      await expect(
        service.updateCatalogItem(
          'item-1',
          { priceAmount: 18000 },
          mockOtherProviderUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('deve permitir ao ADMIN atualizar qualquer serviço', async () => {
      mockRepository.findCatalogItemById.mockResolvedValue(mockCatalogItem);
      mockRepository.updateCatalogItem.mockResolvedValue({
        ...mockCatalogItem,
        name: 'Nome Atualizado pelo Admin',
      });

      const result = await service.updateCatalogItem(
        'item-1',
        { name: 'Nome Atualizado pelo Admin' },
        mockAdminUser,
      );

      expect(result.name).toBe('Nome Atualizado pelo Admin');
    });
  });

  describe('deleteCatalogItem', () => {
    it('deve permitir ao dono eliminar o seu serviço', async () => {
      mockRepository.findCatalogItemById.mockResolvedValue(mockCatalogItem);
      mockRepository.deleteCatalogItem.mockResolvedValue(mockCatalogItem);

      const result = await service.deleteCatalogItem('item-1', mockProviderUser);

      expect(result.message).toContain('removido do catálogo com sucesso');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SERVICE_CATALOG_DELETED' }),
      );
    });

    it('deve impedir outro prestador de eliminar o serviço alheio', async () => {
      mockRepository.findCatalogItemById.mockResolvedValue(mockCatalogItem);

      await expect(
        service.deleteCatalogItem('item-1', mockOtherProviderUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listCatalog & Descoberta', () => {
    it('deve listar catálogo de serviços para clientes e administradores', async () => {
      mockRepository.findCatalogItems.mockResolvedValue({
        items: [mockCatalogItem],
        total: 1,
      });

      const result = await service.listCatalog({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Reparação Hidráulica');
    });

    it('deve listar prestadores na descoberta de profissionais', async () => {
      mockRepository.findProviders.mockResolvedValue({
        providers: [mockCatalogItem.provider],
        total: 1,
      });

      const result = await service.listProviders({ page: 1, limit: 10, workArea: 'Canalização' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].workArea).toBe('Canalização');
    });
  });
});
