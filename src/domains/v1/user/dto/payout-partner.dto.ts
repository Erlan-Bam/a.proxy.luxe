import { User } from '@prisma/client';
import { IsOptional, IsString } from 'class-validator';

export class PayoutPartner {
  @IsString()
  wallet: string;

  @IsOptional()
  user: User;
}
