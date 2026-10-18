import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    example: 'cliente@exemplo.ao',
    description: 'Endereço de email da conta para recuperação de palavra-passe',
  })
  @IsEmail({}, { message: 'O endereço de email fornecido é inválido.' })
  @IsNotEmpty({ message: 'O endereço de email é obrigatório.' })
  email!: string;

  @ApiProperty({
    example: 'NovaSenhaSegura2026#',
    description: 'Nova palavra-passe desejada (mínimo de 8 caracteres)',
    minLength: 8,
  })
  @IsString({ message: 'A palavra-passe deve ser uma string de caracteres.' })
  @MinLength(8, { message: 'A nova palavra-passe deve ter no mínimo 8 caracteres.' })
  newPassword!: string;
}
