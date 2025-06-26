import { Proxy, User } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class ProlongDto {
  @IsUUID()
  orderId: string;

  @IsEnum(Proxy)
  type: Proxy;

  @IsString()
  id: number;

  @IsEnum({
    '1m': '1m',
    '3m': '3m',
    '6m': '6m',
  })
  periodId: string;

  @IsOptional()
  user: User;
}
