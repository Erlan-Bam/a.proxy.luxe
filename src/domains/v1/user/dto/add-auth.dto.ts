import { IsIP, IsString, Matches } from 'class-validator';

export class AddAuthDto {
  @IsString()
  orderNumber: string;

  @IsIP()
  ip: string;
}
