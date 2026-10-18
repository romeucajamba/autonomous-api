import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { UsersRepository, CreateUserData } from './users.repository.js';
import { User, Profile, Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { CryptoUtils } from '../../common/utils/crypto.utils.js';
import { ChangePasswordDto } from './dtos/change-password.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  async findByEmail(email: string): Promise<(User & { profile: Profile | null }) | null> {
    return this.usersRepository.findByEmail(email);
  }

  async findByPhone(phone: string): Promise<(User & { profile: Profile | null }) | null> {
    return this.usersRepository.findByPhone(phone);
  }

  async findByPhoneOrEmail(identifier: string): Promise<(User & { profile: Profile | null }) | null> {
    return this.usersRepository.findByPhoneOrEmail(identifier);
  }

  async activateUser(userId: string): Promise<User> {
    return this.usersRepository.updateStatus(userId, 'ACTIVE' as any);
  }

  async findById(id: string): Promise<User & { profile: Profile | null }> {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    return user;
  }

  async create(data: CreateUserData): Promise<User & { profile: Profile | null }> {
    return this.usersRepository.createUserWithProfile(data);
  }

  async getProfile(userId: string): Promise<Profile> {
    const user = await this.findById(userId);
    if (!user.profile) {
      throw new NotFoundException('Perfil de utilizador não encontrado.');
    }
    return user.profile;
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    return this.usersRepository.updatePassword(userId, passwordHash);
  }

  async updateProfile(
    userId: string,
    data: Prisma.ProfileUpdateInput,
    ipAddress?: string,
  ): Promise<Profile> {
    await this.findById(userId);
    const updatedProfile = await this.usersRepository.updateProfile(userId, data);

    const changedFields = Object.keys(data).filter(
      (k) => (data as any)[k] !== undefined,
    );

    this.logger.log(
      `[USER_UPDATE] Utilizador ${userId} atualizou o perfil. Campos: [${changedFields.join(', ')}] | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId,
      action: 'USER_PROFILE_UPDATED',
      entity: 'Profile',
      entityId: updatedProfile.id,
      details: {
        updatedFields: changedFields,
      },
      ipAddress,
    });

    return updatedProfile;
  }

  async updateMe(
    userId: string,
    data: Prisma.ProfileUpdateInput,
    ipAddress?: string,
  ): Promise<Omit<User, 'passwordHash'> & { profile: Profile | null }> {
    await this.updateProfile(userId, data, ipAddress);
    const updatedUser = await this.findById(userId);
    const { passwordHash: _, ...safeUser } = updatedUser;
    return safeUser;
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const user = await this.findById(userId);

    const isMatch = await CryptoUtils.comparePassword(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      this.logger.warn(
        `[SECURITY] Tentativa inválida de alteração de senha para o utilizador ${userId} | IP: ${ipAddress || 'unknown'}`,
      );

      await this.auditService.log({
        userId,
        action: 'USER_PASSWORD_CHANGE_FAILED',
        entity: 'User',
        entityId: userId,
        details: { reason: 'Senha atual incorreta' },
        ipAddress,
      });
      throw new UnauthorizedException('A palavra-passe atual está incorreta.');
    }

    const newHash = await CryptoUtils.hashPassword(dto.newPassword);
    await this.usersRepository.updatePassword(userId, newHash);

    // Revoga o refresh token no Redis para invalidar sessões antigas
    await this.redisService.del(`auth:refresh:${userId}`);

    this.logger.log(
      `[SECURITY] Palavra-passe alterada com sucesso para o utilizador ${userId} | Sessões anteriores revogadas | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId,
      action: 'USER_PASSWORD_CHANGED',
      entity: 'User',
      entityId: userId,
      details: { sessionsRevoked: true },
      ipAddress,
    });

    return {
      message: 'Palavra-passe alterada com sucesso.',
    };
  }
}
