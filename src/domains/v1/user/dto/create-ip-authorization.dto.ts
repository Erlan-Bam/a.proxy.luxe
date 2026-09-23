import { IsIP, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateIpAuthorizationDto {
  @IsIP()
  ip: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  providerProxyId?: string;
}
