import { Decimal } from '@prisma/client/runtime/library';
import { UserService } from './user.service';

describe('partner referral statistics', () => {
  const registered = new Date('2026-09-01T00:00:00Z');
  const order = (overrides = {}) => ({
    id: 'order-1', status: 'PAID', totalPrice: new Decimal('2.40'),
    orderId: 'provider-1', orderNumber: 'NS-1', createdAt: new Date('2026-09-02T00:00:00Z'),
    partnerId: 'partner', partnerCommission: new Decimal('0.36'),
    partnerCommissionRecordedAt: new Date('2026-09-02T00:00:00Z'), ...overrides,
  });
  function setup(orders: any[], payouts: any[] = [], transactions: any[] = []) {
    const referral = { id: 'ref', partnerId: 'partner', userId: 'buyer', createdAt: registered,
      user: { orders } };
    const prisma = {
      referral: { findMany: jest.fn().mockResolvedValue([referral]) },
      partnerTransaction: { findMany: jest.fn().mockResolvedValue(transactions) },
      partnerPayoutRequest: { findFirst: jest.fn().mockResolvedValue(payouts[0] ?? null), findMany: jest.fn().mockResolvedValue(payouts) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'partner', totalPartnerEarn: new Decimal('99') }) },
      $transaction: jest.fn((queries) => Promise.all(queries)),
    };
    return { service: new UserService(prisma as any, null as any), prisma };
  }

  it('returns actual purchase totals and persisted commissions without private user details', async () => {
    const { service, prisma } = setup([order(), order({ id: 'order-2', orderId: 'provider-2', orderNumber: 'NS-2', totalPrice: new Decimal('0.10'), partnerCommission: new Decimal('0.015') })]);
    const result = await service.getPartnerDetails('partner');
    expect(result.referrals[0]).toEqual({ id: 'ref', partnerId: 'partner', userId: 'buyer', createdAt: registered,
      purchasesCount: 2, purchasesTotal: '2.5', commissionAmount: '0.375', recordedCommission: '0.375', commissionComplete: true });
    expect(prisma.referral.findMany.mock.calls[0][0]).toMatchObject({ where: { partnerId: 'partner' }, include: { user: { select: { orders: { where: { status: 'PAID' } } } } } });
  });

  it('does not invent historical commissions or count duplicated provider purchases twice', async () => {
    const legacy = order({ partnerId: null, partnerCommission: null, partnerCommissionRecordedAt: null });
    const { service } = setup([legacy, { ...legacy, id: 'old-source-row', createdAt: new Date('2026-09-01T01:00:00Z') }, order({ id: 'new', orderNumber: 'NS-2', orderId: 'p2' })]);
    const result = await service.getPartnerDetails('partner');
    expect(result.referrals[0]).toMatchObject({ purchasesCount: 2, purchasesTotal: '4.8', commissionAmount: null, recordedCommission: '0.36', commissionComplete: false });
  });

  it('shows real zero when the referral has no purchases', async () => {
    const { service } = setup([]);
    expect((await service.getPartnerDetails('partner')).referrals[0]).toMatchObject({ purchasesCount: 0, purchasesTotal: '0', commissionAmount: '0', commissionComplete: true });
  });

  it('serializes small decimal values without scientific notation', async () => {
    const { service } = setup([order({ totalPrice: new Decimal('0.000001'), partnerCommission: new Decimal('0.00000015') })], [], [{ amount: new Decimal('0.00000015'), createdAt: registered }]);
    const result = JSON.parse(JSON.stringify(await service.getPartnerDetails('partner')));
    expect(result.availableBalance).toBe('0.00000015');
    expect(result.allTimeEarn).toBe('0.00000015');
    expect(result.referrals[0].commissionAmount).toBe('0.00000015');
  });

  it('does not include purchases before referral registration or commissions assigned elsewhere', async () => {
    const { service } = setup([order({ createdAt: new Date('2026-08-01T00:00:00Z'), partnerCommissionRecordedAt: new Date('2026-08-01T00:00:00Z') }), order({ id: 'other', orderNumber: 'NS-2', partnerId: 'other-partner' })]);
    expect((await service.getPartnerDetails('partner')).referrals[0]).toMatchObject({ purchasesCount: 1, purchasesTotal: '2.4', commissionAmount: '0', commissionComplete: true });
  });

  it('summarizes unpaid earnings plus completed payouts without counting pending payouts twice', async () => {
    const { service } = setup([], [{ status: 'PAID', amount: new Decimal('10') }, { status: 'PENDING', amount: new Decimal('5') }], [{ amount: new Decimal('5.2'), createdAt: registered }]);
    const result = await service.getPartnerDetails('partner');
    expect(String(result.availableBalance)).toBe('5.2');
    expect(String(result.allTimeEarn)).toBe('15.2');
  });
});
