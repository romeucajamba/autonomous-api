import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { Role, UserStatus } from '../../generated/prisma/client.js';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockRedisService: any;
  let mockSmsService: any;

  beforeEach(() => {
    mockUsersService = {
      findByEmail: vi.fn(),
      findByPhone: vi.fn(),
      findByPhoneOrEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      activateUser: vi.fn(),
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

    mockSmsService = {
      sendActivationCode: vi.fn().mockResolvedValue({ success: true }),
      sendSms: vi.fn().mockResolvedValue({ success: true }),
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
      mockSmsService,
    );
  });

  describe('register', () => {
    it('deve registar um novo cliente com PENDING_VERIFICATION e enviar código OTP por SMS', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByPhone.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        name: 'Carlos Cliente',
        phone: '923000000',
        role: Role.CLIENT,
        status: UserStatus.PENDING_VERIFICATION,
        passwordHash: 'hashed-pass',
        profile: { id: 'prof-123' },
      });

      const result = await authService.register({
        email: 'cliente@teste.ao',
        password: 'Password123!',
        name: 'Carlos Cliente',
        phone: '923000000',
      });

      expect(result.message).toContain('código de ativação de 6 dígitos');
      expect(result.requiresActivation).toBe(true);
      expect(result.user.email).toBe('cliente@teste.ao');
      expect(result.user.status).toBe(UserStatus.PENDING_VERIFICATION);
      expect(mockSmsService.sendActivationCode).toHaveBeenCalledWith('923000000', expect.any(String));
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'auth:sms_otp:usr-123',
        expect.any(String),
        600,
      );
    });

    it('deve lançar ConflictException se o email já estiver registado', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing-id' });

      await expect(
        authService.register({
          email: 'repetido@teste.ao',
          password: 'Password123!',
          name: 'Teste',
          phone: '923111222',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('deve lançar ConflictException se o telemóvel já estiver registado', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByPhone.mockResolvedValue({ id: 'existing-phone-id' });

      await expect(
        authService.register({
          email: 'novo@teste.ao',
          password: 'Password123!',
          name: 'Teste',
          phone: '923111222',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('activateAccount', () => {
    it('deve ativar a conta com sucesso quando o código de 6 dígitos está correto', async () => {
      mockUsersService.findByPhoneOrEmail.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        phone: '923000000',
        name: 'Carlos Cliente',
        role: Role.CLIENT,
        status: UserStatus.PENDING_VERIFICATION,
        profile: { id: 'prof-123' },
      });

      mockRedisService.get.mockResolvedValue(JSON.stringify({ code: '654321', attempts: 0 }));
      mockUsersService.activateUser.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        phone: '923000000',
        name: 'Carlos Cliente',
        role: Role.CLIENT,
        status: UserStatus.ACTIVE,
      });

      const result = await authService.activateAccount({
        phoneOrEmail: '923000000',
        code: '654321',
      });

      expect(result.message).toContain('Conta ativada com sucesso');
      expect(result.tokens?.accessToken).toBe('signed-token-xyz');
      expect(result.user?.status).toBe(UserStatus.ACTIVE);
      expect(mockUsersService.activateUser).toHaveBeenCalledWith('usr-123');
      expect(mockRedisService.del).toHaveBeenCalledWith('auth:sms_otp:usr-123');
    });

    it('deve lançar BadRequestException se o código estiver incorreto', async () => {
      mockUsersService.findByPhoneOrEmail.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        phone: '923000000',
        status: UserStatus.PENDING_VERIFICATION,
      });

      mockRedisService.get.mockResolvedValue(JSON.stringify({ code: '654321', attempts: 0 }));

      await expect(
        authService.activateAccount({
          phoneOrEmail: '923000000',
          code: '000000',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException se o código tiver expirado', async () => {
      mockUsersService.findByPhoneOrEmail.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        phone: '923000000',
        status: UserStatus.PENDING_VERIFICATION,
      });

      mockRedisService.get.mockResolvedValue(null);

      await expect(
        authService.activateAccount({
          phoneOrEmail: '923000000',
          code: '654321',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendActivationCode', () => {
    it('deve reenviar novo código SMS se não estiver em cooldown', async () => {
      mockUsersService.findByPhoneOrEmail.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        phone: '923000000',
        name: 'Carlos Cliente',
        status: UserStatus.PENDING_VERIFICATION,
      });

      mockRedisService.get.mockResolvedValue(null); // Sem cooldown

      const result = await authService.resendActivationCode({
        phoneOrEmail: '923000000',
      });

      expect(result.message).toContain('Novo código de ativação');
      expect(mockSmsService.sendActivationCode).toHaveBeenCalledWith('923000000', expect.any(String));
    });

    it('deve rejeitar reenvio se cooldown de 60s estiver ativo', async () => {
      mockUsersService.findByPhoneOrEmail.mockResolvedValue({
        id: 'usr-123',
        email: 'cliente@teste.ao',
        phone: '923000000',
        status: UserStatus.PENDING_VERIFICATION,
      });

      mockRedisService.get.mockResolvedValue('1'); // Cooldown ativo

      await expect(
        authService.resendActivationCode({
          phoneOrEmail: '923000000',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('deve lançar ForbiddenException se a conta estiver PENDING_VERIFICATION', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'usr-123',
        email: 'pendente@teste.ao',
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz12345678901234567890',
        status: UserStatus.PENDING_VERIFICATION,
      });

      vi.spyOn(authService as any, 'login');

      await expect(
        authService.login({
          email: 'pendente@teste.ao',
          password: 'Password123!',
        }),
      ).rejects.toThrow();
    });

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
