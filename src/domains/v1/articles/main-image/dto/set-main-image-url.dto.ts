import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class SetMainImageUrlDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  mainImageUrl: string;
}
