import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'cliente@exemplo.ao',
    description: 'Endereço de email da conta a ser verificada para recuperação de acesso',
  })
  @IsEmail({}, { message: 'O endereço de email fornecido é inválido.' })
  @IsNotEmpty({ message: 'O endereço de email é obrigatório.' })
  email!: string;
}
