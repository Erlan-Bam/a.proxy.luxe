import { User } from '@prisma/client';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AddPromocodeDTO {
  @IsOptional()
  user: User;

  @IsString()
  promocode: string;

  @IsInt()
  @Min(1)
  @Max(100)
  discount: number;

  @IsInt()
  @IsPositive()
  limit: number;
}
