/*
 * Aggregating a form's responses for the Instructor's Summary and Question views.
 *
 * The population is fixed by the repository: the latest submission of every
 * assigned Student whose response is awaiting checking, returned, or passed. A
 * withdrawn Student is not counted, and a Student who has not submitted appears
 * only in the totals.
 *
 * Every aggregate is keyed by the *current* form's field ids. A value is only
 * counted when the submission's own field snapshot had that field with the
 * same type, so an answer given under an older type is never reinterpreted, a
 * removed field is simply absent, and a field added after some Students
 * submitted counts only the submissions that contain it.
 */

import type { CollectionField, CollectionFieldType } from './collection-field';

/** Grouped short answers and long answers load this many at a time in Summary. */
export const RESPONSE_SUMMARY_PAGE_SIZE = 10;
/** Question view rows load this many at a time. */
export const RESPONSE_ANSWER_PAGE_SIZE = 20;
/** A wide numeric range is drawn as this many equal bars. */
export const MAX_HISTOGRAM_BINS = 10;

export interface CollectionValueCount {
  count: number;
  value: string;
}

export interface CollectionResponseTotals {
  /** Current members; a withdrawn Student is no longer assigned. */
  assigned: number;
  awaitingChecking: number;
  changesRequired: number;
  notSubmitted: number;
  passed: number;
}

export interface CollectionHistogramBin {
  count: number;
  /** Equal to `to` for a bar that stands for one whole number. */
  from: number;
  to: number;
}

export interface CollectionNumberStats {
  max: number;
  mean: number;
  median: number;
  min: number;
}

export interface CollectionTextPage<T> {
  items: T[];
  nextCursor: string | null;
}

interface FieldSummaryBase {
  /** Submissions in the population that answered this question. */
  answeredCount: number;
  fieldId: string;
}

export type CollectionFieldSummary =
  | (FieldSummaryBase & {
      options: CollectionValueCount[];
      /** Selections of a value that is no longer one of the options. */
      otherCount: number;
      type: 'multiple_choice' | 'single_choice';
    })
  | (FieldSummaryBase & {
      histogram: CollectionHistogramBin[];
      stats: CollectionNumberStats | null;
      type: 'number';
    })
  | (FieldSummaryBase & {
      earliest: string | null;
      latest: string | null;
      months: Array<{ count: number; month: string }>;
      type: 'date';
    })
  | (FieldSummaryBase & {
      groups: CollectionTextPage<CollectionValueCount>;
      type: 'short_text';
    })
  | (FieldSummaryBase & {
      answers: CollectionTextPage<{ value: string }>;
      type: 'long_text';
    })
  | (FieldSummaryBase & {
      fileCount: number;
      notReadyCount: number;
      type: 'file_upload';
    });

/**
 * What the repository reads for a summary, before it is shaped per field.
 *
 * Text pages hold up to one row more than a page, which is how a next page is
 * known to exist without counting.
 */
export interface CollectionResponseSummaryRecord {
  answeredCounts: ReadonlyMap<string, number>;
  files: ReadonlyMap<string, { fileCount: number; notReadyCount: number }>;
  textAnswers: ReadonlyMap<string, string[]>;
  textGroups: ReadonlyMap<string, CollectionValueCount[]>;
  totals: CollectionResponseTotals;
  valueCounts: ReadonlyMap<string, CollectionValueCount[]>;
}

/** The field types whose Summary lists values a page at a time. */
export const PAGED_SUMMARY_FIELD_TYPES: readonly CollectionFieldType[] = [
  'short_text',
  'long_text',
];

/** Counts per current option, in the order the form shows them. */
export function summarizeChoice(
  options: readonly string[],
  counts: readonly CollectionValueCount[],
): { options: CollectionValueCount[]; otherCount: number } {
  const byValue = new Map(counts.map((entry) => [entry.value, entry.count]));
  const current = new Set(options);
  return {
    options: options.map((value) => ({ count: byValue.get(value) ?? 0, value })),
    otherCount: counts
      .filter((entry) => !current.has(entry.value))
      .reduce((sum, entry) => sum + entry.count, 0),
  };
}

/**
 * Statistics and a histogram for numeric answers.
 *
 * The input is one row per distinct value, so the work is bounded by how many
 * different numbers were given rather than how many Students gave them.
 */
export function summarizeNumbers(counts: readonly CollectionValueCount[]): {
  histogram: CollectionHistogramBin[];
  stats: CollectionNumberStats | null;
} {
  const values = counts
    .map((entry) => ({ count: entry.count, value: Number(entry.value) }))
    .toSorted((left, right) => left.value - right.value);
  const total = values.reduce((sum, entry) => sum + entry.count, 0);
  const first = values[0];
  const last = values.at(-1);
  if (total === 0 || first === undefined || last === undefined) {
    return { histogram: [], stats: null };
  }

  const sum = values.reduce((acc, entry) => acc + entry.value * entry.count, 0);
  return {
    histogram: histogram(values, first.value, last.value),
    stats: {
      max: last.value,
      mean: sum / total,
      median:
        (valueAt(values, Math.floor((total - 1) / 2)) + valueAt(values, Math.floor(total / 2))) / 2,
      min: first.value,
    },
  };
}

/* The value at a zero-based rank, walking the counted distinct values in order. */
function valueAt(values: ReadonlyArray<{ count: number; value: number }>, rank: number): number {
  let seen = 0;
  for (const entry of values) {
    seen += entry.count;
    if (rank < seen) return entry.value;
  }
  return values.at(-1)!.value;
}

function histogram(
  values: ReadonlyArray<{ count: number; value: number }>,
  min: number,
  max: number,
): CollectionHistogramBin[] {
  if (min === max) {
    return [{ count: values.reduce((sum, entry) => sum + entry.count, 0), from: min, to: max }];
  }

  /* A short run of whole numbers, such as a 1-5 rating, reads best as one bar per value. */
  if (values.every((entry) => Number.isInteger(entry.value)) && max - min < MAX_HISTOGRAM_BINS) {
    const bins = Array.from({ length: max - min + 1 }, (_, index) => ({
      count: 0,
      from: min + index,
      to: min + index,
    }));
    for (const entry of values) bins[entry.value - min]!.count += entry.count;
    return bins;
  }

  const width = (max - min) / MAX_HISTOGRAM_BINS;
  const bins = Array.from({ length: MAX_HISTOGRAM_BINS }, (_, index) => ({
    count: 0,
    from: min + index * width,
    to: index === MAX_HISTOGRAM_BINS - 1 ? max : min + (index + 1) * width,
  }));
  for (const entry of values) {
    /* Bars are half-open, except the last, which also holds the maximum. */
    const index = Math.min(Math.floor((entry.value - min) / width), MAX_HISTOGRAM_BINS - 1);
    bins[index]!.count += entry.count;
  }
  return bins;
}

/**
 * The range of date answers and a bar per calendar month.
 *
 * A date answer is a calendar date the Student chose, already in Asia/Bangkok
 * terms, so its month is read from the value rather than converted.
 */
export function summarizeDates(counts: readonly CollectionValueCount[]): {
  earliest: string | null;
  latest: string | null;
  months: Array<{ count: number; month: string }>;
} {
  const sorted = counts.toSorted((left, right) => left.value.localeCompare(right.value));
  const months = new Map<string, number>();
  for (const entry of sorted) {
    const month = entry.value.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + entry.count);
  }
  return {
    earliest: sorted[0]?.value ?? null,
    latest: sorted.at(-1)?.value ?? null,
    months: [...months].map(([month, count]) => ({ count, month })),
  };
}

/** One page of rows read with one extra row as a has-more probe. */
function firstPage<T>(rows: readonly T[] | undefined, pageSize: number): CollectionTextPage<T> {
  const items = rows ?? [];
  return {
    items: items.slice(0, pageSize),
    nextCursor: items.length > pageSize ? encodeOffsetCursor(pageSize) : null,
  };
}

/** Shapes one summary per current field, in the order the form shows them. */
export function buildFieldSummaries(
  fields: readonly CollectionField[],
  record: CollectionResponseSummaryRecord,
): CollectionFieldSummary[] {
  return fields.map((field): CollectionFieldSummary => {
    const base = { answeredCount: record.answeredCounts.get(field.id) ?? 0, fieldId: field.id };
    const counts = record.valueCounts.get(field.id) ?? [];
    switch (field.type) {
      case 'single_choice':
      case 'multiple_choice':
        return { ...base, ...summarizeChoice(field.options ?? [], counts), type: field.type };
      case 'number':
        return { ...base, ...summarizeNumbers(counts), type: 'number' };
      case 'date':
        return { ...base, ...summarizeDates(counts), type: 'date' };
      case 'short_text':
        return {
          ...base,
          groups: firstPage(record.textGroups.get(field.id), RESPONSE_SUMMARY_PAGE_SIZE),
          type: 'short_text',
        };
      case 'long_text':
        return {
          ...base,
          answers: firstPage(
            record.textAnswers.get(field.id)?.map((value) => ({ value })),
            RESPONSE_SUMMARY_PAGE_SIZE,
          ),
          type: 'long_text',
        };
      case 'file_upload':
        return {
          ...base,
          ...(record.files.get(field.id) ?? { fileCount: 0, notReadyCount: 0 }),
          type: 'file_upload',
        };
    }
  });
}

/*
 * Summary pages are offsets. Their rows are aggregates over the whole
 * population, so there is no stable key to seek past, and a cursor that names
 * a text answer would carry Student-written content around.
 */
const OFFSET_CURSOR_PATTERN = /^o:(\d{1,6})$/u;
const MAX_CURSOR_LENGTH = 4_096;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(`o:${offset}`).toString('base64url');
}

/** The offset a cursor names, or null when it was not issued by `encodeOffsetCursor`. */
export function decodeOffsetCursor(cursor: string): number | null {
  const match = OFFSET_CURSOR_PATTERN.exec(decodeCursorText(cursor) ?? '');
  return match === null ? null : Number(match[1]);
}

/**
 * Where a Question view page ends, in the order the rows are sorted.
 *
 * `rank` is the option's position for choice answers, `number` the numeric
 * answer, and `text` the date or choice value; each is the neutral value for a
 * type that does not sort by it. The account id breaks ties between Students
 * and is never a Student ID.
 */
export interface CollectionAnswerPosition {
  accountId: string;
  /** Kept as Postgres numeric text so the comparison is exact. */
  number: string;
  rank: number;
  text: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const NUMERIC_TEXT_PATTERN = /^-?\d{1,40}(\.\d{1,40})?$/u;
const MAX_RANK = 1_000;

export function encodeAnswerCursor(position: CollectionAnswerPosition): string {
  return Buffer.from(
    JSON.stringify({
      a: position.accountId,
      n: position.number,
      r: position.rank,
      t: position.text,
    }),
  ).toString('base64url');
}

/** The position a cursor names, or null when it was not issued by `encodeAnswerCursor`. */
export function decodeAnswerCursor(cursor: string): CollectionAnswerPosition | null {
  const text = decodeCursorText(cursor);
  if (text === null || !text.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const { a, n, r, t } = parsed as Record<string, unknown>;
  if (typeof a !== 'string' || !UUID_PATTERN.test(a)) return null;
  if (typeof n !== 'string' || !NUMERIC_TEXT_PATTERN.test(n)) return null;
  if (typeof r !== 'number' || !Number.isInteger(r) || r < 0 || r > MAX_RANK) return null;
  if (typeof t !== 'string') return null;
  return { accountId: a, number: n, rank: r, text: t };
}

function decodeCursorText(cursor: string): string | null {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) return null;
  if (!BASE64URL_PATTERN.test(cursor)) return null;
  return Buffer.from(cursor, 'base64url').toString('utf8');
}
