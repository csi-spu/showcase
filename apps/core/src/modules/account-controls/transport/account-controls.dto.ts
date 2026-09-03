import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAcademicYearDto {
  @IsInt()
  @Min(2400)
  @Max(2700)
  currentAcademicYear!: number;

  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class StudentAccountLookupDto {
  @IsString()
  @Matches(/^[0-9]{8}$/)
  studentId!: string;
}

export class ExtendStudentAccessDto {
  @IsInt()
  @Min(2400)
  @Max(2700)
  accessEndsAcademicYear!: number;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}

export class ResetStudentPasswordDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class ListAccountsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class CreateAdminDto {
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  adminLogin!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstNameTh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastNameTh!: string;
}

export class SetStudentStatusDto {
  @IsIn(['active', 'suspended'])
  action!: 'active' | 'suspended';

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}

export class SetAdminStatusDto {
  @IsIn(['active', 'suspended'])
  action!: 'active' | 'suspended';

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}

export class CorrectStudentNameDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstNameTh!: string;

  @IsUUID('4')
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastNameTh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}
