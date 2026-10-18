import { Module } from '@nestjs/common';
import { CardsController } from './cards.controller.js';
import { CardsService } from './cards.service.js';
import { CardsRepository } from './cards.repository.js';

@Module({
  controllers: [CardsController],
  providers: [CardsService, CardsRepository],
  exports: [CardsService, CardsRepository],
})
export class CardsModule {}
