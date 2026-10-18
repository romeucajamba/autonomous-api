import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { ServiceCategoryService } from './service-category.service.js';
import { Role } from '../../generated/prisma/client.js';

describe('ServiceCategoryService', () => {
  let service: ServiceCategoryService;
  let mockRepository: any;
  let mockAuditService: any;

  const mockCategory = {
    id: 'cat-1',
    slug: 'canalizacao',
    name: 'Canalização',
    description: 'Serviços de canalização e desentupimento',
    icon: 'wrench',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRepository = {
      findMany: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      findByIdOrSlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    service = new ServiceCategoryService(mockRepository, mockAuditService);
  });

  describe('listCategories', () => {
    it('deve listar categorias forçando isActive: true para não-admins', async () => {
      mockRepository.findMany.mockResolvedValue({
        items: [mockCategory],
        total: 1,
      });

      const result = await service.listCategories({ page: 1, limit: 10 }, Role.CLIENT);

      expect(result.data).toHaveLength(1);
      expect(mockRepository.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        search: undefined,
        isActive: true,
      });
    });

    it('deve permitir ao admin filtrar por status inativo', async () => {
      mockRepository.findMany.mockResolvedValue({
        items: [mockCategory],
        total: 1,
      });

      await service.listCategories({ page: 1, limit: 10, isActive: false }, Role.ADMIN);

      expect(mockRepository.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        search: undefined,
        isActive: false,
      });
    });
  });

  describe('getByIdOrSlug', () => {
    it('deve retornar categoria quando encontrada', async () => {
      mockRepository.findByIdOrSlug.mockResolvedValue(mockCategory);

      const result = await service.getByIdOrSlug('canalizacao');

      expect(result.id).toBe('cat-1');
      expect(result.slug).toBe('canalizacao');
    });

    it('deve lançar NotFoundException quando não encontrada', async () => {
      mockRepository.findByIdOrSlug.mockResolvedValue(null);

      await expect(service.getByIdOrSlug('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createCategory', () => {
    it('deve criar categoria com sucesso e registar auditoria', async () => {
      mockRepository.findBySlug.mockResolvedValue(null);
      mockRepository.create.mockResolvedValue(mockCategory);

      const result = await service.createCategory(
        { name: 'Canalização' },
        'admin-1',
        '127.0.0.1',
      );

      expect(result.id).toBe('cat-1');
      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Canalização', slug: 'canalizacao' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CATEGORY_CREATED', userId: 'admin-1' }),
      );
    });

    it('deve lançar ConflictException se slug já existir', async () => {
      mockRepository.findBySlug.mockResolvedValue(mockCategory);

      await expect(
        service.createCategory({ name: 'Canalização' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateCategory', () => {
    it('deve atualizar categoria com sucesso', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);
      mockRepository.update.mockResolvedValue({
        ...mockCategory,
        name: 'Canalização Residencial',
      });

      const result = await service.updateCategory(
        'cat-1',
        { name: 'Canalização Residencial' },
        'admin-1',
      );

      expect(result.name).toBe('Canalização Residencial');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CATEGORY_UPDATED' }),
      );
    });
  });

  describe('deleteCategory', () => {
    it('deve eliminar categoria com sucesso', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);
      mockRepository.delete.mockResolvedValue(mockCategory);

      const result = await service.deleteCategory('cat-1', 'admin-1');

      expect(result.message).toContain('eliminada com sucesso');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CATEGORY_DELETED' }),
      );
    });
  });
});
