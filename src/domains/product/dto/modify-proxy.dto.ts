import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  ValidateNested,
} from 'class-validator';

class GeoDTO {
  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  isp?: string;
}

export class ModifyProxyResidentDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(-1)
  @Max(3600)
  rotation: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  ports: number;

  @IsString()
  whitelist: string;

  @IsString()
  package_key: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoDTO)
  geo: GeoDTO;
}
