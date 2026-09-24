import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import {
  MAX_OVERVIEW_ATTENTION_LIMIT,
  MAX_OVERVIEW_PROGRESS_LIMIT,
  MAX_OVERVIEW_UPCOMING_LIMIT,
  MAX_STUDENT_ATTENTION_LIMIT,
} from '../application/collection-overview.service';

/**
 * Entry Year is a Buddhist-era academic year, so the bounds are wide enough to
 * cover every cohort the roster can hold without accepting a stray timestamp.
 */
const MIN_ENTRY_YEAR = 2500;
const MAX_ENTRY_YEAR = 2700;

/**
 * The filters shared by the dashboard reads.
 *
 * Every field is optional: absent means "all active rounds", the landing-page
 * default. Unknown fields are rejected by the global validation pipe, which
 * runs with `whitelist` and `forbidNonWhitelisted`.
 */
class CollectionOverviewScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_ENTRY_YEAR)
  @Max(MAX_ENTRY_YEAR)
  entryYear?: number;

  @IsOptional()
  @IsUUID('4')
  groupId?: string;

  @IsOptional()
  @IsUUID('4')
  roundId?: string;
}

export class CollectionOverviewQueryDto extends CollectionOverviewScopeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OVERVIEW_ATTENTION_LIMIT)
  attentionLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OVERVIEW_PROGRESS_LIMIT)
  progressLimit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_OVERVIEW_UPCOMING_LIMIT)
  upcomingLimit?: number;
}

/**
 * One page of the per-Student follow-up list.
 *
 * The cursor is an opaque base64url encoding of the sort key. It never carries
 * a Student ID: Student IDs must not appear in a URL or query string.
 */
export class CollectionStudentAttentionQueryDto extends CollectionOverviewScopeQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(/^[A-Za-z0-9_-]+$/u)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_STUDENT_ATTENTION_LIMIT)
  limit?: number;
}
