import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { CardsRepository } from './cards.repository.js';
import { CreateCardDto } from './dto/create-card.dto.js';
import { UpdateCardDto } from './dto/update-card.dto.js';
import { AuditService } from '../audit/audit.service.js';
import { Card } from '../../generated/prisma/client.js';

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly cardsRepository: CardsRepository,
    private readonly auditService: AuditService,
  ) {}

  async findAll(userId: string): Promise<Card[]> {
    return this.cardsRepository.findByUserId(userId);
  }

  async findOne(id: string, userId: string): Promise<Card> {
    const card = await this.cardsRepository.findByIdAndUserId(id, userId);
    if (!card) {
      throw new NotFoundException('Cartão ou carteira não encontrada.');
    }
    return card;
  }

  async create(
    userId: string,
    dto: CreateCardDto,
    ipAddress?: string,
  ): Promise<Card> {
    const rawDigits = dto.cardNumber.replace(/\D/g, '');
    const lastFour = rawDigits.slice(-4) || '0000';

    // Detetar bandeira se não for explicitada
    let brand = dto.brand;
    if (!brand) {
      if (rawDigits.startsWith('5067')) {
        brand = 'Multicaixa';
      } else if (rawDigits.startsWith('4')) {
        brand = 'Visa';
      } else if (rawDigits.startsWith('5')) {
        brand = 'Mastercard';
      } else {
        brand = 'Multicaixa';
      }
    }

    const maskedCardNumber = `**** **** **** ${lastFour}`;

    const card = await this.cardsRepository.create({
      userId,
      cardNumber: maskedCardNumber,
      lastFour,
      cardholderName: dto.cardholderName.trim().toUpperCase(),
      expiryMonth: dto.expiryMonth,
      expiryYear: dto.expiryYear,
      brand,
      cardType: 'physical',
      isDefault: dto.isDefault,
    });

    this.logger.log(
      `[CARD_CREATED] Cartão adicionado para o utilizador ${userId} | Bandeira: ${card.brand} | Final: ${card.lastFour} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId,
      action: 'CARD_CREATED',
      entity: 'Card',
      entityId: card.id,
      details: {
        brand: card.brand,
        lastFour: card.lastFour,
        isDefault: card.isDefault,
      },
      ipAddress,
    });

    return card;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCardDto,
    ipAddress?: string,
  ): Promise<Card> {
    await this.findOne(id, userId);

    const updated = await this.cardsRepository.update(id, userId, {
      ...(dto.cardholderName
        ? { cardholderName: dto.cardholderName.trim().toUpperCase() }
        : {}),
      ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
    });

    this.logger.log(
      `[CARD_UPDATED] Cartão ${id} atualizado pelo utilizador ${userId} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId,
      action: 'CARD_UPDATED',
      entity: 'Card',
      entityId: id,
      details: {
        updatedFields: Object.keys(dto),
      },
      ipAddress,
    });

    return updated;
  }

  async setDefault(
    id: string,
    userId: string,
    ipAddress?: string,
  ): Promise<Card> {
    await this.findOne(id, userId);

    const updated = await this.cardsRepository.setDefault(id, userId);

    this.logger.log(
      `[CARD_SET_DEFAULT] Cartão ${id} definido como padrão para o utilizador ${userId} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId,
      action: 'CARD_SET_DEFAULT',
      entity: 'Card',
      entityId: id,
      details: { isDefault: true },
      ipAddress,
    });

    return updated;
  }

  async delete(
    id: string,
    userId: string,
    ipAddress?: string,
  ): Promise<{ message: string }> {
    const card = await this.findOne(id, userId);

    await this.cardsRepository.delete(id, userId);

    this.logger.log(
      `[CARD_DELETED] Cartão ${id} (${card.lastFour}) removido pelo utilizador ${userId} | IP: ${ipAddress || 'unknown'}`,
    );

    await this.auditService.log({
      userId,
      action: 'CARD_DELETED',
      entity: 'Card',
      entityId: id,
      details: { lastFour: card.lastFour, brand: card.brand },
      ipAddress,
    });

    return {
      message: 'Cartão removido com sucesso.',
    };
  }
}
