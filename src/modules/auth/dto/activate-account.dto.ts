import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateAccountDto {
  @ApiProperty({
    example: '923456789',
    description: 'Número de telemóvel cadastrado (ou email da conta) para validação do código',
  })
  @IsNotEmpty({ message: 'O número de telemóvel ou email é obrigatório.' })
  @IsString({ message: 'O identificador deve ser um texto válido.' })
  phoneOrEmail: string;

  @ApiProperty({
    example: '482910',
    description: 'Código de confirmação de 6 dígitos recebido por SMS',
    minLength: 6,
    maxLength: 6,
  })
  @IsNotEmpty({ message: 'O código de ativação é obrigatório.' })
  @IsString({ message: 'O código de ativação deve ser um texto válido.' })
  @Length(6, 6, { message: 'O código de ativação deve conter exatamente 6 dígitos.' })
  code: string;
}
