import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCardDto {
  @ApiPropertyOptional({
    example: 'Manuel A. Silva',
    description: 'Nome impresso no cartão',
  })
  @IsOptional()
  @IsString()
  cardholderName?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Definir como cartão principal/padrão',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Status ativo/inativo do cartão',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
