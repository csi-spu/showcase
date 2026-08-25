import { z } from 'zod';
import { caseFold } from 'unicode-case-folding';
import type {
  WorkAuthoringContext,
  WorkMutationInput,
  WorkUpdateInput,
} from './student-works-core';

export type WorkField =
  | 'academicPeriod'
  | 'category'
  | 'description'
  | 'form'
  | 'links'
  | 'summary'
  | 'tags'
  | 'title'
  | 'videoLinks';

export type WorkFormValidation =
  | { fieldErrors: WorkField[]; success: false }
  | { data: WorkMutationInput | WorkUpdateInput; success: true };

const baseSchema = z.object({
  academicYear: z.coerce.number().int().min(2400).max(2700),
  category: z.enum(['course_work', 'competition_entry', 'academic_article']),
  description: trimmedString(1, 10_000),
  expectedVersion: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  idempotencyKey: z.uuid(),
  semester: z.enum(['1', '2', 'summer']),
  summary: trimmedString(1, 300),
  title: trimmedString(1, 150),
});

const BASE_FIELDS = [
  'academicYear',
  'category',
  'description',
  'expectedVersion',
  'idempotencyKey',
  'semester',
  'summary',
  'title',
] as const;
const COLLECTION_FIELDS = [
  ...Array.from({ length: 5 }, (_, index) => [
    `linkLabel${index}`,
    `linkUrl${index}`,
    `tag${index}`,
  ]).flat(),
  ...Array.from({ length: 3 }, (_, index) => `videoLink${index}`),
];
const ALLOWED_FIELDS = new Set<string>([...BASE_FIELDS, ...COLLECTION_FIELDS]);

export function validateWorkForm(
  formData: FormData,
  context: WorkAuthoringContext,
): WorkFormValidation {
  for (const key of formData.keys()) {
    if (!ALLOWED_FIELDS.has(key) || formData.getAll(key).length !== 1) {
      return invalid('form');
    }
  }

  const rawExpectedVersion = formData.get('expectedVersion');
  const parsed = baseSchema.safeParse({
    academicYear: stringValue(formData, 'academicYear'),
    category: stringValue(formData, 'category'),
    description: stringValue(formData, 'description'),
    expectedVersion:
      typeof rawExpectedVersion === 'string' && rawExpectedVersion.length > 0
        ? rawExpectedVersion
        : undefined,
    idempotencyKey: stringValue(formData, 'idempotencyKey'),
    semester: stringValue(formData, 'semester'),
    summary: stringValue(formData, 'summary'),
    title: stringValue(formData, 'title'),
  });
  if (!parsed.success) {
    return invalid(mapBaseField(parsed.error.issues[0]?.path[0]));
  }
  if (
    parsed.data.academicYear < context.entryYear ||
    parsed.data.academicYear > context.currentAcademicYear
  ) {
    return invalid('academicPeriod');
  }

  const links = parseLinks(formData);
  if (links === null) return invalid('links');
  const tags = parseTags(formData);
  if (tags === null) return invalid('tags');
  const videoLinks = parseVideoLinks(formData);
  if (videoLinks === null) return invalid('videoLinks');

  const data: WorkMutationInput = {
    academicPeriod: {
      semester: parsed.data.semester,
      year: parsed.data.academicYear,
    },
    category: parsed.data.category,
    description: parsed.data.description,
    idempotencyKey: parsed.data.idempotencyKey,
    links,
    summary: parsed.data.summary,
    tags,
    title: parsed.data.title,
    videoLinks,
  };
  return {
    data:
      parsed.data.expectedVersion === undefined
        ? data
        : { ...data, expectedVersion: parsed.data.expectedVersion },
    success: true,
  };
}

function parseVideoLinks(formData: FormData): string[] | null {
  const videoLinks: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const value = stringValue(formData, `videoLink${index}`).trim();
    if (value.length === 0) continue;
    if (value.length > 2_048) return null;
    videoLinks.push(value);
  }
  return videoLinks;
}

function parseLinks(formData: FormData): WorkMutationInput['links'] | null {
  const links: WorkMutationInput['links'] = [];
  const urls = new Set<string>();
  for (let index = 0; index < 5; index += 1) {
    const label = stringValue(formData, `linkLabel${index}`).trim();
    const rawUrl = stringValue(formData, `linkUrl${index}`);
    if (label.length === 0 && rawUrl.length === 0) continue;
    if (label.length === 0 || label.length > 50 || rawUrl.length > 2_048) return null;
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (
      url.protocol !== 'https:' ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.href.length > 2_048 ||
      urls.has(url.href)
    ) {
      return null;
    }
    urls.add(url.href);
    links.push({ label, url: url.href });
  }
  return links;
}

function parseTags(formData: FormData): string[] | null {
  const tags: string[] = [];
  const identities = new Set<string>();
  for (let index = 0; index < 5; index += 1) {
    const displayLabel = stringValue(formData, `tag${index}`)
      .normalize('NFKC')
      .trim()
      .replace(/\s+/gu, ' ');
    if (displayLabel.length === 0) continue;
    if (displayLabel.length > 50) return null;
    const identity = caseFold(displayLabel);
    if (identities.has(identity)) return null;
    identities.add(identity);
    tags.push(displayLabel);
  }
  return tags;
}

function trimmedString(minimum: number, maximum: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(minimum).max(maximum));
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function invalid(field: WorkField | undefined): WorkFormValidation {
  return { fieldErrors: [field ?? 'form'], success: false };
}

function mapBaseField(field: PropertyKey | undefined): WorkField {
  if (field === 'academicYear' || field === 'semester') return 'academicPeriod';
  if (field === 'category' || field === 'description' || field === 'summary' || field === 'title') {
    return field;
  }
  return 'form';
}
