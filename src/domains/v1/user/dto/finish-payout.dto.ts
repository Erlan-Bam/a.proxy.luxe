import { PaymentStatus } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class FinishPayoutDto {
  @IsUUID()
  id: string;

  @IsEnum(PaymentStatus)
  status: PaymentStatus;
}
