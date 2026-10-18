import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Canalização e Reparação Hidráulica',
    description: 'Nome da categoria de serviços',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome da categoria é obrigatório.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome não pode exceder 100 caracteres.' })
  name!: string;

  @ApiPropertyOptional({
    example: 'canalizacao-e-reparacao',
    description: 'Slug amigável para URLs (gerado automaticamente se não fornecido)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'O slug deve conter apenas letras minúsculas, números e hífens.',
  })
  slug?: string;

  @ApiPropertyOptional({
    example: 'Serviços especializados em desentupimentos, instalação de torneiras e reparação de tubagens.',
    description: 'Descrição detalhada dos serviços abrangidos pela categoria',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A descrição não pode exceder 500 caracteres.' })
  description?: string;

  @ApiPropertyOptional({
    example: 'wrench',
    description: 'Identificador do ícone ilustrativo da categoria',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'O identificador do ícone não pode exceder 50 caracteres.' })
  icon?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Define se a categoria está visível e disponível para prestadores e clientes',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
