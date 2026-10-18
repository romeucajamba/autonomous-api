import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '../../../generated/prisma/client.js';

export class AdminUpdateUserDto {
  @ApiPropertyOptional({
    example: 'Manuel Silva Atualizado',
    description: 'Nome completo do utilizador',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome não pode exceder 100 caracteres.' })
  name?: string;

  @ApiPropertyOptional({
    example: '+244923111222',
    description: 'Contacto telefónico',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    example: 'PROVIDER',
    enum: [Role.CLIENT, Role.PROVIDER, Role.FINANCIAL],
    description: 'Papel do utilizador no sistema',
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Papel inválido.' })
  @IsIn([Role.CLIENT, Role.PROVIDER, Role.FINANCIAL], {
    message: 'Apenas são permitidas as funções CLIENT, PROVIDER ou FINANCIAL.',
  })
  role?: Role;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    enum: UserStatus,
    description: 'Status da conta do utilizador',
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status de utilizador inválido.' })
  status?: UserStatus;

  @ApiPropertyOptional({
    example: 'Atualização solicitada por auditoria ou suporte.',
    description: 'Motivo da alteração cadastral',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
