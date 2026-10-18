import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, UserStatus } from '../../../generated/prisma/client.js';

export class AdminCreateUserDto {
  @ApiProperty({
    example: 'Carlos Miguel Silva',
    description: 'Nome completo do utilizador',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  @MaxLength(100, { message: 'O nome não pode exceder 100 caracteres.' })
  name!: string;

  @ApiProperty({
    example: 'carlos.silva@autonomous.ao',
    description: 'Endereço de email único para autenticação',
  })
  @IsEmail({}, { message: 'Formato de email inválido.' })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email!: string;

  @ApiProperty({
    example: 'SenhaForte#2026',
    description: 'Palavra-passe inicial com no mínimo 8 caracteres',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'A palavra-passe deve conter pelo menos 8 caracteres.' })
  password!: string;

  @ApiPropertyOptional({
    example: '+244923456789',
    description: 'Contacto telefónico',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: 'CLIENT',
    enum: [Role.CLIENT, Role.PROVIDER, Role.FINANCIAL],
    description: 'Papel do utilizador no sistema (CLIENT, PROVIDER ou FINANCIAL)',
  })
  @IsEnum(Role, { message: 'Papel inválido.' })
  @IsIn([Role.CLIENT, Role.PROVIDER, Role.FINANCIAL], {
    message: 'Apenas é permitida a criação de utilizadores dos tipos CLIENT, PROVIDER ou FINANCIAL.',
  })
  role!: Role;

  @ApiPropertyOptional({
    example: 'ACTIVE',
    enum: UserStatus,
    description: 'Status inicial da conta (por padrão ACTIVE)',
    default: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus, { message: 'Status de utilizador inválido.' })
  status?: UserStatus = UserStatus.ACTIVE;

  @ApiPropertyOptional({
    example: 'Canalização e Reparação Hidráulica',
    description: 'Área de atuação (aplicável a prestadores)',
  })
  @IsOptional()
  @IsString()
  workArea?: string;

  @ApiPropertyOptional({
    example: 'Profissional certificado com 5 anos de experiência em Luanda.',
    description: 'Biografia ou resumo do utilizador',
  })
  @IsOptional()
  @IsString()
  bio?: string;
}
