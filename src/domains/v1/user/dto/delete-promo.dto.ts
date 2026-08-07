import { IsNotEmpty, IsString } from 'class-validator';

export class DeletePromocodeDTO {
  @IsString()
  @IsNotEmpty()
  code: string;
}
