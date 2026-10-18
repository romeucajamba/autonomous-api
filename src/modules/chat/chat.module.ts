import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { ChatRepository } from './chat.repository.js';
import { AuthModule } from '../auth/auth.module.js';

import { ChatGateway } from './chat.gateway.js';

@Module({
  imports: [AuthModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRepository, ChatGateway],
  exports: [ChatService, ChatRepository, ChatGateway],
})
export class ChatModule {}
