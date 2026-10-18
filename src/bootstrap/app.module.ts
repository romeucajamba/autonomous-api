import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from '../infra/prisma/prisma.module.js';
import { RedisModule } from '../infra/redis/redis.module.js';
import { UsersModule } from '../modules/users/users.module.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { AuditModule } from '../modules/audit/audit.module.js';
import { CardsModule } from '../modules/cards/cards.module.js';
import { AdminModule } from '../modules/admin/admin.module.js';
import { ServiceCategoryModule } from '../modules/service-category/service-category.module.js';
import { ProvidersModule } from '../modules/providers/providers.module.js';
import { BookingsModule } from '../modules/bookings/bookings.module.js';
import { ChatModule } from '../modules/chat/chat.module.js';
import { ReviewsModule } from '../modules/reviews/reviews.module.js';

import { validateEnv, env } from '../config/env.config.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Estratégia de Múltiplos Ambientes: Cascata hierárquica baseada em NODE_ENV com validação Zod
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV || 'development'}.local`,
        `.env.${process.env.NODE_ENV || 'development'}`,
        '.env.local',
        '.env',
      ],
      validate: validateEnv,
    }),
    ObserveModule.forRoot({
      appKey: env.OBSERVE_APP_KEY,
      appSecret: env.OBSERVE_APP_SECRET,
      serviceId: env.APP_NAME,
    }),
    // Proteção global de taxa de requisições (Rate Limiting) dinâmico por variáveis de ambiente
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: (Number(configService.get<string>('THROTTLE_TTL')) || 60) * 1000,
            limit: Number(configService.get<string>('THROTTLE_LIMIT')) || 100,
          },
        ],
        errorMessage:
          'Demasiadas tentativas num curto intervalo de tempo. Por favor, aguarde um momento antes de tentar novamente.',
      }),
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    UsersModule,
    AuthModule,
    CardsModule,
    AdminModule,
    ServiceCategoryModule,
    ProvidersModule,
    BookingsModule,
    ChatModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
