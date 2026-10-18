import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiPropertyOptional({
    example: 'Canalização, Desentupimentos e Redes Hidráulicas',
    description: 'Nome atualizado da categoria',
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome não pode exceder 100 caracteres.' })
  name?: string;

  @ApiPropertyOptional({
    example: 'canalizacao-e-redes-hidraulicas',
    description: 'Slug amigável atualizado',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'O slug deve conter apenas letras minúsculas, números e hífens.',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: 'Serviços de canalização residencial e predial.',
    description: 'Descrição atualizada',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A descrição não pode exceder 500 caracteres.' })
  description?: string;

  @ApiPropertyOptional({
    example: 'droplet',
    description: 'Identificador do ícone atualizado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Status de ativação da categoria',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
