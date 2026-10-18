import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { Role, UserStatus } from '../../generated/prisma/client.js';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockRedisService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      updatePassword: vi.fn().mockResolvedValue(undefined),
    };

    mockJwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-token-xyz'),
      verifyAsync: vi.fn(),
    };

    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'test-jwt-secret-key-at-least-32-chars';
        if (key === 'JWT_ACCESS_EXPIRATION') return '15m';
        if (key === 'JWT_REFRESH_EXPIRATION') return '7d';
        return null;
      }),
    };

    mockRedisService = {
      set: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
    };

    const mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      mockUsersService,
      mockJwtService,
      mockConfigService,
      mockRedisService,
      mockAuditService as any,
    );
  });

  describe('register', () => {
    it('deve registar um novo cliente com sucesso e devolver tokens', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        name: 'Carlos Cliente',
        phone: '923000000',
        role: Role.CLIENT,
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed-pass',
        profile: { id: 'prof-123' },
      });

      const result = await authService.register({
        email: 'cliente@teste.ao',
        password: 'Password123!',
        name: 'Carlos Cliente',
        phone: '923000000',
      });

      expect(result.message).toBe('Registo efetuado com sucesso.');
      expect(result.user.email).toBe('cliente@teste.ao');
      expect(result.tokens.accessToken).toBe('signed-token-xyz');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('deve lançar ConflictException se o email já estiver registado', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing-id' });

      await expect(
        authService.register({
          email: 'repetido@teste.ao',
          password: 'Password123!',
          name: 'Teste',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('deve lançar UnauthorizedException se as credenciais forem inválidas', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'naoexiste@teste.ao',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('deve renovar os tokens com sucesso quando o refresh token é válido e coincide com o Redis', async () => {
      const validRefreshToken = 'valid-refresh-token';
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'usr-123',
        email: 'user@teste.ao',
        role: Role.CLIENT,
      });

      mockRedisService.get.mockResolvedValue(validRefreshToken);

      mockUsersService.findById.mockResolvedValue({
        id: 'usr-123',
        email: 'user@teste.ao',
        role: Role.CLIENT,
        status: UserStatus.ACTIVE,
        profile: { id: 'prof-123' },
      });

      const result = await authService.refreshToken(validRefreshToken);

      expect(result.message).toBe('Tokens renovados com sucesso.');
      expect(result.tokens.accessToken).toBe('signed-token-xyz');
      expect(result.tokens.refreshToken).toBe('signed-token-xyz');
      expect(result.accessToken).toBe('signed-token-xyz');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('deve lançar UnauthorizedException quando o token JWT é inválido ou expirou', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(authService.refreshToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se o token no Redis for diferente (tentativa de reuso ou revogado)', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'usr-123',
        email: 'user@teste.ao',
      });
      mockRedisService.get.mockResolvedValue('outra-sessao-diferente');

      await expect(authService.refreshToken('token-antigo')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('deve lançar UnauthorizedException se o utilizador não estiver ativo', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'usr-123' });
      mockRedisService.get.mockResolvedValue('token-valido');
      mockUsersService.findById.mockResolvedValue({
        id: 'usr-123',
        status: UserStatus.SUSPENDED,
      });

      await expect(authService.refreshToken('token-valido')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('deve revogar o token no Redis', async () => {
      const result = await authService.logout('usr-123');
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:refresh:usr-123');
      expect(result.message).toBe('Sessão terminada com sucesso.');
    });
  });

  describe('forgotPassword', () => {
    it('deve confirmar a existência do email e autorizar redefinição', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'usr-1',
        email: 'existente@teste.ao',
      });

      const result = await authService.forgotPassword({
        email: 'existente@teste.ao',
      });

      expect(result.exists).toBe(true);
      expect(result.email).toBe('existente@teste.ao');
      expect(result.message).toContain('verificado');
    });

    it('deve lançar NotFoundException se o email não existir', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.forgotPassword({ email: 'inexistente@teste.ao' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPassword', () => {
    it('deve redefinir a palavra-passe com sucesso e invalidar sessões no Redis', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'usr-1',
        email: 'recuperar@teste.ao',
        status: UserStatus.ACTIVE,
      });

      const result = await authService.resetPassword({
        email: 'recuperar@teste.ao',
        newPassword: 'NovaSenhaForte123!',
      });

      expect(result.message).toContain('redefinida com sucesso');
      expect(mockUsersService.updatePassword).toHaveBeenCalled();
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:refresh:usr-1');
    });

    it('deve lançar NotFoundException se o email não existir ao tentar redefinir', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.resetPassword({
          email: 'inexistente@teste.ao',
          newPassword: 'NovaSenhaForte123!',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('deve lançar ForbiddenException se a conta estiver suspensa', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'usr-1',
        email: 'suspenso@teste.ao',
        status: UserStatus.SUSPENDED,
      });

      await expect(
        authService.resetPassword({
          email: 'suspenso@teste.ao',
          newPassword: 'NovaSenhaForte123!',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
