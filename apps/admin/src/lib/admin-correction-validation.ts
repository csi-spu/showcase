import { z } from 'zod';

const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === 'https:');
const correctionSchema = z
  .object({
    academicPeriod: z
      .object({
        semester: z.enum(['1', '2', 'summer']),
        year: z.coerce.number().int().min(2400).max(2700),
      })
      .strict(),
    category: z.enum(['course_work', 'competition_entry', 'academic_article']),
    description: z.string().trim().min(1).max(10_000),
    expectedPublishedRevisionId: z.uuid(),
    expectedRevisionVersion: z.coerce.number().int().positive(),
    idempotencyKey: z.uuid(),
    links: z
      .array(z.object({ label: z.string().trim().min(1).max(50), url: httpsUrlSchema }).strict())
      .max(5),
    reason: z.string().trim().min(10).max(1_000),
    summary: z.string().trim().min(1).max(300),
    tags: z.array(z.string().trim().min(1).max(50)).max(5),
    title: z.string().trim().min(1).max(150),
    videoLinks: z.array(httpsUrlSchema.max(2_048)).max(3),
  })
  .strict();

export type AdminCorrectionInput = z.infer<typeof correctionSchema>;

export function validateAdminCorrection(formData: FormData): AdminCorrectionInput | null {
  const links = parseLinks(formData.getAll('linkLabel'), formData.getAll('linkUrl'));
  if (links === null) return null;
  const result = correctionSchema.safeParse({
    academicPeriod: {
      semester: formData.get('semester'),
      year: formData.get('academicYear'),
    },
    category: formData.get('category'),
    description: formData.get('description'),
    expectedPublishedRevisionId: formData.get('expectedPublishedRevisionId'),
    expectedRevisionVersion: formData.get('expectedRevisionVersion'),
    idempotencyKey: formData.get('idempotencyKey'),
    links,
    reason: formData.get('reason'),
    summary: formData.get('summary'),
    tags: stringValues(formData.getAll('tag')),
    title: formData.get('title'),
    videoLinks: stringValues(formData.getAll('videoLink')),
  });
  return result.success ? result.data : null;
}

function parseLinks(
  rawLabels: FormDataEntryValue[],
  rawUrls: FormDataEntryValue[],
): Array<{ label: string; url: string }> | null {
  if (rawLabels.length !== rawUrls.length) return null;
  const labels = stringValues(rawLabels);
  const urls = stringValues(rawUrls);
  if (labels.length !== rawLabels.length || urls.length !== rawUrls.length) return null;
  return labels.map((label, index) => ({ label, url: urls[index]! }));
}

function stringValues(values: FormDataEntryValue[]): string[] {
  return values.flatMap((value) =>
    typeof value === 'string' && value.trim().length > 0 ? [value.trim()] : [],
  );
}
