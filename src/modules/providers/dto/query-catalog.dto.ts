import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCatalogDto {
  @ApiPropertyOptional({
    description: 'Termo de pesquisa por nome ou descrição do serviço',
    example: 'Torneira',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar serviços de um prestador específico (ID do perfil ou do utilizador)',
  })
  @IsOptional()
  @IsString()
  providerId?: string;

  @ApiPropertyOptional({
    description: 'Preço mínimo em Kwanzas (AOA)',
    example: 5000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Preço máximo em Kwanzas (AOA)',
    example: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

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
