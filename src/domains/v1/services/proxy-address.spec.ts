import { formatProxyUrl } from './proxy-address';

describe('formatProxyUrl', () => {
  it('brackets a raw IPv6 host in a SOCKS URL', () => {
    expect(
      formatProxyUrl('socks5h', '2001:db8::10', '1080', 'user', 'pass'),
    ).toBe('socks5h://user:pass@[2001:db8::10]:1080');
  });

  it('does not double-bracket an IPv6 host', () => {
    expect(formatProxyUrl('http', '[2001:db8::10]', '8080')).toBe(
      'http://[2001:db8::10]:8080',
    );
  });

  it('keeps an IPv4 host unchanged', () => {
    expect(formatProxyUrl('socks5', '203.0.113.10', '1080')).toBe(
      'socks5://203.0.113.10:1080',
    );
  });

  it('percent-encodes credentials used in a proxy URL', () => {
    expect(
      formatProxyUrl('http', '203.0.113.10', '8080', 'user@name', 'p:a ss'),
    ).toBe('http://user%40name:p%3Aa%20ss@203.0.113.10:8080');
  });
});
