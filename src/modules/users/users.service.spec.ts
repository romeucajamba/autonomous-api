import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersService } from './users.service.js';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Role, UserStatus } from '../../generated/prisma/client.js';
import { CryptoUtils } from '../../common/utils/crypto.utils.js';

describe('UsersService', () => {
  let usersService: UsersService;
  let mockUsersRepository: any;
  let mockAuditService: any;

  beforeEach(() => {
    mockUsersRepository = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      createUserWithProfile: vi.fn(),
      updateProfile: vi.fn(),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    const mockRedisService = {
      del: vi.fn().mockResolvedValue(1),
    };

    usersService = new UsersService(
      mockUsersRepository,
      mockAuditService,
      mockRedisService as any,
    );
  });

  describe('updateProfile', () => {
    it('deve atualizar o perfil e registar log de auditoria', async () => {
      mockUsersRepository.findById.mockResolvedValue({
        id: 'usr-1',
        email: 'user@teste.ao',
        profile: { id: 'prof-1', userId: 'usr-1', name: 'Nome Antigo' },
      });

      mockUsersRepository.updateProfile.mockResolvedValue({
        id: 'prof-1',
        userId: 'usr-1',
        name: 'Nome Atualizado',
        phone: '923111222',
      });

      const result = await usersService.updateProfile('usr-1', {
        name: 'Nome Atualizado',
        phone: '923111222',
      });

      expect(result.name).toBe('Nome Atualizado');
      expect(mockUsersRepository.updateProfile).toHaveBeenCalledWith('usr-1', {
        name: 'Nome Atualizado',
        phone: '923111222',
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          action: 'USER_PROFILE_UPDATED',
        }),
      );
    });

    it('deve lançar NotFoundException se o utilizador não existir', async () => {
      mockUsersRepository.findById.mockResolvedValue(null);

      await expect(
        usersService.updateProfile('usr-999', { name: 'Novo' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('deve atualizar os dados e devolver o utilizador seguro com perfil', async () => {
      mockUsersRepository.findById.mockResolvedValue({
        id: 'usr-1',
        name: 'Carlos Atualizado',
        email: 'carlos@teste.ao',
        passwordHash: 'hash-secreta',
        role: Role.CLIENT,
        status: UserStatus.ACTIVE,
        profile: { id: 'prof-1', name: 'Carlos Atualizado' },
      });

      mockUsersRepository.updateProfile.mockResolvedValue({
        id: 'prof-1',
        name: 'Carlos Atualizado',
      });

      const result = await usersService.updateMe('usr-1', { name: 'Carlos Atualizado' });

      expect(result.name).toBe('Carlos Atualizado');
      expect((result as any).passwordHash).toBeUndefined();
      expect(result.profile?.name).toBe('Carlos Atualizado');
    });
  });

  describe('changePassword', () => {
    it('deve lançar UnauthorizedException se a palavra-passe atual estiver incorreta', async () => {
      const realHash = await CryptoUtils.hashPassword('SenhaCorreta123!');
      mockUsersRepository.findById.mockResolvedValue({
        id: 'usr-1',
        passwordHash: realHash,
      });

      await expect(
        usersService.changePassword('usr-1', {
          currentPassword: 'SenhaErrada!',
          newPassword: 'NovaSenhaSegura123#',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_PASSWORD_CHANGE_FAILED',
        }),
      );
    });

    it('deve atualizar a palavra-passe com sucesso quando a atual coincide', async () => {
      const realHash = await CryptoUtils.hashPassword('SenhaCorreta123!');
      mockUsersRepository.findById.mockResolvedValue({
        id: 'usr-1',
        passwordHash: realHash,
      });

      const result = await usersService.changePassword('usr-1', {
        currentPassword: 'SenhaCorreta123!',
        newPassword: 'NovaSenhaSegura123#',
      });

      expect(result.message).toBe('Palavra-passe alterada com sucesso.');
      expect(mockUsersRepository.updatePassword).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_PASSWORD_CHANGED',
        }),
      );
    });
  });
});
