import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import type { WorkRecoveryOperation } from '../domain/work-recovery-policy';

export class WorkRecoveryTransitionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsIn(['archive', 'restore_active', 'restore_publication', 'unpublish'])
  operation!: WorkRecoveryOperation;

  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  reason!: string;
}

export class CreateRemovalRequestDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedWorkVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  reason!: string;
}

export class CancelRemovalRequestDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class DecideRemovalRequestDto extends CancelRemovalRequestDto {
  @IsIn(['approve', 'decline'])
  decision!: 'approve' | 'decline';

  @ValidateIf((input: DecideRemovalRequestDto) => input.decision === 'decline')
  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  decisionReason?: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedWorkVersion!: number;
}

export class RemovalRequestQueueQueryDto {
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

export class CreateAttributionRemovalRequestDto {
  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  reason!: string;
}

export class DeclineAttributionRemovalRequestDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1_000)
  decisionReason!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRequestVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class ApproveAttributionRemovalRequestDto {
  @IsUUID('4')
  expectedPublishedRevisionPublicId!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedPublishedRevisionVersion!: number;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedRequestVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}
