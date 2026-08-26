import {
  evaluateWorkDraft,
  type NormalizedWorkDraft,
  type WorkDraftInput,
} from './work-draft-policy';

export interface AdminCorrectionDiff {
  categories: Array<'content' | 'links' | 'tags' | 'video_links'>;
  fields: string[];
}

export type AdminCorrectionEvaluation =
  | { isValid: false }
  | {
      candidate: NormalizedWorkDraft;
      diff: AdminCorrectionDiff;
      isValid: true;
      reason: string;
    };

export function evaluateAdminCorrection(
  input: WorkDraftInput,
  base: NormalizedWorkDraft,
  rawReason: string,
  academicRange: { currentAcademicYear: number; entryYear: number },
): AdminCorrectionEvaluation {
  const reason = rawReason.trim();
  if (reason.length < 10 || reason.length > 1_000) return { isValid: false };
  const evaluated = evaluateWorkDraft(input, academicRange);
  if (!evaluated.isValid) return { isValid: false };

  const candidate = evaluated.draft;
  const fields: string[] = [];
  const categories = new Set<AdminCorrectionDiff['categories'][number]>();
  for (const field of ['title', 'summary', 'description', 'category'] as const) {
    if (candidate[field] !== base[field]) {
      fields.push(field);
      categories.add('content');
    }
  }
  if (
    candidate.academicPeriod.year !== base.academicPeriod.year ||
    candidate.academicPeriod.semester !== base.academicPeriod.semester
  ) {
    fields.push('academicPeriod');
    categories.add('content');
  }
  for (const [field, category] of [
    ['links', 'links'],
    ['tags', 'tags'],
    ['videoLinks', 'video_links'],
  ] as const) {
    if (JSON.stringify(candidate[field]) !== JSON.stringify(base[field])) {
      fields.push(field);
      categories.add(category);
    }
  }
  if (fields.length === 0) return { isValid: false };
  return { candidate, diff: { categories: [...categories], fields }, isValid: true, reason };
}
