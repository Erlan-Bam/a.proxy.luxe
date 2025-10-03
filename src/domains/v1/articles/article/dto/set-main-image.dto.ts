import { IsString, IsNotEmpty } from 'class-validator';

export class SetMainImageDto {
  @IsString()
  @IsNotEmpty()
  mainImage: string;
}
