import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AdminUsersService } from './admin-users.service.js';
import { Role, UserStatus } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let mockAdminUsersRepository: any;
  let mockAuditService: any;
  let mockRedisService: any;

  const mockAdmin: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@autonomous.ao',
    role: Role.ADMIN,
    name: 'Super Administrador',
  };

  const mockClientUser = {
    id: 'user-client-1',
    email: 'cliente@teste.ao',
    passwordHash: '$2a$12$hashedpassword',
    name: 'Cliente Teste',
    phone: '+244923000111',
    role: Role.CLIENT,
    status: UserStatus.ACTIVE,
    profile: { id: 'prof-1', role: 'client' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockOtherAdmin = {
    id: 'admin-2',
    email: 'outro.admin@autonomous.ao',
    passwordHash: '$2a$12$hashedpassword',
    name: 'Outro Admin',
    role: Role.ADMIN,
    status: UserStatus.ACTIVE,
    profile: { id: 'prof-admin-2', role: 'admin' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockAdminUsersRepository = {
      findMany: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      updateStatus: vi.fn(),
      deleteUser: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    mockRedisService = {
      del: vi.fn().mockResolvedValue(1),
    };

    service = new AdminUsersService(
      mockAdminUsersRepository,
      mockAuditService,
      mockRedisService,
    );
  });

  describe('listUsers', () => {
    it('deve listar utilizadores com paginação e omitir passwordHash', async () => {
      mockAdminUsersRepository.findMany.mockResolvedValue({
        users: [mockClientUser],
        total: 1,
      });

      const result = await service.listUsers({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).passwordHash).toBeUndefined();
      expect(result.data[0].id).toBe('user-client-1');
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(mockAdminUsersRepository.findMany).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        role: undefined,
        status: undefined,
        search: undefined,
      });
    });
  });

  describe('getUserById', () => {
    it('deve retornar utilizador quando existir', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockClientUser);

      const result = await service.getUserById('user-client-1');

      expect(result.id).toBe('user-client-1');
      expect((result as any).passwordHash).toBeUndefined();
    });

    it('deve lançar NotFoundException quando utilizador não existir', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(null);

      await expect(service.getUserById('inexistente')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createUser', () => {
    it('deve criar um utilizador com sucesso e registar auditoria', async () => {
      mockAdminUsersRepository.findByEmail.mockResolvedValue(null);
      mockAdminUsersRepository.createUser.mockResolvedValue(mockClientUser);

      const dto = {
        name: 'Cliente Teste',
        email: 'cliente@teste.ao',
        password: 'Password123#',
        role: Role.CLIENT,
      };

      const result = await service.createUser(dto, mockAdmin, '192.168.1.10');

      expect(result.id).toBe('user-client-1');
      expect((result as any).passwordHash).toBeUndefined();
      expect(mockAdminUsersRepository.createUser).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'ADMIN_USER_CREATED',
          entity: 'User',
        }),
      );
    });

    it('deve lançar ConflictException se email já estiver registado', async () => {
      mockAdminUsersRepository.findByEmail.mockResolvedValue(mockClientUser);

      const dto = {
        name: 'Cliente Teste',
        email: 'cliente@teste.ao',
        password: 'Password123#',
        role: Role.CLIENT,
      };

      await expect(service.createUser(dto, mockAdmin)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lançar BadRequestException se tentar criar conta com perfil ADMIN', async () => {
      mockAdminUsersRepository.findByEmail.mockResolvedValue(null);

      const dto = {
        name: 'Novo Admin',
        email: 'novo.admin@teste.ao',
        password: 'Password123#',
        role: Role.ADMIN,
      };

      await expect(service.createUser(dto, mockAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updateStatus', () => {
    it('deve alterar o status para SUSPENDED, revogar token no Redis e gravar auditoria', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockClientUser);
      mockAdminUsersRepository.updateStatus.mockResolvedValue({
        ...mockClientUser,
        status: UserStatus.SUSPENDED,
      });

      const result = await service.updateStatus(
        'user-client-1',
        { status: UserStatus.SUSPENDED, reason: 'Suspeita de fraude' },
        mockAdmin,
        '10.0.0.1',
      );

      expect(result.message).toContain('suspensa com sucesso');
      expect(result.user.status).toBe(UserStatus.SUSPENDED);
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:refresh:user-client-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          action: 'ADMIN_USER_STATUS_UPDATED',
          details: expect.objectContaining({
            previousStatus: UserStatus.ACTIVE,
            newStatus: UserStatus.SUSPENDED,
            reason: 'Suspeita de fraude',
          }),
        }),
      );
    });

    it('deve impedir que o administrador altere o status da sua própria conta', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue({
        ...mockClientUser,
        id: 'admin-1',
      });

      await expect(
        service.updateStatus(
          'admin-1',
          { status: UserStatus.INACTIVE },
          mockAdmin,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve impedir a alteração de status de outra conta de administrador', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockOtherAdmin);

      await expect(
        service.updateStatus(
          'admin-2',
          { status: UserStatus.SUSPENDED },
          mockAdmin,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Ações Expressas (activateUser, blockUser, suspendUser)', () => {
    it('activateUser deve ativar a conta do utilizador', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue({
        ...mockClientUser,
        status: UserStatus.INACTIVE,
      });
      mockAdminUsersRepository.updateStatus.mockResolvedValue({
        ...mockClientUser,
        status: UserStatus.ACTIVE,
      });

      const result = await service.activateUser(
        'user-client-1',
        'Conta regularizada',
        mockAdmin,
      );

      expect(result.message).toContain('ativada com sucesso');
      expect(result.user.status).toBe(UserStatus.ACTIVE);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_USER_ACTIVATED' }),
      );
    });

    it('blockUser deve bloquear conta e revogar sessão no Redis', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockClientUser);
      mockAdminUsersRepository.updateStatus.mockResolvedValue({
        ...mockClientUser,
        status: UserStatus.INACTIVE,
      });

      const result = await service.blockUser(
        'user-client-1',
        'Bloqueio preventivo',
        mockAdmin,
      );

      expect(result.message).toContain('bloqueada com sucesso');
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:refresh:user-client-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_USER_BLOCKED' }),
      );
    });

    it('suspendUser deve suspender conta e revogar sessão no Redis', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockClientUser);
      mockAdminUsersRepository.updateStatus.mockResolvedValue({
        ...mockClientUser,
        status: UserStatus.SUSPENDED,
      });

      const result = await service.suspendUser(
        'user-client-1',
        'Violação de regras',
        mockAdmin,
      );

      expect(result.message).toContain('suspensa com sucesso');
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:refresh:user-client-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_USER_SUSPENDED' }),
      );
    });
  });

  describe('deleteUser', () => {
    it('deve eliminar o utilizador com sucesso', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockClientUser);
      mockAdminUsersRepository.deleteUser.mockResolvedValue(undefined);

      const result = await service.deleteUser('user-client-1', mockAdmin);

      expect(result.message).toContain('removido do sistema com sucesso');
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:refresh:user-client-1');
      expect(mockAdminUsersRepository.deleteUser).toHaveBeenCalledWith('user-client-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ADMIN_USER_DELETED' }),
      );
    });

    it('deve impedir que o administrador elimine a sua própria conta', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue({
        ...mockClientUser,
        id: 'admin-1',
      });

      await expect(service.deleteUser('admin-1', mockAdmin)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deve impedir a exclusão de outra conta de administrador', async () => {
      mockAdminUsersRepository.findById.mockResolvedValue(mockOtherAdmin);

      await expect(service.deleteUser('admin-2', mockAdmin)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
