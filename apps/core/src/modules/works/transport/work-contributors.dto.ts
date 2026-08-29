import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class ContributorLookupDto {
  @IsString()
  @Matches(/^[0-9]{8}$/u)
  studentId!: string;
}

export class ContributorMutationDto {
  @IsString()
  @MaxLength(100)
  contributionRole!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}

export class AddAccountContributorDto extends ContributorMutationDto {
  @IsUUID('4')
  candidateReference!: string;
}

export class AddExternalContributorDto extends ContributorMutationDto {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;
}

export class RemoveContributorDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}
