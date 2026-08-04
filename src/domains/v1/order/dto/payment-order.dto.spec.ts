import { ProxyType } from '@prisma/client';
import { validate } from 'class-validator';
import { FinishOrderDto } from './payment-order.dto';

describe('FinishOrderDto', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';

  it.each([ProxyType.HTTPS, ProxyType.SOCKS5])(
    'accepts the %s IPv6 protocol',
    async (proxyType) => {
      const dto = Object.assign(new FinishOrderDto(), { orderId, proxyType });

      await expect(validate(dto)).resolves.toHaveLength(0);
    },
  );

  it('rejects unsupported proxy protocols', async () => {
    const dto = Object.assign(new FinishOrderDto(), {
      orderId,
      proxyType: 'HTTP',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'proxyType')).toBe(true);
  });
});
