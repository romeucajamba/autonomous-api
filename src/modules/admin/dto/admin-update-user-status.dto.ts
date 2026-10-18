import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '../../../generated/prisma/client.js';

export class AdminUpdateUserStatusDto {
  @ApiProperty({
    example: 'SUSPENDED',
    enum: UserStatus,
    description: 'Novo status a aplicar à conta (ACTIVE = Ativação, INACTIVE = Bloqueio, SUSPENDED = Suspensão, PENDING_VERIFICATION = Em Verificação)',
  })
  @IsEnum(UserStatus, {
    message: 'Status inválido. Valores aceites: ACTIVE, INACTIVE, SUSPENDED, PENDING_VERIFICATION.',
  })
  @IsNotEmpty({ message: 'O status é obrigatório.' })
  status!: UserStatus;

  @ApiPropertyOptional({
    example: 'Tentativa recorrente de fraude ou violação dos termos de conduta.',
    description: 'Justificação ou motivo da alteração de status para efeitos de auditoria interna',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'O motivo não pode exceder 500 caracteres.' })
  reason?: string;
}
