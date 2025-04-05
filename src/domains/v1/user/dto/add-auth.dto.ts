import { IsString, Matches } from 'class-validator';

export class AddAuthDto {
  @IsString()
  orderId: string;

  @IsString()
  @Matches(
    /^(?:\d{1,3}(?:\.\d{1,3}){3}|[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+|(?:[a-fA-F0-9]{1,4}:){1,7}[a-fA-F0-9]{1,4})$/,
    {
      message: 'auth must be in format "login:password", IPv4, or IPv6 address',
    },
  )
  auth: string;
}
