import { IsIP } from 'class-validator';

export class CreateIpAuthorizationDto {
  @IsIP()
  ip: string;
}
