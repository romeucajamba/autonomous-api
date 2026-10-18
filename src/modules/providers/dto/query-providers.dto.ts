import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryProvidersDto {
  @ApiPropertyOptional({
    description: 'Pesquisar por nome do prestador, biografia ou especialidade',
    example: 'Eletricista',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por área de atuação profissional',
    example: 'Eletricidade',
  })
  @IsOptional()
  @IsString()
  workArea?: string;

  @ApiPropertyOptional({
    description: 'Página da listagem de prestadores',
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
