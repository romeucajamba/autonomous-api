import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AdminUsersRepository } from './admin-users.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { RedisService } from '../../infra/redis/redis.service.js';
import { CryptoUtils } from '../../common/utils/crypto.utils.js';
import { AdminQueryUsersDto } from './dto/admin-query-users.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto.js';
import { AdminUpdateUserStatusDto } from './dto/admin-update-user-status.dto.js';
import { Role, UserStatus, User, Profile } from '../../generated/prisma/client.js';
import { JwtPayload } from '../../common/types/jwt-payload.type.js';

export type SafeUser = Omit<User, 'passwordHash'> & {
  profile: Profile | null;
  _count?: { cards: number };
};

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private readonly adminUsersRepository: AdminUsersRepository,
    private readonly auditService: AuditService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Listar utilizadores com paginação, filtros e pesquisa
   */
  async listUsers(query: AdminQueryUsersDto): Promise<{
    data: SafeUser[];
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

    const { users, total } = await this.adminUsersRepository.findMany({
      skip,
      take: limit,
      role: query.role,
      status: query.status,
      search: query.search,
    });

    const safeUsers = users.map((u) => {
      const { passwordHash: _, ...safe } = u;
      return safe;
    });

    return {
      data: safeUsers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Obter detalhes completos de um utilizador específico
   */
  async getUserById(id: string): Promise<SafeUser & { cards?: unknown[]; auditLogs?: unknown[] }> {
    const user = await this.adminUsersRepository.findById(id);
    if (!user) {
      throw new NotFoundException('Utilizador não encontrado.');
    }

    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Criar utilizador pelo administrador (CLIENT, PROVIDER ou FINANCIAL)
   */
  async createUser(
    dto: AdminCreateUserDto,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<SafeUser> {
    const existing = await this.adminUsersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Já existe um utilizador registado com este endereço de email.');
    }

    if (dto.role === Role.ADMIN) {
      throw new BadRequestException(
        'Apenas é permitida a criação de contas com os perfis CLIENT, PROVIDER ou FINANCIAL.',
      );
    }

    const passwordHash = await CryptoUtils.hashPassword(dto.password);

    const created = await this.adminUsersRepository.createUser({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      role: dto.role,
      status: dto.status || UserStatus.ACTIVE,
      workArea: dto.workArea,
      bio: dto.bio,
    });

    this.logger.log(
      `[ADMIN_ACTION] Admin ${admin.sub} (${admin.email}) criou novo utilizador ${created.id} (${created.email}) | Papel: ${created.role} | Status: ${created.status} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_CREATED',
      entity: 'User',
      entityId: created.id,
      details: {
        adminId: admin.sub,
        adminEmail: admin.email,
        targetEmail: created.email,
        targetRole: created.role,
        targetStatus: created.status,
      },
      ipAddress,
    });

    const { passwordHash: _, ...safeUser } = created;
    return safeUser;
  }

  /**
   * Atualizar dados cadastrais do utilizador
   */
  async updateUser(
    id: string,
    dto: AdminUpdateUserDto,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<SafeUser> {
    const targetUser = await this.adminUsersRepository.findById(id);
    if (!targetUser) {
      throw new NotFoundException('Utilizador não encontrado.');
    }

    if (targetUser.role === Role.ADMIN && targetUser.id !== admin.sub) {
      throw new ForbiddenException(
        'Não é permitido alterar outras contas de administrador através deste fluxo.',
      );
    }

    if (dto.role === Role.ADMIN) {
      throw new BadRequestException('Não é permitido alterar utilizadores para o perfil ADMIN.');
    }

    // Se o status estiver a ser alterado para INACTIVE ou SUSPENDED, revoga a sessão
    if (
      dto.status &&
      dto.status !== targetUser.status &&
      (dto.status === UserStatus.INACTIVE || dto.status === UserStatus.SUSPENDED)
    ) {
      await this.redisService.del(`auth:refresh:${id}`);
    }

    const updated = await this.adminUsersRepository.updateUser(id, dto);

    this.logger.log(
      `[ADMIN_ACTION] Admin ${admin.sub} atualizou dados do utilizador ${id} | Motivo: ${dto.reason || 'N/A'} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_UPDATED',
      entity: 'User',
      entityId: id,
      details: {
        adminId: admin.sub,
        adminEmail: admin.email,
        updatedFields: dto,
        reason: dto.reason,
      },
      ipAddress,
    });

    const { passwordHash: _, ...safeUser } = updated;
    return safeUser;
  }

  /**
   * Alterar status da conta (Ativação, Bloqueio, Suspensão)
   */
  async updateStatus(
    id: string,
    dto: AdminUpdateUserStatusDto,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; user: SafeUser }> {
    const targetUser = await this.adminUsersRepository.findById(id);
    if (!targetUser) {
      throw new NotFoundException('Utilizador não encontrado.');
    }

    if (targetUser.id === admin.sub) {
      throw new BadRequestException('Não pode alterar o status da sua própria conta de administrador.');
    }

    if (targetUser.role === Role.ADMIN) {
      throw new ForbiddenException(
        'Não é permitido alterar o status de contas de administrador. Este fluxo destina-se a clientes, prestadores e financeiro.',
      );
    }

    const previousStatus = targetUser.status;

    // Se a conta estiver a ser bloqueada ou suspensa, invalida sessões ativas no Redis
    if (dto.status === UserStatus.INACTIVE || dto.status === UserStatus.SUSPENDED) {
      await this.redisService.del(`auth:refresh:${id}`);
    }

    const updated = await this.adminUsersRepository.updateStatus(id, dto.status);

    this.logger.log(
      `[ADMIN_ACTION] Admin ${admin.sub} (${admin.email}) alterou o status do utilizador ${id} (${targetUser.email}) de ${previousStatus} para ${dto.status} | Papel: ${targetUser.role} | Motivo: ${dto.reason || 'Sem motivo especificado'} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_STATUS_UPDATED',
      entity: 'User',
      entityId: id,
      details: {
        adminId: admin.sub,
        adminEmail: admin.email,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
        previousStatus,
        newStatus: dto.status,
        reason: dto.reason,
      },
      ipAddress,
    });

    const { passwordHash: _, ...safeUser } = updated;

    let actionLabel = 'atualizado';
    if (dto.status === UserStatus.ACTIVE) actionLabel = 'ativada';
    else if (dto.status === UserStatus.INACTIVE) actionLabel = 'bloqueada';
    else if (dto.status === UserStatus.SUSPENDED) actionLabel = 'suspensa';

    return {
      message: `Conta do utilizador ${actionLabel} com sucesso.`,
      user: safeUser,
    };
  }

  /**
   * Ação expressa: Ativar Conta (status = ACTIVE)
   */
  async activateUser(
    id: string,
    reason: string | undefined,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; user: SafeUser }> {
    const res = await this.updateStatus(
      id,
      { status: UserStatus.ACTIVE, reason },
      admin,
      ipAddress,
    );

    this.logger.log(
      `[ADMIN_ACTION] [USER_ACTIVATED] Conta ${id} ativada com sucesso pelo Admin ${admin.sub} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_ACTIVATED',
      entity: 'User',
      entityId: id,
      details: { adminId: admin.sub, reason },
      ipAddress,
    });

    return {
      message: 'Conta de utilizador ativada com sucesso.',
      user: res.user,
    };
  }

  /**
   * Ação expressa: Bloquear Conta (status = INACTIVE)
   */
  async blockUser(
    id: string,
    reason: string | undefined,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; user: SafeUser }> {
    const res = await this.updateStatus(
      id,
      { status: UserStatus.INACTIVE, reason },
      admin,
      ipAddress,
    );

    this.logger.log(
      `[ADMIN_ACTION] [USER_BLOCKED] Conta ${id} bloqueada com sucesso pelo Admin ${admin.sub} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_BLOCKED',
      entity: 'User',
      entityId: id,
      details: { adminId: admin.sub, reason },
      ipAddress,
    });

    return {
      message: 'Conta de utilizador bloqueada com sucesso.',
      user: res.user,
    };
  }

  /**
   * Ação expressa: Suspender Conta (status = SUSPENDED)
   */
  async suspendUser(
    id: string,
    reason: string | undefined,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string; user: SafeUser }> {
    const res = await this.updateStatus(
      id,
      { status: UserStatus.SUSPENDED, reason },
      admin,
      ipAddress,
    );

    this.logger.log(
      `[ADMIN_ACTION] [USER_SUSPENDED] Conta ${id} suspensa com sucesso pelo Admin ${admin.sub} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_SUSPENDED',
      entity: 'User',
      entityId: id,
      details: { adminId: admin.sub, reason },
      ipAddress,
    });

    return {
      message: 'Conta de utilizador suspensa com sucesso.',
      user: res.user,
    };
  }

  /**
   * Eliminar utilizador
   */
  async deleteUser(
    id: string,
    admin: JwtPayload,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const targetUser = await this.adminUsersRepository.findById(id);
    if (!targetUser) {
      throw new NotFoundException('Utilizador não encontrado.');
    }

    if (targetUser.id === admin.sub) {
      throw new BadRequestException('Não pode eliminar a sua própria conta de administrador.');
    }

    if (targetUser.role === Role.ADMIN) {
      throw new ForbiddenException('Não é permitido eliminar contas de administrador.');
    }

    await this.redisService.del(`auth:refresh:${id}`);
    await this.adminUsersRepository.deleteUser(id);

    this.logger.log(
      `[ADMIN_ACTION] Admin ${admin.sub} (${admin.email}) eliminou o utilizador ${id} (${targetUser.email}) | Papel: ${targetUser.role} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId: admin.sub,
      action: 'ADMIN_USER_DELETED',
      entity: 'User',
      entityId: id,
      details: {
        adminId: admin.sub,
        adminEmail: admin.email,
        targetEmail: targetUser.email,
        targetRole: targetUser.role,
      },
      ipAddress,
    });

    return {
      message: 'Utilizador removido do sistema com sucesso.',
    };
  }
}
