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

export class CreateBookingRequestDto {
  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'UUID do perfil do prestador de serviços selecionado (ou ID do utilizador)',
  })
  @IsString()
  @IsNotEmpty({ message: 'O identificador do prestador (providerId) é obrigatório.' })
  providerId!: string;

  @ApiProperty({
    example: 'Reparação de Fuga de Água e Canalização',
    description: 'Nome ou título do serviço solicitado',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome do serviço é obrigatório.' })
  @MinLength(3, { message: 'O nome do serviço deve conter pelo menos 3 caracteres.' })
  @MaxLength(150, { message: 'O nome do serviço não pode exceder 150 caracteres.' })
  serviceName!: string;

  @ApiProperty({
    example: 'A torneira da cozinha está a verter água constantemente e o cano por baixo parece estalado.',
    description: 'Descrição detalhada do problema ou trabalho a ser executado',
  })
  @IsString()
  @IsNotEmpty({ message: 'A descrição da solicitação é obrigatória.' })
  @MinLength(10, { message: 'A descrição deve conter pelo menos 10 caracteres.' })
  @MaxLength(2000, { message: 'A descrição não pode exceder 2000 caracteres.' })
  description!: string;

  @ApiPropertyOptional({
    example: 'Bairro Alvalade, Rua Comandante Gika, Prédio 14, 2º Andar, Luanda',
    description: 'Localização ou morada onde o serviço deverá ser realizado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({
    example: '2026-10-25',
    description: 'Data pretendida para a realização do serviço (formato YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  serviceDate?: string;

  @ApiPropertyOptional({
    example: '14:30',
    description: 'Horário pretendido (ex.: 14:30 ou Manhã)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  serviceTime?: string;

  @ApiPropertyOptional({
    example: 15000,
    description: 'Preço base acordado ou estimado em Kwanzas (AOA)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'O preço deve ser um valor numérico inteiro.' })
  @Min(0, { message: 'O valor não pode ser negativo.' })
  priceAmount?: number;

  @ApiPropertyOptional({
    example: 'AOA',
    description: 'Moeda da transação (padrão: AOA)',
    default: 'AOA',
  })
  @IsOptional()
  @IsString()
  currency?: string = 'AOA';

  @ApiPropertyOptional({
    example: '8cb38f24-5182-4a57-8902-6e938f66afa7',
    description: 'UUID do item do catálogo de serviços selecionado (opcional)',
  })
  @IsOptional()
  @IsString()
  catalogItemId?: string;
}
