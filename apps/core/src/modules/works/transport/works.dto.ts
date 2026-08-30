import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsOptional,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WORK_CATEGORIES, WORK_SEMESTERS } from '../domain/work-draft-policy';

export class WorkAcademicPeriodDto {
  @IsString()
  @IsIn(WORK_SEMESTERS)
  semester!: '1' | '2' | 'summer';

  @IsInt()
  @Min(2400)
  @Max(2700)
  year!: number;
}

export class WorkLinkDto {
  @IsString()
  label!: string;

  @IsString()
  @MaxLength(2_048)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_valid_protocol: true })
  url!: string;
}

export class CreateWorkDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkAcademicPeriodDto)
  academicPeriod?: WorkAcademicPeriodDto | null;

  @IsOptional()
  @IsString()
  @IsIn(WORK_CATEGORIES)
  category?: 'academic_article' | 'competition_entry' | 'course_work' | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => WorkLinkDto)
  links?: WorkLinkDto[];

  @IsOptional()
  @IsString()
  summary?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  submitterStudyYear?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(2_048, { each: true })
  videoLinks?: string[];
}

export class UpdateWorkDraftDto extends CreateWorkDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;
}

export class CompleteWorkDraftDto {
  @ValidateNested()
  @Type(() => WorkAcademicPeriodDto)
  academicPeriod!: WorkAcademicPeriodDto;

  @IsString()
  @IsIn(WORK_CATEGORIES)
  category!: 'academic_article' | 'competition_entry' | 'course_work';

  @IsString()
  description!: string;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => WorkLinkDto)
  links!: WorkLinkDto[];

  @IsString()
  summary!: string;

  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  tags!: string[];

  @IsString()
  title!: string;

  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(2_048, { each: true })
  videoLinks!: string[];
}

export class SeedPublishedWorkDraftDto {
  @IsUUID('4')
  expectedPublishedRevisionId!: string;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class RebaseWorkDraftDto extends SeedPublishedWorkDraftDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;
}

export class SavedDraftMutationDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class ArchiveSavedDraftDto extends SavedDraftMutationDto {
  @IsBoolean()
  @Equals(true)
  confirmation!: boolean;
}

export class CreateWorkMediaUploadDto {
  @IsInt()
  @Min(1)
  @Max(5_242_880)
  byteSize!: number;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;

  @IsString()
  @IsIn(['jpeg', 'jpg', 'png', 'webp'])
  fileExtension!: string;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @IsIn(['poster', 'gallery'])
  mediaKind!: 'gallery' | 'poster';
}

export class AttachWorkMediaDto {
  @IsUUID('4')
  assetId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @IsIn(['poster', 'gallery'])
  mediaKind!: 'gallery' | 'poster';
}

export class WorkListQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['all', ...WORK_CATEGORIES])
  category: 'academic_article' | 'all' | 'competition_entry' | 'course_work' = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page = 1;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  query = '';

  @IsOptional()
  @IsString()
  @IsIn(['updated_asc', 'updated_desc'])
  sort: 'updated_asc' | 'updated_desc' = 'updated_desc';

  @IsOptional()
  @IsString()
  @IsIn(['all', 'changes_requested', 'draft', 'pending_review', 'published'])
  status: 'all' | 'changes_requested' | 'draft' | 'pending_review' | 'published' = 'all';

  @IsOptional()
  @IsString()
  @IsIn(['current', 'saved'])
  view: 'current' | 'saved' = 'current';
}
