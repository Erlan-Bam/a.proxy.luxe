import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SupportMessageDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  support: string;

  @IsNotEmpty()
  @IsString()
  message: string;
}
