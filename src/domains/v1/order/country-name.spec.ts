import { matchesOrderCountry } from './country-name';

describe('matchesOrderCountry', () => {
  it('matches current v2 country names', () => {
    expect(matchesOrderCountry('Germany', 'Germany')).toBe(true);
  });

  it('accepts country names stored by the previous purchase form', () => {
    expect(matchesOrderCountry('Germany', 'Proxy of Germany')).toBe(true);
    expect(matchesOrderCountry('USA', 'Proxy of US')).toBe(true);
    expect(matchesOrderCountry('Czechia', 'Proxy of Czech')).toBe(true);
    expect(matchesOrderCountry('Korea', 'South Korea')).toBe(true);
  });

  it('does not match another country', () => {
    expect(matchesOrderCountry('France', 'Proxy of Germany')).toBe(false);
  });
});
