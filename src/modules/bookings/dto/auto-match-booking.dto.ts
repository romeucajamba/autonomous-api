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

export class AutoMatchBookingDto {
  @ApiProperty({
    example: 'Canalização',
    description: 'Termo do serviço procurado (ex.: Canalização, Eletricista, Pintura, Desentupimento)',
  })
  @IsString()
  @IsNotEmpty({ message: 'O termo do serviço procurado é obrigatório.' })
  @MinLength(2, { message: 'O termo deve conter pelo menos 2 caracteres.' })
  @MaxLength(100)
  serviceQuery!: string;

  @ApiProperty({
    example: 'Preciso de reparação de uma fuga de água urgente na torneira da cozinha.',
    description: 'Descrição detalhada da necessidade ou problema a ser resolvido',
  })
  @IsString()
  @IsNotEmpty({ message: 'A descrição da solicitação é obrigatória.' })
  @MinLength(10, { message: 'A descrição deve conter pelo menos 10 caracteres.' })
  @MaxLength(2000)
  description!: string;

  @ApiProperty({
    example: 'Bairro Alvalade, Rua Comandante Gika, Luanda',
    description: 'Localização onde o serviço deverá ser prestado',
  })
  @IsString()
  @IsNotEmpty({ message: 'A localização é obrigatória para o agendamento.' })
  @MaxLength(255)
  location!: string;

  @ApiPropertyOptional({
    example: '2026-10-25',
    description: 'Data pretendida para o serviço (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  serviceDate?: string;

  @ApiPropertyOptional({
    example: '14:30',
    description: 'Horário pretendido (ex.: 14:30)',
  })
  @IsOptional()
  @IsString()
  serviceTime?: string;

  @ApiPropertyOptional({
    example: 30000,
    description: 'Orçamento máximo pretendido em Kwanzas (AOA)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxBudget?: number;
}
