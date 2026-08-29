const ATTRIBUTION_NAME_MAX_LENGTH = 100;
const CONTRIBUTION_ROLE_MAX_LENGTH = 100;
const CONTRIBUTOR_SEARCH_QUERY_MIN_LENGTH = 2;
const CONTRIBUTOR_SEARCH_QUERY_MAX_LENGTH = 100;

export function validateExactStudentId(value: string): boolean {
  return /^[0-9]{8}$/u.test(value);
}

export function normalizeContributionRole(value: string): string | null {
  const role = value.trim();
  return role.length >= 1 && role.length <= CONTRIBUTION_ROLE_MAX_LENGTH ? role : null;
}

export function normalizeContributorSearchQuery(
  value: string,
): { kind: 'name'; nameQuery: string } | { kind: 'student_id'; studentId: string } | null {
  const query = normalizeHumanName(value);
  const length = Array.from(query).length;
  if (
    length < CONTRIBUTOR_SEARCH_QUERY_MIN_LENGTH ||
    length > CONTRIBUTOR_SEARCH_QUERY_MAX_LENGTH
  ) {
    return null;
  }
  if (validateExactStudentId(query)) return { kind: 'student_id', studentId: query };
  if (/^[0-9]+$/u.test(query)) return null;
  return { kind: 'name', nameQuery: query.toLocaleLowerCase('th') };
}

export function normalizeExternalContributor(input: {
  attributionName: string;
  contributionRole: string;
}): { attributionName: string; contributionRole: string } | null {
  const attributionName = normalizeHumanName(input.attributionName);
  const contributionRole = normalizeContributionRole(input.contributionRole);
  return attributionName.length >= 1 &&
    attributionName.length <= ATTRIBUTION_NAME_MAX_LENGTH &&
    contributionRole !== null
    ? { attributionName, contributionRole }
    : null;
}

function normalizeHumanName(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}
