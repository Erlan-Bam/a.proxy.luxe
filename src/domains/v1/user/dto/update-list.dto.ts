import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateListDto {
  @IsInt()
  @Type(() => Number)
  listId: number;

  @IsString()
  packageKey: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(1)
  rotation: number;
}
