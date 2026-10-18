import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token de longa duração obtido no login ou no registo. Também pode ser enviado via header Authorization: Bearer <token> ou x-refresh-token.',
  })
  @IsOptional()
  @IsString({ message: 'O refresh token deve ser um texto válido.' })
  refreshToken?: string;
}
