import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class StudentCollectionLoginDto {
  @IsString()
  @Matches(/^\d{8}$/)
  studentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class StudentCollectionChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  newPassword!: string;
}
