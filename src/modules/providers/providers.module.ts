import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { ProvidersController } from './providers.controller.js';
import { ProvidersService } from './providers.service.js';
import { ProvidersRepository } from './providers.repository.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, ProvidersController],
  providers: [ProvidersService, ProvidersRepository],
  exports: [ProvidersService, ProvidersRepository],
})
export class ProvidersModule {}
