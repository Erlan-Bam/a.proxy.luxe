import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class ResetPasswordEmailDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsIn(['ru', 'en'])
  lang?: 'ru' | 'en';
}
