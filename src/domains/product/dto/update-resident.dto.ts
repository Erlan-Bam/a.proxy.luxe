import { User } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateResident {
  @IsInt()
  @Min(-1)
  @Max(3600)
  @IsOptional()
  rotation: number;

  @IsString()
  @IsOptional()
  traffic_limit: string;

  @IsString()
  package_key: number;

  @IsOptional()
  user: User;
}
