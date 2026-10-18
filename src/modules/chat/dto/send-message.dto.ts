import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    example: 'Olá! Confirmo que chego ao local às 14h com as ferramentas necessárias.',
    description: 'Conteúdo textual da mensagem a enviar no chat temporário',
  })
  @IsString()
  @IsNotEmpty({ message: 'O conteúdo da mensagem não pode estar vazio.' })
  @MinLength(1, { message: 'A mensagem deve conter pelo menos 1 caractere.' })
  @MaxLength(3000, { message: 'A mensagem não pode exceder 3000 caracteres.' })
  content!: string;
}
