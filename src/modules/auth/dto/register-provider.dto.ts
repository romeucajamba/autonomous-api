import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterProviderDto {
  @ApiProperty({
    example: 'prestador@exemplo.ao',
    description: 'Endereço de email único do prestador de serviço',
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
    example: 'Edson Domingos',
    description: 'Nome completo do profissional ou empresa',
  })
  @IsString({ message: 'O nome deve ser um texto válido.' })
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  name: string;

  @ApiProperty({
    example: '924567890',
    description: 'Contacto telefónico profissional',
  })
  @IsString({ message: 'O número de telefone é obrigatório para prestadores.' })
  @IsNotEmpty({ message: 'O contacto telefónico é obrigatório.' })
  phone: string;

  @ApiProperty({
    example: 'Pintura',
    description: 'Especialidade ou área de atuação principal (ex.: Pintura, Canalização, Eletricidade)',
  })
  @IsString({ message: 'A área de atuação é obrigatória.' })
  @IsNotEmpty({ message: 'Selecione uma área de atuação (ex.: Pintura, Canalização, Electricidade).' })
  workArea: string;

  @ApiPropertyOptional({
    example: 'Profissional com mais de 7 anos de experiência em pintura residencial e acabamentos.',
    description: 'Biografia resumida apresentada no perfil público',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
