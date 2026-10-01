import {
  desiredResidentExpiry,
  parseResidentDate,
  safeResidentExpiry,
} from './resident-provisioner';

describe('resident expiry boundaries', () => {
  it.each([
    ['2026-10-01', '31.10.2026'],
    ['2026-01-31', '27.02.2026'],
    ['2028-01-31', '28.02.2028'],
    ['2026-12-15', '14.01.2027'],
  ])('uses a clamped UTC calendar month for %s', (now, expected) => {
    expect(desiredResidentExpiry(new Date(`${now}T23:59:59Z`))).toBe(expected);
  });

  it('uses the explicit exclusive bound only when the provider reports one', () => {
    expect(
      safeResidentExpiry(
        '31.10.2026',
        '30.10.2026 23:59:59',
        new Date('2026-10-01'),
        '30.10.2026',
      ),
    ).toBe('29.10.2026');
  });

  it.each(['31.02.2026', 'not-a-date', null, { date: '2026-13-01' }])(
    'rejects invalid dates %p',
    (value) => {
      expect(() => parseResidentDate(value)).toThrow();
    },
  );

  it('rejects an already expired parent before purchase', () => {
    expect(() =>
      safeResidentExpiry('31.10.2026', '01.10.2026', new Date('2026-10-01')),
    ).toThrow();
  });
});
