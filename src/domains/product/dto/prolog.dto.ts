import { Proxy, User } from '@prisma/client';
import { IsDefined, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ProlongDto {
  @IsUUID()
  orderId: string;

  @IsEnum(Proxy)
  type: Proxy;

  @IsDefined()
  id: string | string[];

  @IsEnum({
    '1m': '1m',
    '3m': '3m',
    '6m': '6m',
  })
  periodId: string;

  @IsOptional()
  user: User;
}
