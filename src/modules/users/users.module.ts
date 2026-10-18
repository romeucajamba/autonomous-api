import { Module } from '@nestjs/common';
import { UsersRepository } from './users.repository.js';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [JwtModule.register({})],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
