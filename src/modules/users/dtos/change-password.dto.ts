import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'SenhaAtual123!',
    description: 'Palavra-passe atual da conta para validação de segurança',
  })
  @IsString()
  @IsNotEmpty({ message: 'A palavra-passe atual é obrigatória.' })
  currentPassword!: string;

  @ApiProperty({
    example: 'NovaSenhaSegura456#',
    description: 'Nova palavra-passe desejada (mínimo de 8 caracteres)',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'A nova palavra-passe deve ter no mínimo 8 caracteres.' })
  newPassword!: string;
}
