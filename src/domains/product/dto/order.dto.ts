import { Proxy } from '@prisma/client';

export interface OrderInfo {
  type: Proxy;
  orderId?: string;
  sourceOrderId?: string;
  charge?: string;
  discountCode?: string;
  protocol?: string | undefined;
  countryId?: number | string | undefined;
  periodId?: string | undefined;
  coupon?: string;
  tariff?: string | undefined;
  paymentId: number;
  quantity?: number;
  authorization?: string;
  targetId?: number;
  tariffId?: number | string;
  targetSectionId?: number;
  customTargetName?: null | string;
  userId: string;
}
