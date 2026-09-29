'use client';

import { buttonVariants } from '@showcase/ui/button';
import { cn } from '@showcase/ui/cn';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { FieldLabel } from '@/components/ui/field';

const SELECT_CLASS =
  'h-10 w-full cursor-pointer appearance-none rounded-surface border border-input bg-background px-3 pr-9 text-sm transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none';

const STEP_CLASS = cn(
  buttonVariants({ size: 'icon', variant: 'outline' }),
  'transition-[scale] active:scale-95 motion-reduce:transition-none',
);

/* A decision moves focus here, so the Instructor can go on without auto-advancing. */
export const NEXT_STUDENT_LINK_ID = 'next-student-link';

type StudentDirection = 'next' | 'previous';

/*
 * Which way the last step went, read once by the page it opened. It lives
 * outside React because the step unmounts the page that set it.
 */
let pendingDirection: StudentDirection | null = null;

function rememberDirection(direction: StudentDirection): void {
  pendingDirection = direction;
}

function readDirection(): StudentDirection | null {
  return pendingDirection;
}

function forgetDirection(): void {
  pendingDirection = null;
}

const ENTRANCE_CLASSES: Record<StudentDirection | 'none', string> = {
  next: 'slide-in-from-right-4',
  none: 'slide-in-from-bottom-1',
  previous: 'slide-in-from-left-4',
};

/** One Student's content, entering from the side the Instructor stepped towards. */
export function StudentEntrance({ children }: { children: ReactNode }) {
  const [direction] = useState(readDirection);
  useEffect(forgetDirection, []);

  return (
    <div
      className={cn(
        'animate-in duration-300 fade-in motion-reduce:animate-none',
        ENTRANCE_CLASSES[direction ?? 'none'],
      )}
    >
      {children}
    </div>
  );
}

export interface StudentLink {
  href: string;
  id: string;
  name: string;
}

/**
 * Previous, next and a jump list through the queue the Instructor came from.
 *
 * Follows the queue's status filter and order but never its search, which
 * stays out of every URL (ADR 0020). The jump list holds the Students on the
 * same table page; previous and next cross into the pages either side.
 */
export function StudentNavigator({
  currentId,
  next,
  position,
  previous,
  students,
  total,
}: {
  currentId: string;
  next: StudentLink | null;
  /** One-based, or null once a decision moved the Student out of the filter. */
  position: number | null;
  previous: StudentLink | null;
  /** The Students on the current Student's table page, in order. */
  students: StudentLink[];
  /** How many Students the filter lists. */
  total: number;
}) {
  const t = useTranslations('Forms.responses.individual');
  const router = useRouter();
  const selectId = useId();

  return (
    <nav
      aria-label={t('studentsLabel')}
      className="flex flex-col gap-3 rounded-surface border border-input bg-card p-4 sm:flex-row sm:items-end"
    >
      <div className="flex items-center gap-2">
        <StepLink
          direction="previous"
          href={previous?.href ?? null}
          label={
            previous === null ? t('previousStudent') : `${t('previousStudent')} ${previous.name}`
          }
        >
          <ChevronLeftIcon aria-hidden="true" />
        </StepLink>
        <span className="min-w-24 text-center text-sm text-muted-foreground tabular-nums">
          {position === null ? t('outsideFilter', { total }) : t('position', { position, total })}
        </span>
        <StepLink
          direction="next"
          href={next?.href ?? null}
          id={NEXT_STUDENT_LINK_ID}
          label={next === null ? t('nextStudent') : `${t('nextStudent')} ${next.name}`}
        >
          <ChevronRightIcon aria-hidden="true" />
        </StepLink>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <FieldLabel htmlFor={selectId}>{t('studentSelectLabel')}</FieldLabel>
        <div className="relative">
          <select
            className={SELECT_CLASS}
            id={selectId}
            onChange={(event) => {
              const target = students.find((student) => student.id === event.target.value);
              if (target !== undefined) router.push(target.href);
            }}
            value={currentId}
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </div>
    </nav>
  );
}

function StepLink({
  children,
  direction,
  href,
  id,
  label,
}: {
  children: ReactNode;
  direction: StudentDirection;
  href: string | null;
  id?: string;
  label: string;
}) {
  if (href === null) {
    return (
      <button aria-label={label} className={STEP_CLASS} disabled id={id} type="button">
        {children}
      </button>
    );
  }
  return (
    <Link
      aria-label={label}
      className={STEP_CLASS}
      href={href}
      id={id}
      onClick={() => rememberDirection(direction)}
    >
      {children}
    </Link>
  );
}

/** Which retained version is shown; the latest is the one a decision applies to. */
export function VersionSelect({
  current,
  versions,
}: {
  current: number;
  versions: ReadonlyArray<{ href: string; label: string; version: number }>;
}) {
  const t = useTranslations('Forms.responses.individual');
  const router = useRouter();
  const selectId = useId();

  return (
    <div className="flex flex-col gap-1.5 sm:max-w-md">
      <FieldLabel htmlFor={selectId}>{t('versionLabel')}</FieldLabel>
      <div className="relative">
        <select
          className={SELECT_CLASS}
          id={selectId}
          onChange={(event) => {
            const target = versions.find((item) => String(item.version) === event.target.value);
            if (target !== undefined) router.push(target.href, { scroll: false });
          }}
          value={String(current)}
        >
          {versions.map((item) => (
            <option key={item.version} value={String(item.version)}>
              {item.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
    </div>
  );
}
