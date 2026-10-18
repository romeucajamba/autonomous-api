import { IsEnum, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '../../../generated/prisma/client.js';

export class AdminQueryUsersDto {
  @ApiPropertyOptional({
    description: 'Número da página',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Quantidade de registos por página',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filtrar por papel do utilizador',
    enum: [Role.CLIENT, Role.PROVIDER, Role.FINANCIAL],
  })
  @IsOptional()
  @IsEnum(Role, {
    message: 'O papel fornecido é inválido. Valores aceites: CLIENT, PROVIDER, FINANCIAL.',
  })
  role?: Role;

  @ApiPropertyOptional({
    description: 'Filtrar por status da conta',
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus, {
    message: 'O status fornecido é inválido. Valores aceites: ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION.',
  })
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Termo de pesquisa (nome, email ou telefone)',
    example: 'Manuel',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
