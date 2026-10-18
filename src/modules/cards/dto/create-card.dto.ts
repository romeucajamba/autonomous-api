import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCardDto {
  @ApiProperty({
    example: '5067 1234 5678 9012',
    description: 'Número do cartão (16 dígitos)',
  })
  @IsString()
  @IsNotEmpty({ message: 'O número do cartão é obrigatório.' })
  @Matches(/^[\d\s-]{13,19}$/, {
    message: 'O número do cartão deve conter entre 13 e 19 dígitos válidos.',
  })
  cardNumber!: string;

  @ApiProperty({
    example: 'Manuel António da Silva',
    description: 'Nome impresso no cartão',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome impresso no cartão é obrigatório.' })
  cardholderName!: string;

  @ApiProperty({
    example: 12,
    description: 'Mês de validade (1 a 12)',
    minimum: 1,
    maximum: 12,
  })
  @IsInt({ message: 'O mês de expiração deve ser um número inteiro.' })
  @Min(1, { message: 'O mês de expiração deve ser entre 1 e 12.' })
  @Max(12, { message: 'O mês de expiração deve ser entre 1 e 12.' })
  expiryMonth!: number;

  @ApiProperty({
    example: 2029,
    description: 'Ano de validade com 4 dígitos (ex: 2029)',
    minimum: 2025,
    maximum: 2045,
  })
  @IsInt({ message: 'O ano de expiração deve ser um número inteiro.' })
  @Min(2025, { message: 'O ano de validade não pode ser no passado.' })
  expiryYear!: number;

  @ApiPropertyOptional({
    example: 'Multicaixa',
    description: 'Bandeira do cartão (Multicaixa, Visa, Mastercard)',
    default: 'Multicaixa',
  })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Define se este cartão será o método principal de pagamento',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
