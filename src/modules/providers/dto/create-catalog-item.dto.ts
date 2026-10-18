import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCatalogItemDto {
  @ApiProperty({
    example: 'Reparação de Fuga de Água e Substituição de Torneira',
    description: 'Nome ou título do serviço oferecido',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome do serviço é obrigatório.' })
  @MinLength(3, { message: 'O nome do serviço deve conter pelo menos 3 caracteres.' })
  @MaxLength(120, { message: 'O nome do serviço não pode exceder 120 caracteres.' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Diagnóstico e reparação completa de fugas em canos PVC e substituição de juntas e vedantes.',
    description: 'Descrição detalhada do serviço prestado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'A descrição não pode exceder 1000 caracteres.' })
  description?: string;

  @ApiProperty({
    example: 15000,
    description: 'Preço base do serviço em Kwanzas (AOA)',
    minimum: 0,
  })
  @Type(() => Number)
  @IsInt({ message: 'O preço deve ser um valor numérico inteiro.' })
  @Min(0, { message: 'O preço não pode ser negativo.' })
  priceAmount!: number;

  @ApiPropertyOptional({
    example: 'AOA',
    description: 'Moeda do serviço (padrão: AOA - Kwanzas)',
    default: 'AOA',
  })
  @IsOptional()
  @IsString()
  currency?: string = 'AOA';

  @ApiPropertyOptional({
    example: 'https://cdn.autonomous.ao/services/plumbing-repair.jpg',
    description: 'URL de imagem ilustrativa do serviço',
  })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description:
      'ID do prestador a quem vincular este serviço (obrigatório se a criação for realizada pelo ADMIN; ignorado se criado pelo próprio prestador)',
  })
  @IsOptional()
  @IsString()
  providerId?: string;
}
