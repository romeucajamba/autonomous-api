import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AdminActionReasonDto {
  @ApiPropertyOptional({
    example: 'Conta regularizada após verificação documental.',
    description: 'Motivo da ação para auditoria administrativa',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'O motivo não pode exceder 500 caracteres.' })
  reason?: string;
}
