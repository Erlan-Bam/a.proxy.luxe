import {
  IsString,
  IsNumberString,
  IsOptional,
  IsUrl,
  IsIn,
} from 'class-validator';

export class DigisellerPaymentDto {
  @IsNumberString()
  invoice_id: string;

  @IsString()
  amount: string;

  @IsIn(['USD', 'RUB', 'EUR'])
  currency: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  lang?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsNumberString()
  payment_id?: string;

  @IsOptional()
  @IsUrl()
  return_url?: string;

  @IsOptional()
  @IsString()
  uid?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}
