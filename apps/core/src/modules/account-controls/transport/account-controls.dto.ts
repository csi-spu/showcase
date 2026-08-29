import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

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
