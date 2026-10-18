import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';
import { BookingsRepository } from './bookings.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';

@Module({
  imports: [AuthModule, ChatModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository],
  exports: [BookingsService, BookingsRepository],
})
export class BookingsModule {}
