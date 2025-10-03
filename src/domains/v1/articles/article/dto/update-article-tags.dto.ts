import { IsArray, IsString } from 'class-validator';

export class UpdateArticleTagsDto {
  @IsArray()
  @IsString({ each: true })
  tags: string[];
}
