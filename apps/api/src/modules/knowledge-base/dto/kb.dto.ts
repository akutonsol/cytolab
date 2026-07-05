import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { KbArticleStatus } from '@prisma/client';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' ? true : value === false || value === 'false' ? false : value;

// ─── Categories ───────────────────────────────────────────────────────────────

export class CreateCategoryDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── Articles ─────────────────────────────────────────────────────────────────

export class CreateArticleDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() categoryId!: string;
  @IsString() content!: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isPinned?: boolean;
  @IsOptional() @IsEnum(KbArticleStatus) status?: KbArticleStatus;
}

export class UpdateArticleDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() excerpt?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isPinned?: boolean;
}

export class ArticleQueryDto {
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(KbArticleStatus) status?: KbArticleStatus;
  /** Comma-separated tag list; an article matches if it carries any of them. */
  @IsOptional() @IsString() tags?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() isPinned?: boolean;
}

export class FeedbackDto {
  @IsBoolean() helpful!: boolean;
  @IsOptional() @IsString() comment?: string;
}

export class SearchQueryDto {
  @IsOptional() @IsString() q?: string;
}
