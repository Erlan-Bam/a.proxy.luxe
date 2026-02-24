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

// Supported formats (erlan: ip:port:user:pass):
// ip:port                              (IPv4 public)
// [ipv6]:port                          (IPv6 public)
// ip:port:user:pass                    (IPv4 private)
// [ipv6]:port:user:pass                (IPv6 private)
// socks4|5://user:pass@ip:port         (IPv4 socks with auth)
// socks4|5://ip:port                   (IPv4 socks public)
// socks4|5://user:pass@[ipv6]:port     (IPv6 socks with auth)
// socks4|5://[ipv6]:port               (IPv6 socks public)
const PROXY_REGEX = new RegExp(
  `^(` +
    `${IP}:\\d+(?::[^:@\\s]+:[^:@\\s]+)?` +       // ip:port or ip:port:user:pass
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
      'Each proxy must be in format "ip:port:user:pass", "ip:port", "[ipv6]:port", or valid socks4/socks5 URI',
  })
  proxies: string[];

  @IsBoolean({ message: 'Add country must be specified' })
  addCountry: boolean;
}
