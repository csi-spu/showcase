import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export class ContributorSearchDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^(?:[0-9]{1,8}|(?=.*[^0-9]).{2,100})$/u)
  query!: string;
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
  attributionName!: string;
}

export class RemoveContributorDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  expectedVersion!: number;

  @IsUUID('4')
  idempotencyKey!: string;
}
