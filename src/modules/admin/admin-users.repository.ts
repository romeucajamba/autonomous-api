import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  User,
  Profile,
  Card,
  AuditLog,
  Role,
  UserStatus,
  Prisma,
} from '../../generated/prisma/client.js';

export interface AdminFindManyUsersParams {
  skip: number;
  take: number;
  role?: Role;
  status?: UserStatus;
  search?: string;
}

export interface AdminCreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role: Role;
  status?: UserStatus;
  workArea?: string;
  bio?: string;
}

export interface AdminUpdateUserData {
  name?: string;
  phone?: string;
  role?: Role;
  status?: UserStatus;
}

@Injectable()
export class AdminUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(params: AdminFindManyUsersParams): Promise<{
    users: (User & { profile: Profile | null; _count: { cards: number } })[];
    total: number;
  }> {
    const where: Prisma.UserWhereInput = {};

    // Se um papel for fornecido, filtra por ele; caso contrário, foca em CLIENT, PROVIDER e FINANCIAL
    if (params.role) {
      where.role = params.role;
    } else {
      where.role = {
        in: [Role.CLIENT, Role.PROVIDER, Role.FINANCIAL],
      };
    }

    if (params.status) {
      where.status = params.status;
    }

    if (params.search) {
      const term = params.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: params.skip,
        take: params.take,
        orderBy: { createdAt: 'desc' },
        include: {
          profile: true,
          _count: {
            select: { cards: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async findById(id: string): Promise<
    | (User & {
        profile: Profile | null;
        cards: Card[];
        auditLogs: AuditLog[];
      })
    | null
  > {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: true,
        cards: {
          orderBy: { createdAt: 'desc' },
        },
        auditLogs: {
          take: 15,
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  async createUser(data: AdminCreateUserData): Promise<User & { profile: Profile | null }> {
    const role = data.role;
    const status = data.status || UserStatus.ACTIVE;
    const profileRole =
      role === Role.PROVIDER ? 'professional' : role === Role.FINANCIAL ? 'financial' : 'client';
    const isProvider = role === Role.PROVIDER;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash: data.passwordHash,
          name: data.name.trim(),
          phone: data.phone?.trim(),
          role,
          status,
        },
      });

      const profile = await tx.profile.create({
        data: {
          userId: user.id,
          role: profileRole,
          name: data.name.trim(),
          phone: data.phone?.trim(),
          workArea: data.workArea,
          bio: data.bio,
          approvalStatus: isProvider ? 'pending' : 'approved',
          onboardingCompleted: !isProvider,
        },
      });

      // Criação de cartão/carteira automático para utilizadores CLIENT
      if (role === Role.CLIENT) {
        const now = new Date();
        const lastFour = String(Math.floor(1000 + Math.random() * 9000));
        await tx.card.create({
          data: {
            userId: user.id,
            cardNumber: `5067 **** **** ${lastFour}`,
            lastFour,
            cardholderName: data.name.trim().toUpperCase(),
            expiryMonth: now.getMonth() + 1,
            expiryYear: now.getFullYear() + 4,
            brand: 'Multicaixa',
            cardType: 'virtual',
            balance: 0,
            currency: 'AOA',
            isDefault: true,
            isActive: true,
          },
        });
      }

      return { ...user, profile };
    });
  }

  async updateUser(
    id: string,
    data: AdminUpdateUserData,
  ): Promise<User & { profile: Profile | null }> {
    return this.prisma.$transaction(async (tx) => {
      const userUpdate: Prisma.UserUpdateInput = {};
      const profileUpdate: Prisma.ProfileUpdateInput = {};

      if (data.name !== undefined) {
        userUpdate.name = data.name.trim();
        profileUpdate.name = data.name.trim();
      }

      if (data.phone !== undefined) {
        userUpdate.phone = data.phone?.trim() || null;
        profileUpdate.phone = data.phone?.trim() || null;
      }

      if (data.role !== undefined) {
        userUpdate.role = data.role;
        profileUpdate.role =
          data.role === Role.PROVIDER
            ? 'professional'
            : data.role === Role.FINANCIAL
              ? 'financial'
              : 'client';
      }

      if (data.status !== undefined) {
        userUpdate.status = data.status;
      }

      const updatedUser = await tx.user.update({
        where: { id },
        data: userUpdate,
      });

      const updatedProfile = await tx.profile.update({
        where: { userId: id },
        data: profileUpdate,
      });

      return { ...updatedUser, profile: updatedProfile };
    });
  }

  async updateStatus(
    id: string,
    status: UserStatus,
  ): Promise<User & { profile: Profile | null }> {
    return this.prisma.user.update({
      where: { id },
      data: { status },
      include: { profile: true },
    });
  }

  async deleteUser(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }
}
