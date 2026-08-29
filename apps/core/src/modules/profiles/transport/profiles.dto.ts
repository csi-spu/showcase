import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class ProfileLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;

  @IsString()
  @MaxLength(2_048)
  @IsUrl({ protocols: ['https'], require_protocol: true, require_valid_protocol: true })
  url!: string;
}

export class UpdateProfileDto {
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(500)
  bio!: string | null;

  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ProfileLinkDto)
  links!: ProfileLinkDto[];

  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID('4')
  photoId!: string | null;
}

export class GrantProfileConsentDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,63}$/)
  consentTextVersion!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class WithdrawProfileConsentDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class CreateProfilePhotoUploadDto {
  @IsInt()
  @Min(1)
  @Max(2_097_152)
  byteSize!: number;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: string;
}
