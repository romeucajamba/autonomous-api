import { Module } from '@nestjs/common';
import { ServiceCategoryController } from './service-category.controller.js';
import { ServiceCategoryService } from './service-category.service.js';
import { ServiceCategoryRepository } from './service-category.repository.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuthModule],
  controllers: [ServiceCategoryController],
  providers: [ServiceCategoryService, ServiceCategoryRepository],
  exports: [ServiceCategoryService, ServiceCategoryRepository],
})
export class ServiceCategoryModule {}
