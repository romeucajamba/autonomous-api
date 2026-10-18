import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendActivationCodeDto {
  @ApiProperty({
    example: '923456789',
    description: 'Número de telemóvel cadastrado (ou email da conta) para reenvio do código SMS',
  })
  @IsNotEmpty({ message: 'O telemóvel ou email é obrigatório.' })
  @IsString({ message: 'O identificador deve ser um texto válido.' })
  phoneOrEmail: string;
}
