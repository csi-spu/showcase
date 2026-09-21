import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class InstructorLoginDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{2,63}$/)
  instructorLogin!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class InstructorChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  newPassword!: string;
}
