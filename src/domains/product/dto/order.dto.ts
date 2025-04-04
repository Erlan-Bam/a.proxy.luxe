import { Proxy } from '@prisma/client';

export interface OrderInfo {
  type: Proxy;
  orderId?: string;
  protocol?: string | undefined;
  countryId?: number | undefined;
  periodId?: string | undefined;
  coupon?: string;
  tariff?: string | undefined;
  paymentId: number;
  quantity?: number;
  authorization?: string;
  targetId?: number;
  tariffId?: number;
  targetSectionId?: number;
  customTargetName?: null | string;
}
