import { User } from '@prisma/client';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ProlongResidentDto {
  @IsUUID()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  packageKey: string;

  @IsOptional()
  user: User;
}
