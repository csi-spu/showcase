import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SubmitWorkRevisionDto {
  @IsString()
  @MaxLength(100)
  attributionName!: string;

  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID('4')
  expectedBasePublishedRevisionId!: string | null;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedDraftVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsInt()
  @Min(1)
  @Max(8)
  studyYear!: number;
}

export class WithdrawWorkRevisionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRevisionVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class ReviewQueueQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
