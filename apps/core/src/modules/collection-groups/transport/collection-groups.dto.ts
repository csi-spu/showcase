import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateRoundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class CreateGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class AddMembersByStudentIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(/^\d{8}$/, { each: true })
  studentIds!: string[];
}

export class AddMemberIndividualDto {
  @IsString()
  @Matches(/^\d{8}$/)
  studentId!: string;
}

export class AddMembersByEntryYearDto {
  @IsInt()
  @Min(2400)
  @Max(2700)
  entryYear!: number;
}

export class WithdrawMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}
