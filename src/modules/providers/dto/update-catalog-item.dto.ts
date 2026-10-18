import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCatalogItemDto {
  @ApiPropertyOptional({
    example: 'Instalação e Reparação Hidráulica Residencial',
    description: 'Nome atualizado do serviço',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'O nome do serviço deve conter pelo menos 3 caracteres.' })
  @MaxLength(120, { message: 'O nome do serviço não pode exceder 120 caracteres.' })
  name?: string;

  @ApiPropertyOptional({
    example: 'Descrição atualizada com garantia de 30 dias para o trabalho efetuado.',
    description: 'Descrição atualizada do serviço',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'A descrição não pode exceder 1000 caracteres.' })
  description?: string;

  @ApiPropertyOptional({
    example: 18000,
    description: 'Preço atualizado em Kwanzas (AOA)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O preço deve ser um valor numérico inteiro.' })
  @Min(0, { message: 'O preço não pode ser negativo.' })
  priceAmount?: number;

  @ApiPropertyOptional({
    example: 'AOA',
    description: 'Moeda do serviço',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.autonomous.ao/services/new-plumbing.jpg',
    description: 'URL de imagem atualizada do serviço',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
