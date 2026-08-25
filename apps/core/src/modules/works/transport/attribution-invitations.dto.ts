import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAccountAttributionInvitationDto {
  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @Matches(/^[0-9]{8}$/)
  studentId!: string;
}

export class CreateExternalAttributionInvitationDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  affiliation?: string;

  @IsString()
  @MaxLength(100)
  attributionName!: string;

  @IsString()
  @MaxLength(100)
  contributionRole!: string;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class InvitationTransitionDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class AcceptAccountAttributionDto extends InvitationTransitionDto {
  @IsString()
  @MaxLength(100)
  attributionName!: string;

  @IsBoolean()
  consent!: boolean;

  @IsInt()
  @Min(1)
  @Max(8)
  studyYear!: number;
}

export class AcceptExternalAttributionDto extends InvitationTransitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  affiliation?: string;

  @IsString()
  @MaxLength(100)
  attributionName!: string;

  @IsBoolean()
  consent!: boolean;

  @IsString()
  @MaxLength(100)
  contributionRole!: string;
}

export class ExchangeExternalAttributionTokenDto {
  @IsString()
  @MaxLength(512)
  token!: string;
}

export class InvitationPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
