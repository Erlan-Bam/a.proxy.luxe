import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  Matches,
  IsBoolean,
} from 'class-validator';

// IPv4: 1.2.3.4
// IPv6 in brackets: [2001:db8::1]
const IPV4 = '[\\d.]+';
const IPV6_BRACKETED = '\\[[0-9a-fA-F:]+\\]';
const IP = `(?:${IPV4}|${IPV6_BRACKETED})`;

// Supported formats:
// ip:port                              (IPv4 public)
// [ipv6]:port                          (IPv6 public)
// user:pass:ip:port                    (IPv4 private)
// user:pass:[ipv6]:port                (IPv6 private)
// socks4|5://user:pass@ip:port         (IPv4 socks with auth)
// socks4|5://ip:port                   (IPv4 socks public)
// socks4|5://user:pass@[ipv6]:port     (IPv6 socks with auth)
// socks4|5://[ipv6]:port               (IPv6 socks public)
const PROXY_REGEX = new RegExp(
  `^(` +
    `[^:@\\s]+:[^:@\\s]+:${IP}:\\d+` +           // user:pass:ip:port
    `|${IP}:\\d+` +                                // ip:port
    `|socks[45]:\\/\\/[^:@\\s]+:[^:@\\s]+@${IP}:\\d+` + // socks with auth
    `|socks[45]:\\/\\/${IP}:\\d+` +                // socks without auth
  `)$`,
);

export class CheckProxyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(PROXY_REGEX, {
    each: true,
    message:
      'Each proxy must be in format "user:pass:ip:port", "ip:port", "[ipv6]:port", or valid socks4/socks5 URI',
  })
  proxies: string[];

  @IsBoolean({ message: 'Add country must be specified' })
  addCountry: boolean;
}
