import { Language } from '@prisma/client';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsEnum,
} from 'class-validator';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsEnum(Language)
  lang: Language;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
