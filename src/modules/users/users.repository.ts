import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { User, Profile, Role, UserStatus, Prisma } from '../../generated/prisma/client.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  role?: Role;
  status?: UserStatus;
  profileRole?: string;
  workArea?: string;
  bio?: string;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<(User & { profile: Profile | null }) | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { profile: true },
    });
  }

  async findByPhone(phone: string): Promise<(User & { profile: Profile | null }) | null> {
    const raw = phone.trim();
    const digitsOnly = raw.replace(/\D/g, '');
    const local9Digits = digitsOnly.startsWith('244') ? digitsOnly.slice(3) : digitsOnly;
    const candidates = Array.from(
      new Set([raw, local9Digits, `+244${local9Digits}`, `244${local9Digits}`]),
    ).filter(Boolean);

    return this.prisma.user.findFirst({
      where: {
        phone: {
          in: candidates,
        },
      },
      include: { profile: true },
    });
  }

  async findByPhoneOrEmail(identifier: string): Promise<(User & { profile: Profile | null }) | null> {
    const clean = identifier.trim();
    if (clean.includes('@')) {
      return this.findByEmail(clean);
    }
    return this.findByPhone(clean);
  }

  async findById(id: string): Promise<(User & { profile: Profile | null }) | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
    });
  }

  async createUserWithProfile(data: CreateUserData): Promise<User & { profile: Profile | null }> {
    const role = data.role || Role.CLIENT;
    const profileRole = data.profileRole || (role === Role.PROVIDER ? 'professional' : 'client');
    const isProvider = role === Role.PROVIDER;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash: data.passwordHash,
          name: data.name.trim(),
          phone: data.phone?.trim(),
          role,
          status: data.status || UserStatus.ACTIVE,
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

      let card = null;
      // Criação e vinculação automática do cartão/carteira virtual para clientes
      if (role === Role.CLIENT) {
        const now = new Date();
        const lastFour = String(Math.floor(1000 + Math.random() * 9000));
        card = await tx.card.create({
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

      return { ...user, profile, card };
    });
  }

  async updateProfile(
    userId: string,
    data: Prisma.ProfileUpdateInput,
  ): Promise<Profile> {
    return this.prisma.$transaction(async (tx) => {
      // Sincroniza campos comuns na tabela users caso tenham sido fornecidos
      const userUpdateData: Prisma.UserUpdateInput = {};
      if (typeof data.name === 'string') {
        userUpdateData.name = data.name.trim();
      }
      if (typeof data.phone === 'string' || data.phone === null) {
        userUpdateData.phone = typeof data.phone === 'string' ? data.phone.trim() : null;
      }

      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userUpdateData,
        });
      }

      return tx.profile.update({
        where: { userId },
        data,
      });
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async updateStatus(userId: string, status: UserStatus): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
    });
  }
}

