/*
 * A collection form's edit history, as Instructors read it.
 *
 * Core records edits as audit events: one metadata event per changed detail,
 * one structure event with full before and after question snapshots, and one
 * event per lifecycle change. This module turns the events of one entry into
 * the typed change list the Instructor app renders, so the app never compares
 * snapshots or interprets audit rows itself.
 *
 * Questions are matched by field id. The builder gives a question whose type
 * changed a new id, so a type change reads as a removal plus an addition.
 */

import type { CollectionField } from './collection-field';

export const FORM_HISTORY_PAGE_SIZE = 20;

/** One audit event, already narrowed from its row. */
export type CollectionFormHistoryEvent =
  | { kind: 'title'; next: string; previous: string }
  | { kind: 'description' }
  | { kind: 'deadline'; next: string | null; previous: string | null }
  | { kind: 'structure'; nextFields: CollectionField[]; previousFields: CollectionField[] }
  | { assignedCount: number; kind: 'opened' }
  | { kind: 'closed'; reason: string }
  | { assignedCount: number; kind: 'reopened'; reason: string };

export type CollectionFormHistoryChange =
  | { kind: 'title_changed'; next: string; previous: string }
  | { kind: 'description_changed' }
  /* Deadlines are UTC ISO timestamps; null means no deadline. */
  | { kind: 'deadline_changed'; next: string | null; previous: string | null }
  | { kind: 'question_added'; label: string }
  | { kind: 'question_removed'; label: string }
  | { kind: 'question_renamed'; next: string; previous: string }
  | { isRequired: boolean; kind: 'question_required_changed'; label: string }
  | { kind: 'question_description_changed'; label: string }
  | { kind: 'question_options_changed'; label: string }
  /* Type, file limits, or reusable-value key: settings without their own wording. */
  | { kind: 'question_settings_changed'; label: string }
  | { kind: 'questions_reordered' }
  | { assignedCount: number; kind: 'opened' }
  | { kind: 'closed'; reason: string }
  | { assignedCount: number; kind: 'reopened'; reason: string };

/**
 * Where a page ended: the last entry's time and id, in the order the history
 * is read. `occurredAtMicros` keeps the database's microsecond precision, which
 * a `Date` would round away and so skip or repeat entries across pages.
 */
export interface CollectionFormHistoryPosition {
  entryId: string;
  occurredAtMicros: string;
}

/** One history entry as Instructors read it: who, when, and what changed. */
export interface CollectionFormHistoryEntry {
  actorName: string;
  changes: CollectionFormHistoryChange[];
  id: string;
  occurredAt: Date;
}

export interface CollectionFormHistoryPage {
  entries: CollectionFormHistoryEntry[];
  /** Null on the last page. */
  nextCursor: string | null;
}

/** Details read in the order the form shows them, before the questions. */
const DETAIL_ORDER: Record<'deadline' | 'description' | 'title', number> = {
  title: 0,
  description: 1,
  deadline: 2,
};

/**
 * The changes one history entry records.
 *
 * An entry is one save (its detail events plus at most one structure event) or
 * one lifecycle event. A legacy questions save that changed nothing yields an
 * empty list; it is still shown, because it was still saved.
 */
export function describeFormHistoryEvents(
  events: CollectionFormHistoryEvent[],
): CollectionFormHistoryChange[] {
  const details = events
    .filter(
      (event): event is Extract<CollectionFormHistoryEvent, { kind: keyof typeof DETAIL_ORDER }> =>
        event.kind in DETAIL_ORDER,
    )
    .toSorted((left, right) => DETAIL_ORDER[left.kind] - DETAIL_ORDER[right.kind]);
  const changes: CollectionFormHistoryChange[] = details.map((event) => {
    if (event.kind === 'title') {
      return { kind: 'title_changed', next: event.next, previous: event.previous };
    }
    if (event.kind === 'description') return { kind: 'description_changed' };
    return { kind: 'deadline_changed', next: event.next, previous: event.previous };
  });
  for (const event of events) {
    if (event.kind === 'structure') {
      changes.push(...diffFormStructure(event.previousFields, event.nextFields));
    } else if (event.kind === 'opened' || event.kind === 'closed' || event.kind === 'reopened') {
      changes.push(event);
    }
  }
  return changes;
}

/**
 * What changed between two question snapshots.
 *
 * Additions, then removals, then per-question changes in the new order, then a
 * reorder. A reorder means the questions present in both snapshots changed
 * relative order; adding or removing a question alone is not a reorder.
 */
export function diffFormStructure(
  previous: CollectionField[],
  next: CollectionField[],
): CollectionFormHistoryChange[] {
  const previousById = new Map(previous.map((field) => [field.id, field]));
  const nextIds = new Set(next.map((field) => field.id));

  const added: CollectionFormHistoryChange[] = next
    .filter((field) => !previousById.has(field.id))
    .map((field) => ({ kind: 'question_added', label: field.label }));
  const removed: CollectionFormHistoryChange[] = previous
    .filter((field) => !nextIds.has(field.id))
    .map((field) => ({ kind: 'question_removed', label: field.label }));
  const changed = next.flatMap((field) => {
    const before = previousById.get(field.id);
    return before === undefined ? [] : diffQuestion(before, field);
  });

  const previousOrder = previous.filter((field) => nextIds.has(field.id)).map((field) => field.id);
  const nextOrder = next.filter((field) => previousById.has(field.id)).map((field) => field.id);
  const isReordered = previousOrder.some((id, index) => nextOrder[index] !== id);

  return [
    ...added,
    ...removed,
    ...changed,
    ...(isReordered ? [{ kind: 'questions_reordered' as const }] : []),
  ];
}

function diffQuestion(
  previous: CollectionField,
  next: CollectionField,
): CollectionFormHistoryChange[] {
  const label = next.label;
  const changes: CollectionFormHistoryChange[] = [];
  if (previous.label !== next.label) {
    changes.push({ kind: 'question_renamed', next: next.label, previous: previous.label });
  }
  if (previous.required !== next.required) {
    changes.push({ isRequired: next.required, kind: 'question_required_changed', label });
  }
  if (previous.description !== next.description) {
    changes.push({ kind: 'question_description_changed', label });
  }
  if (!isSameList(previous.options ?? [], next.options ?? [])) {
    changes.push({ kind: 'question_options_changed', label });
  }
  if (
    previous.type !== next.type ||
    previous.mappingKey !== next.mappingKey ||
    previous.file?.maxFiles !== next.file?.maxFiles ||
    !isSameList(previous.file?.allowedFileTypes ?? [], next.file?.allowedFileTypes ?? [])
  ) {
    changes.push({ kind: 'question_settings_changed', label });
  }
  return changes;
}

function isSameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => right[index] === value);
}

/* Epoch microseconds for any timestamp Postgres can store fit in 17 digits. */
const CURSOR_PATTERN =
  /^(\d{1,17})\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;
const MAX_CURSOR_LENGTH = 128;

/** An opaque page cursor. It holds an audit event id and a time, never Student data. */
export function encodeFormHistoryCursor(position: CollectionFormHistoryPosition): string {
  return Buffer.from(`${position.occurredAtMicros}.${position.entryId}`).toString('base64url');
}

/** The position a cursor names, or null when it was not issued by `encodeFormHistoryCursor`. */
export function decodeFormHistoryCursor(cursor: string): CollectionFormHistoryPosition | null {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) return null;
  if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) return null;
  const match = CURSOR_PATTERN.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (match === null) return null;
  return { entryId: match[2]!, occurredAtMicros: match[1]! };
}
