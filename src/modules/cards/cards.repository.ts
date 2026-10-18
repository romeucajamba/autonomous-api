import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Card, Prisma } from '../../generated/prisma/client.js';

export interface CreateCardData {
  userId: string;
  cardNumber: string;
  lastFour: string;
  cardholderName: string;
  expiryMonth: number;
  expiryYear: number;
  brand?: string;
  cardType?: string;
  isDefault?: boolean;
}

@Injectable()
export class CardsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<Card[]> {
    return this.prisma.card.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Card | null> {
    return this.prisma.card.findFirst({
      where: { id, userId },
    });
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.card.count({
      where: { userId },
    });
  }

  async create(data: CreateCardData): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      const existingCardsCount = await tx.card.count({
        where: { userId: data.userId },
      });

      // Se for o primeiro cartão ou se isDefault for true, define como default
      const shouldBeDefault = data.isDefault ?? existingCardsCount === 0;

      if (shouldBeDefault) {
        await tx.card.updateMany({
          where: { userId: data.userId },
          data: { isDefault: false },
        });
      }

      return tx.card.create({
        data: {
          userId: data.userId,
          cardNumber: data.cardNumber,
          lastFour: data.lastFour,
          cardholderName: data.cardholderName,
          expiryMonth: data.expiryMonth,
          expiryYear: data.expiryYear,
          brand: data.brand || 'Multicaixa',
          cardType: data.cardType || 'virtual',
          balance: 0,
          currency: 'AOA',
          isDefault: shouldBeDefault,
          isActive: true,
        },
      });
    });
  }

  async update(
    id: string,
    userId: string,
    data: Prisma.CardUpdateInput,
  ): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.card.updateMany({
          where: { userId, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.card.update({
        where: { id },
        data,
      });
    });
  }

  async setDefault(id: string, userId: string): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      await tx.card.updateMany({
        where: { userId },
        data: { isDefault: false },
      });

      return tx.card.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });
    });
  }

  async delete(id: string, userId: string): Promise<Card> {
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.card.delete({
        where: { id },
      });

      // Se o cartão removido era o padrão, define o mais recente restante como padrão
      if (deleted.isDefault) {
        const nextCard = await tx.card.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        if (nextCard) {
          await tx.card.update({
            where: { id: nextCard.id },
            data: { isDefault: true },
          });
        }
      }

      return deleted;
    });
  }
}
