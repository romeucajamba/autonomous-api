import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardsService } from './cards.service.js';
import { NotFoundException } from '@nestjs/common';

describe('CardsService', () => {
  let cardsService: CardsService;
  let mockCardsRepository: any;
  let mockAuditService: any;

  beforeEach(() => {
    mockCardsRepository = {
      findByUserId: vi.fn(),
      findByIdAndUserId: vi.fn(),
      countByUserId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setDefault: vi.fn(),
      delete: vi.fn(),
    };

    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    cardsService = new CardsService(mockCardsRepository, mockAuditService);
  });

  describe('findAll', () => {
    it('deve listar todos os cartões do utilizador', async () => {
      const mockCards = [
        { id: 'card-1', userId: 'usr-1', lastFour: '1234', isDefault: true },
        { id: 'card-2', userId: 'usr-1', lastFour: '5678', isDefault: false },
      ];
      mockCardsRepository.findByUserId.mockResolvedValue(mockCards);

      const result = await cardsService.findAll('usr-1');

      expect(result).toHaveLength(2);
      expect(mockCardsRepository.findByUserId).toHaveBeenCalledWith('usr-1');
    });
  });

  describe('findOne', () => {
    it('deve retornar o cartão se pertencer ao utilizador', async () => {
      const mockCard = { id: 'card-1', userId: 'usr-1', lastFour: '1234' };
      mockCardsRepository.findByIdAndUserId.mockResolvedValue(mockCard);

      const result = await cardsService.findOne('card-1', 'usr-1');

      expect(result.id).toBe('card-1');
    });

    it('deve lançar NotFoundException se o cartão não for encontrado', async () => {
      mockCardsRepository.findByIdAndUserId.mockResolvedValue(null);

      await expect(cardsService.findOne('card-99', 'usr-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('deve criar um novo cartão mascarando o número e registando auditoria', async () => {
      mockCardsRepository.create.mockResolvedValue({
        id: 'card-new',
        userId: 'usr-1',
        cardNumber: '**** **** **** 9012',
        lastFour: '9012',
        brand: 'Multicaixa',
        isDefault: true,
      });

      const result = await cardsService.create(
        'usr-1',
        {
          cardNumber: '5067 1234 5678 9012',
          cardholderName: 'Manuel Silva',
          expiryMonth: 12,
          expiryYear: 2029,
          brand: 'Multicaixa',
          isDefault: true,
        },
        '192.168.1.1',
      );

      expect(result.id).toBe('card-new');
      expect(mockCardsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          cardNumber: '**** **** **** 9012',
          lastFour: '9012',
          cardholderName: 'MANUEL SILVA',
          brand: 'Multicaixa',
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          action: 'CARD_CREATED',
        }),
      );
    });
  });

  describe('update', () => {
    it('deve atualizar o cartão e registar log de auditoria', async () => {
      mockCardsRepository.findByIdAndUserId.mockResolvedValue({
        id: 'card-1',
        userId: 'usr-1',
      });
      mockCardsRepository.update.mockResolvedValue({
        id: 'card-1',
        cardholderName: 'MANUEL A SILVA',
        isDefault: true,
      });

      const result = await cardsService.update(
        'card-1',
        'usr-1',
        { cardholderName: 'Manuel A Silva', isDefault: true },
        '192.168.1.1',
      );

      expect(result.cardholderName).toBe('MANUEL A SILVA');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          action: 'CARD_UPDATED',
        }),
      );
    });
  });

  describe('setDefault', () => {
    it('deve definir o cartão como padrão e registar auditoria', async () => {
      mockCardsRepository.findByIdAndUserId.mockResolvedValue({
        id: 'card-2',
        userId: 'usr-1',
      });
      mockCardsRepository.setDefault.mockResolvedValue({
        id: 'card-2',
        userId: 'usr-1',
        isDefault: true,
      });

      const result = await cardsService.setDefault('card-2', 'usr-1', '192.168.1.1');

      expect(result.isDefault).toBe(true);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          action: 'CARD_SET_DEFAULT',
        }),
      );
    });
  });

  describe('delete', () => {
    it('deve remover o cartão e devolver mensagem de sucesso', async () => {
      mockCardsRepository.findByIdAndUserId.mockResolvedValue({
        id: 'card-1',
        userId: 'usr-1',
        lastFour: '1234',
        brand: 'Multicaixa',
      });
      mockCardsRepository.delete.mockResolvedValue({
        id: 'card-1',
        lastFour: '1234',
        brand: 'Multicaixa',
      });

      const result = await cardsService.delete('card-1', 'usr-1', '192.168.1.1');

      expect(result.message).toBe('Cartão removido com sucesso.');
      expect(mockCardsRepository.delete).toHaveBeenCalledWith('card-1', 'usr-1');
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'usr-1',
          action: 'CARD_DELETED',
        }),
      );
    });
  });
});
