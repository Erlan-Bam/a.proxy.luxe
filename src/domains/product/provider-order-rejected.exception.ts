import { HttpException } from '@nestjs/common';

/**
 * The provider returned an explicit response that rejected the purchase.
 * No purchase was created, so the local order may safely be offered again.
 */
export class ProviderOrderRejectedException extends HttpException {
  constructor(message: string, status = 400) {
    super(message, status);
  }
}
