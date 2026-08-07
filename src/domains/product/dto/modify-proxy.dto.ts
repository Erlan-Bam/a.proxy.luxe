import { Type } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsInt,
  ValidateNested,
  ValidateIf,
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

  @ValidateIf(
    (_object, value) =>
      value !== null && value !== undefined && value !== 'each_request',
  )
  @IsInt()
  @Min(-1)
  @Max(3600)
  rotation: number | 'each_request' | null;

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
