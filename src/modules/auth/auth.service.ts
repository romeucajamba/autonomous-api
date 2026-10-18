import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { SmsService } from '../../infra/sms/sms.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CryptoUtils } from '../../common/utils/crypto.utils.js';
import { RegisterDto } from './dto/register.dto.js';
import { RegisterProviderDto } from './dto/register-provider.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ActivateAccountDto } from './dto/activate-account.dto.js';
import { ResendActivationCodeDto } from './dto/resend-activation-code.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { Role, UserStatus } from '../../generated/prisma/client.js';
import { AuthTokens, JwtPayload } from '../../common/types/jwt-payload.type.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly accessExpiration: string;
  private readonly refreshExpiration: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
    private readonly smsService: SmsService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      'super_secret_jwt_key_at_least_32_characters_long';
    this.accessExpiration =
      this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m';
    this.refreshExpiration =
      this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
  }

  /**
   * Registo de Cliente (Requer ativação por código SMS de 6 dígitos)
   */
  async register(dto: RegisterDto, ipAddress?: string) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Já existe uma conta associada a este endereço de email.');
    }

    if (dto.phone) {
      const existingPhone = await this.usersService.findByPhone(dto.phone);
      if (existingPhone) {
        throw new ConflictException('Já existe uma conta associada a este número de telemóvel.');
      }
    }

    const passwordHash = await CryptoUtils.hashPassword(dto.password);

    // Cliente inicia com PENDING_VERIFICATION para ativação obrigatória via SMS
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      role: Role.CLIENT,
      status: UserStatus.PENDING_VERIFICATION,
      profileRole: 'client',
    });

    // Enviar código OTP de 6 dígitos por SMS via Ombala
    await this.generateAndSendOtp(user.id, user.phone, user.name);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_REGISTER_CLIENT',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email, role: user.role, name: user.name, phone: user.phone },
      ipAddress,
    });

    const { passwordHash: _, ...safeUser } = user;
    return {
      message:
        'Registo efetuado com sucesso! Enviámos um código de ativação de 6 dígitos por SMS para o seu telemóvel.',
      requiresActivation: true,
      user: safeUser,
    };
  }

  /**
   * Registo de Prestador de Serviços (Requer ativação por código SMS de 6 dígitos)
   */
  async registerProvider(dto: RegisterProviderDto, ipAddress?: string) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Já existe uma conta associada a este endereço de email.');
    }

    const existingPhone = await this.usersService.findByPhone(dto.phone);
    if (existingPhone) {
      throw new ConflictException('Já existe uma conta associada a este número de telemóvel.');
    }

    const passwordHash = await CryptoUtils.hashPassword(dto.password);

    // Prestador inicia com PENDING_VERIFICATION para ativação obrigatória via SMS
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      role: Role.PROVIDER,
      status: UserStatus.PENDING_VERIFICATION,
      profileRole: 'professional',
      workArea: dto.workArea,
      bio: dto.bio,
    });

    // Enviar código OTP de 6 dígitos por SMS via Ombala
    await this.generateAndSendOtp(user.id, user.phone, user.name);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_REGISTER_PROVIDER',
      entity: 'User',
      entityId: user.id,
      details: {
        email: user.email,
        role: user.role,
        name: user.name,
        phone: user.phone,
        workArea: dto.workArea,
      },
      ipAddress,
    });

    const { passwordHash: _, ...safeUser } = user;
    return {
      message:
        'Registo de prestador efetuado com sucesso! Enviámos um código de ativação de 6 dígitos por SMS para o seu telemóvel.',
      requiresActivation: true,
      user: safeUser,
    };
  }

  /**
   * Ativação de conta com código SMS de 6 dígitos
   */
  async activateAccount(dto: ActivateAccountDto, ipAddress?: string) {
    const user = await this.usersService.findByPhoneOrEmail(dto.phoneOrEmail);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado com o telefone ou email informado.');
    }

    if (user.status === UserStatus.ACTIVE) {
      return {
        message: 'A sua conta já se encontra ativa. Pode iniciar sessão normalmente.',
        alreadyActive: true,
      };
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('A sua conta está suspensa. Por favor, contacte o suporte.');
    }

    const redisKey = `auth:sms_otp:${user.id}`;
    const otpDataStr = await this.redisService.get<string>(redisKey);

    if (!otpDataStr) {
      throw new BadRequestException(
        'O código de ativação expirou ou não existe. Por favor, solicite o reenvio de um novo código.',
      );
    }

    let otpData: { code: string; attempts: number };
    try {
      otpData = JSON.parse(otpDataStr);
    } catch {
      otpData = { code: otpDataStr, attempts: 0 };
    }

    // Validação contra força bruta (máximo de 5 tentativas)
    if (otpData.code !== dto.code.trim()) {
      otpData.attempts = (otpData.attempts || 0) + 1;
      if (otpData.attempts >= 5) {
        await this.redisService.del(redisKey);
        this.logger.warn(
          `[SECURITY] Excedido o número máximo de tentativas de código OTP para o utilizador ${user.id} | IP: ${ipAddress || 'unknown'}`,
        );
        throw new BadRequestException(
          'Excedeu o número máximo de tentativas inválidas. O código foi invalidado. Por favor, solicite o reenvio de um novo código.',
        );
      }
      await this.redisService.set(redisKey, JSON.stringify(otpData), 600);
      throw new BadRequestException('Código de ativação incorreto.');
    }

    // Código válido: remove o OTP do Redis
    await this.redisService.del(redisKey);

    // Ativa o utilizador na base de dados
    const activatedUser = await this.usersService.activateUser(user.id);

    // Gera os tokens de acesso e refresh para autenticação imediata
    const tokens = await this.generateTokens(
      activatedUser.id,
      activatedUser.email,
      activatedUser.role,
      user.profile?.id,
      activatedUser.name,
    );
    await this.storeRefreshToken(activatedUser.id, tokens.refreshToken);

    await this.auditService.log({
      userId: activatedUser.id,
      action: 'AUTH_ACCOUNT_ACTIVATED_BY_SMS',
      entity: 'User',
      entityId: activatedUser.id,
      details: {
        email: activatedUser.email,
        phone: activatedUser.phone,
        role: activatedUser.role,
      },
      ipAddress,
    });

    this.logger.log(
      `[AUTH] Conta ativada com sucesso via SMS OTP para o utilizador ${activatedUser.id} (${activatedUser.email})`,
    );

    const { passwordHash: _, ...safeUser } = { ...user, status: UserStatus.ACTIVE };
    return {
      message: 'Conta ativada com sucesso! A sua sessão foi iniciada.',
      user: safeUser,
      tokens,
    };
  }

  /**
   * Reenvio de código de ativação por SMS
   */
  async resendActivationCode(dto: ResendActivationCodeDto, ipAddress?: string) {
    const user = await this.usersService.findByPhoneOrEmail(dto.phoneOrEmail);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado com o telefone ou email informado.');
    }

    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('A sua conta já se encontra ativa.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('A sua conta está suspensa. Por favor, contacte o suporte.');
    }

    if (!user.phone) {
      throw new BadRequestException(
        'Este utilizador não possui um número de telemóvel associado para receber SMS.',
      );
    }

    // Cooldown de 60 segundos para evitar spam ao gateway de SMS
    const cooldownKey = `auth:sms_cooldown:${user.id}`;
    const inCooldown = await this.redisService.get(cooldownKey);
    if (inCooldown) {
      throw new BadRequestException(
        'Por favor, aguarde 60 segundos antes de solicitar um novo código de ativação por SMS.',
      );
    }

    // Gera novo código e envia
    await this.generateAndSendOtp(user.id, user.phone, user.name);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_RESEND_SMS_ACTIVATION',
      entity: 'User',
      entityId: user.id,
      details: {
        phone: user.phone,
        email: user.email,
      },
      ipAddress,
    });

    return {
      message: 'Novo código de ativação de 6 dígitos enviado por SMS com sucesso.',
      phone: user.phone,
    };
  }

  /**
   * Gera código OTP criptograficamente seguro e envia por SMS via Ombala
   */
  private async generateAndSendOtp(
    userId: string,
    phone?: string | null,
    name?: string,
  ): Promise<string> {
    if (!phone) {
      this.logger.warn(`Utilizador ${userId} não possui número de telemóvel para envio de SMS OTP.`);
      return '';
    }

    // Código numérico de 6 dígitos criptograficamente seguro (100000 - 999999)
    const code = crypto.randomInt(100000, 1000000).toString();

    // Armazenar no Redis com TTL de 10 minutos (600s)
    const redisKey = `auth:sms_otp:${userId}`;
    await this.redisService.set(redisKey, JSON.stringify({ code, attempts: 0 }), 600);

    // Cooldown de 60 segundos
    const cooldownKey = `auth:sms_cooldown:${userId}`;
    await this.redisService.set(cooldownKey, '1', 60);

    // Enviar SMS através do Gateway Ombala
    await this.smsService.sendActivationCode(phone, code);

    this.logger.log(
      `[SMS_OTP] Código OTP de ativação enviado com sucesso para ${phone} (Utilizador ID: ${userId})`,
    );
    return code;
  }

  /**
   * Autenticação / Login
   */
  async login(dto: LoginDto, ipAddress?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await this.auditService.log({
        action: 'AUTH_LOGIN_FAILED',
        entity: 'User',
        details: { email: dto.email, reason: 'Utilizador não encontrado' },
        ipAddress,
      });
      throw new UnauthorizedException('Credenciais de acesso inválidas.');
    }

    const isPasswordValid = await CryptoUtils.comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
        details: { email: dto.email, reason: 'Senha incorreta' },
        ipAddress,
      });
      throw new UnauthorizedException('Credenciais de acesso inválidas.');
    }

    // Bloqueia utilizadores com verificação de conta pendente (menos admin, que já é criado ativo)
    if (user.status === UserStatus.PENDING_VERIFICATION) {
      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        entity: 'User',
        entityId: user.id,
        details: {
          email: dto.email,
          status: user.status,
          reason: 'Conta pendente de ativação por SMS',
        },
        ipAddress,
      });
      throw new ForbiddenException(
        'A sua conta está pendente de ativação por SMS. Por favor, confirme o código de 6 dígitos enviado para o seu telemóvel.',
      );
    }

    if (user.status === UserStatus.SUSPENDED) {
      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        entity: 'User',
        entityId: user.id,
        details: { email: dto.email, status: user.status },
        ipAddress,
      });
      throw new ForbiddenException('A sua conta foi suspensa. Por favor, contacte o suporte.');
    }

    if (user.status === UserStatus.INACTIVE) {
      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_LOGIN_BLOCKED',
        entity: 'User',
        entityId: user.id,
        details: { email: dto.email, status: user.status },
        ipAddress,
      });
      throw new ForbiddenException('A sua conta encontra-se inativa.');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role, user.profile?.id, user.name);
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email, role: user.role },
      ipAddress,
    });

    const { passwordHash: _, ...safeUser } = user;
    return {
      message: 'Autenticação bem-sucedida.',
      user: safeUser,
      tokens,
    };
  }

  /**
   * Renovação de sessão através de Refresh Token com rotação
   */
  async refreshToken(tokenOrDto: string | RefreshTokenDto, ipAddress?: string) {
    const rawToken =
      typeof tokenOrDto === 'string' ? tokenOrDto : tokenOrDto?.refreshToken;

    if (!rawToken) {
      throw new UnauthorizedException('Refresh token não fornecido.');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(rawToken, {
        secret: this.jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Sessão expirada ou refresh token inválido.');
    }

    // Validar se o refresh token guardado no Redis coincide
    const storedToken = await this.redisService.get<string>(`auth:refresh:${payload.sub}`);
    if (!storedToken || storedToken !== rawToken) {
      this.logger.warn(`Tentativa de reutilização ou token revogado para o utilizador ${payload.sub}`);
      await this.auditService.log({
        userId: payload.sub,
        action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
        entity: 'Session',
        details: { sub: payload.sub, email: payload.email },
        ipAddress,
      });
      throw new UnauthorizedException('Refresh token revogado ou sessão expirada.');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Utilizador não disponível ou conta inativa.');
    }

    // Gerar novo par de tokens (Token Rotation)
    const newTokens = await this.generateTokens(user.id, user.email, user.role, user.profile?.id, user.name);
    await this.storeRefreshToken(user.id, newTokens.refreshToken);

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_TOKEN_REFRESH',
      entity: 'Session',
      ipAddress,
    });

    return {
      message: 'Tokens renovados com sucesso.',
      tokens: newTokens,
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: newTokens.expiresIn,
      tokenType: newTokens.tokenType,
    };
  }

  /**
   * Logout e invalidação do Refresh Token
   */
  async logout(userId: string, ipAddress?: string) {
    await this.redisService.del(`auth:refresh:${userId}`);

    await this.auditService.log({
      userId,
      action: 'AUTH_LOGOUT',
      entity: 'Session',
      ipAddress,
    });

    return {
      message: 'Sessão terminada com sucesso.',
    };
  }

  /**
   * Verifica se o email existe na base de dados para recuperação de conta
   */
  async forgotPassword(dto: ForgotPasswordDto, ipAddress?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(
        `[FORGOT_PASSWORD] Tentativa de recuperação para email inexistente: ${dto.email} | IP: ${ipAddress || 'unknown'}`,
      );

      await this.auditService.log({
        action: 'AUTH_FORGOT_PASSWORD_EMAIL_NOT_FOUND',
        entity: 'User',
        details: { email: dto.email },
        ipAddress,
      });

      throw new NotFoundException('Nenhuma conta associada a este endereço de email foi encontrada.');
    }

    this.logger.log(
      `[FORGOT_PASSWORD] Email verificado com sucesso para recuperação: ${dto.email} (ID: ${user.id}) | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_FORGOT_PASSWORD_EMAIL_VERIFIED',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress,
    });

    return {
      exists: true,
      email: user.email,
      message: 'Endereço de email verificado. Pode agora redefinir a palavra-passe.',
    };
  }

  /**
   * Redefine a palavra-passe do utilizador verificando a existência do email
   */
  async resetPassword(dto: ResetPasswordDto, ipAddress?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      this.logger.warn(
        `[RESET_PASSWORD] Tentativa de redefinição para email inexistente: ${dto.email} | IP: ${ipAddress || 'unknown'}`,
      );

      await this.auditService.log({
        action: 'AUTH_RESET_PASSWORD_FAILED',
        entity: 'User',
        details: { email: dto.email, reason: 'Email não encontrado' },
        ipAddress,
      });

      throw new NotFoundException('Nenhuma conta associada a este endereço de email foi encontrada.');
    }

    if (user.status === UserStatus.SUSPENDED) {
      this.logger.warn(
        `[RESET_PASSWORD] Tentativa de redefinição para conta suspensa: ${dto.email} (ID: ${user.id}) | IP: ${ipAddress || 'unknown'}`,
      );

      await this.auditService.log({
        userId: user.id,
        action: 'AUTH_RESET_PASSWORD_BLOCKED',
        entity: 'User',
        entityId: user.id,
        details: { email: dto.email, status: user.status },
        ipAddress,
      });

      throw new ForbiddenException('A sua conta encontra-se suspensa. Por favor, contacte o suporte.');
    }

    const newPasswordHash = await CryptoUtils.hashPassword(dto.newPassword);
    await this.usersService.updatePassword(user.id, newPasswordHash);

    // Invalida sessões ativas anteriores no Redis para segurança
    await this.redisService.del(`auth:refresh:${user.id}`);

    this.logger.log(
      `[RESET_PASSWORD] Palavra-passe redefinida com sucesso para o utilizador ${user.id} (${user.email}) | Sessões anteriores revogadas | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: user.id,
      action: 'AUTH_PASSWORD_RESET',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email, sessionsRevoked: true },
      ipAddress,
    });

    return {
      message: 'Palavra-passe redefinida com sucesso. Pode agora iniciar sessão com as novas credenciais.',
    };
  }

  /**
   * Geração do par de Access Token + Refresh Token
   */
  private async generateTokens(
    userId: string,
    email: string,
    role: Role,
    profileId?: string,
    name?: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: userId,
      email,
      role,
      profileId,
      name,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.accessExpiration as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.refreshExpiration as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessExpiration,
      tokenType: 'Bearer',
    };
  }

  /**
   * Guarda o refresh token no Redis com TTL de 7 dias (604800 segundos)
   */
  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const sevenDaysInSeconds = 7 * 24 * 60 * 60;
    await this.redisService.set(`auth:refresh:${userId}`, refreshToken, sevenDaysInSeconds);
  }
}
