import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBookingStatusDto {
  @ApiPropertyOptional({
    example: 'Indisponibilidade de agenda na data pretendida.',
    description: 'Motivo da alteração de estado (especialmente para rejeição ou cancelamento)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'O motivo não pode exceder 500 caracteres.' })
  reason?: string;
}
