import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import type { RosterConflictResolution } from '../domain/roster-conflict-resolution';

export class ListRosterConflictsQuery {
  @IsInt()
  @IsOptional()
  @Min(2)
  @Type(() => Number)
  afterRowNumber?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class ResolveRosterConflictDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  reason?: string;

  @IsIn(['keep_existing', 'accept_incoming_name'])
  resolution!: RosterConflictResolution;
}
