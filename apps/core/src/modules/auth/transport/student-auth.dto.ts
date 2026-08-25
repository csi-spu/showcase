import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class StudentLoginDto {
  @IsString()
  @Matches(/^\d{8}$/)
  studentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class StudentChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  newPassword!: string;
}
