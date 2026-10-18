import { IsInt, IsOptional, IsString, Max, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryBookingRequestsDto {
  @ApiPropertyOptional({
    description: 'Filtrar por estado da solicitação',
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
    example: 'pending',
  })
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'accepted', 'rejected', 'cancelled', 'completed'], {
    message: 'Status inválido. Valores aceites: pending, accepted, rejected, cancelled, completed.',
  })
  status?: string;

  @ApiPropertyOptional({
    description: 'Página da listagem',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Quantidade de registos por página',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
