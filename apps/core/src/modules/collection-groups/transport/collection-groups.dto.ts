import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
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
import {
  MAX_MEMBERS_PER_REQUEST,
  MAX_STUDENT_IDS_PER_RESOLVE,
} from '../domain/member-selection-policy';

export const MAX_STUDENT_PAGE_SIZE = 50;

export class CreateRoundDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

class MemberAccountIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MEMBERS_PER_REQUEST)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberAccountIds!: string[];
}

export class AddMembersDto extends MemberAccountIdsDto {}

export class CreateGroupWithMembersDto extends MemberAccountIdsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class CreateRoundWithGroupAndMembersDto extends MemberAccountIdsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  roundName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  groupName!: string;

  @IsUUID('4')
  idempotencyKey!: string;
}

class StudentSelectionQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2400)
  @Max(2700)
  entryYear?: number;

  @IsOptional()
  @IsUUID('4')
  groupId?: string;
}

export class ListStudentsQueryDto extends StudentSelectionQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_STUDENT_PAGE_SIZE)
  limit?: number;
}

export class SelectAllStudentsQueryDto extends StudentSelectionQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_MEMBERS_PER_REQUEST)
  selectedCount!: number;
}

/* Student IDs travel only in this request body, never in a URL or response. */
export class ResolveStudentIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_STUDENT_IDS_PER_RESOLVE)
  @IsString({ each: true })
  @Matches(/^\d{8}$/, { each: true })
  studentIds!: string[];

  @IsOptional()
  @IsUUID('4')
  groupId?: string;
}

export class WithdrawMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}

export class ReinstateMemberDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2_000)
  reason!: string;
}
