import { caseFold } from 'unicode-case-folding';

const TITLE_MAX_LENGTH = 150;
const SUMMARY_MAX_LENGTH = 300;
const DESCRIPTION_MAX_LENGTH = 10_000;
const LINK_LIMIT = 5;
const LINK_LABEL_MAX_LENGTH = 50;
const LINK_URL_MAX_LENGTH = 2_048;
const TAG_LIMIT = 5;
const TAG_MAX_LENGTH = 50;

export const WORK_CATEGORIES = ['course_work', 'competition_entry', 'academic_article'] as const;
export const WORK_SEMESTERS = ['1', '2', 'summer'] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];
export type WorkSemester = (typeof WORK_SEMESTERS)[number];

export interface WorkDraftInput {
  academicPeriod: { semester: WorkSemester; year: number };
  category: WorkCategory;
  description: string;
  links: Array<{ label: string; url: string }>;
  summary: string;
  tags: string[];
  title: string;
}

export interface NormalizedWorkDraft extends Omit<WorkDraftInput, 'tags'> {
  tags: Array<{ displayLabel: string; normalizedIdentity: string }>;
}

export type WorkDraftEvaluation =
  { isValid: false } | { draft: NormalizedWorkDraft; isValid: true };

export function evaluateWorkDraft(
  input: WorkDraftInput,
  academicRange: { currentAcademicYear: number; entryYear: number },
): WorkDraftEvaluation {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const description = input.description.trim();
  if (
    !hasLengthBetween(title, 1, TITLE_MAX_LENGTH) ||
    !hasLengthBetween(summary, 1, SUMMARY_MAX_LENGTH) ||
    !hasLengthBetween(description, 1, DESCRIPTION_MAX_LENGTH) ||
    !WORK_CATEGORIES.includes(input.category) ||
    !WORK_SEMESTERS.includes(input.academicPeriod.semester) ||
    input.academicPeriod.year < academicRange.entryYear ||
    input.academicPeriod.year > academicRange.currentAcademicYear ||
    input.links.length > LINK_LIMIT ||
    input.tags.length > TAG_LIMIT
  ) {
    return { isValid: false };
  }

  const links = normalizeLinks(input.links);
  const tags = normalizeTags(input.tags);
  if (links === null || tags === null) {
    return { isValid: false };
  }

  return {
    draft: {
      academicPeriod: { ...input.academicPeriod },
      category: input.category,
      description,
      links,
      summary,
      tags,
      title,
    },
    isValid: true,
  };
}

function normalizeLinks(input: WorkDraftInput['links']): NormalizedWorkDraft['links'] | null {
  const links: NormalizedWorkDraft['links'] = [];
  const urls = new Set<string>();
  for (const link of input) {
    const label = link.label.trim();
    if (
      !hasLengthBetween(label, 1, LINK_LABEL_MAX_LENGTH) ||
      link.url.length > LINK_URL_MAX_LENGTH
    ) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(link.url);
    } catch {
      return null;
    }
    if (
      url.protocol !== 'https:' ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.href.length > LINK_URL_MAX_LENGTH ||
      urls.has(url.href)
    ) {
      return null;
    }
    urls.add(url.href);
    links.push({ label, url: url.href });
  }
  return links;
}

function normalizeTags(input: string[]): NormalizedWorkDraft['tags'] | null {
  const tags: NormalizedWorkDraft['tags'] = [];
  const identities = new Set<string>();
  for (const tag of input) {
    const displayLabel = tag.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    if (!hasLengthBetween(displayLabel, 1, TAG_MAX_LENGTH)) {
      return null;
    }
    const normalizedIdentity = caseFold(displayLabel);
    if (identities.has(normalizedIdentity)) {
      return null;
    }
    identities.add(normalizedIdentity);
    tags.push({ displayLabel, normalizedIdentity });
  }
  return tags;
}

function hasLengthBetween(value: string, minimum: number, maximum: number): boolean {
  return value.length >= minimum && value.length <= maximum;
}
