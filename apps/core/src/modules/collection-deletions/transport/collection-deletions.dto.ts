import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class DeleteCollectionItemDto {
  /* Names and titles are at most 200 characters; Core compares it trimmed. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  confirmationName!: string;
}

export class RestoreCollectionDeletionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  @Matches(/\S/u)
  reason!: string;
}

/**
 * One page of the deletion log.
 *
 * The cursor is only shape-checked here; Core decodes it and rejects one it
 * did not issue with `COLLECTION_DELETION_CURSOR_INVALID`.
 */
export class CollectionDeletionLogQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;
}
