import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'cliente@exemplo.ao',
    description: 'Endereço de email único do cliente',
  })
  @IsEmail({}, { message: 'Por favor, forneça um endereço de email válido.' })
  @IsNotEmpty({ message: 'O email é obrigatório.' })
  email: string;

  @ApiProperty({
    example: 'SenhaForte@2026',
    description: 'Palavra-passe de acesso (mínimo de 8 caracteres)',
    minLength: 8,
  })
  @IsString({ message: 'A palavra-passe deve ser um texto válido.' })
  @MinLength(8, { message: 'A palavra-passe deve conter pelo menos 8 caracteres.' })
  password: string;

  @ApiProperty({
    example: 'Manuel António',
    description: 'Nome completo do utilizador',
  })
  @IsString({ message: 'O nome deve ser um texto válido.' })
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  name: string;

  @ApiPropertyOptional({
    example: '923456789',
    description: 'Número de telefone de contacto (Angola)',
  })
  @IsOptional()
  @IsString({ message: 'O número de telefone deve ser válido.' })
  phone?: string;
}
