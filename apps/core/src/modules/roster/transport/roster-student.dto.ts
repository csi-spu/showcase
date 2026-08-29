import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRosterStudentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstNameTh!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastNameTh!: string;

  @IsString()
  @Matches(/^[0-9]{8}$/)
  studentId!: string;
}
