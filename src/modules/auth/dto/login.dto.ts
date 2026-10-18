import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'cliente@exemplo.ao',
    description: 'Email cadastrado do utilizador',
  })
  @IsEmail({}, { message: 'Por favor, forneça um endereço de email válido.' })
  @IsNotEmpty({ message: 'O email é obrigatório.' })
  email: string;

  @ApiProperty({
    example: 'SenhaForte@2026',
    description: 'Palavra-passe da conta',
  })
  @IsString({ message: 'A palavra-passe deve ser um texto válido.' })
  @IsNotEmpty({ message: 'A palavra-passe é obrigatória.' })
  password: string;
}
