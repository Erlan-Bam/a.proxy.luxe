import {
  IsString,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
  Max,
  ValidateNested,
  IsInt,
  IsIP,
} from 'class-validator';
import { Type } from 'class-transformer';

class ExportFilterDto {
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

  @IsNumber()
  @Min(1)
  @Max(1000)
  ports: number;
}

export class ModifyProxyResidentDto {
  @IsString()
  title: string;

  @IsInt()
  @Min(-1)
  @Max(1)
  rotation: number;

  @IsInt()
  @Min(1)
  @Max(1000)
  ports: number;

  @IsString()
  whitelist: string;

  @IsString()
  package_key: string;
}
