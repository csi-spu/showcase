import { IsInt, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class ContributorSearchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
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
