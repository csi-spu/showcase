const NAME_PART_MAX_LENGTH = 100;
const ATTRIBUTION_NAME_MAX_LENGTH = 100;
const CONTRIBUTION_ROLE_MAX_LENGTH = 100;

export function validateExactStudentId(value: string): boolean {
  return /^[0-9]{8}$/u.test(value);
}

export function normalizeContributionRole(value: string): string | null {
  const role = value.trim();
  return role.length >= 1 && role.length <= CONTRIBUTION_ROLE_MAX_LENGTH ? role : null;
}

export function normalizeExternalContributor(input: {
  contributionRole: string;
  firstName: string;
  lastName: string;
}): { attributionName: string; contributionRole: string } | null {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const contributionRole = normalizeContributionRole(input.contributionRole);
  const attributionName = `${firstName} ${lastName}`;
  return firstName.length >= 1 &&
    firstName.length <= NAME_PART_MAX_LENGTH &&
    lastName.length >= 1 &&
    lastName.length <= NAME_PART_MAX_LENGTH &&
    attributionName.length <= ATTRIBUTION_NAME_MAX_LENGTH &&
    contributionRole !== null
    ? { attributionName, contributionRole }
    : null;
}
