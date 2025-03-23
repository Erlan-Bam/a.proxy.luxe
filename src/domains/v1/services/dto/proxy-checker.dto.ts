import {
  IsArray,
  ArrayNotEmpty,
  IsString,
  Matches,
  IsBoolean,
} from 'class-validator';

export class CheckProxyDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Matches(
    /^(([^:@\s]+:[^:@\s]+:[\d.]+:\d+)|([\d.]+:\d+)|(socks[45]:\/\/[^:@\s]+:[^:@\s]+@[\d.]+:\d+)|(socks[45]:\/\/[\d.]+:\d+))$/,
    {
      each: true,
      message:
        'Each proxy must be in format "user:pass:ip:port", "ip:port", or valid socks4/socks5 URI',
    },
  )
  proxies: string[];

  @IsBoolean({ message: 'Add country must be specified' })
  addCountry: boolean;
}
