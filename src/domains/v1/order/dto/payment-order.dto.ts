import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ProxyType } from '@prisma/client';

export class FinishOrderDto {
  @IsUUID()
  orderId: string;

  @IsString()
  @IsOptional()
  promocode?: string;

  @IsEnum(ProxyType)
  @IsOptional()
  proxyType?: ProxyType;
}
