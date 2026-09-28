'use client';

import { motion, useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button, buttonVariants } from '@showcase/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';

const CHECK_PATH = 'M6 12.5l4 4L18 8';

/**
 * Shown in place of the form right after a submit that Core accepted.
 *
 * It exists only for that moment: a later visit shows the ordinary read-only
 * view, so the celebration never repeats. The time and status are Core's,
 * never the browser clock's. The submitted answers stay one click away,
 * rendered from `children`.
 */
export function SubmissionConfirmation({
  children,
  statusLabel,
  submittedAt,
}: {
  children: ReactNode;
  statusLabel: string;
  submittedAt: string;
}) {
  const t = useTranslations('Forms.confirmation');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const answersId = useId();
  const [isAnswersShown, setIsAnswersShown] = useState(false);

  /*
   * The submit button this replaced is gone, so focus would otherwise fall
   * back to the page. It moves to the result instead.
   */
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <BlurFade offset={8}>
        <div className="flex flex-col items-center gap-3 rounded-surface border border-border/80 bg-card px-5 py-8 text-center shadow-xs sm:px-8 sm:py-10">
          <SubmittedCheck />
          <h2
            className="text-xl font-semibold tracking-tight text-foreground outline-none sm:text-2xl"
            ref={headingRef}
            tabIndex={-1}
          >
            {t('title')}
          </h2>
          <p className="text-base font-medium text-information">
            {t('status', { status: statusLabel })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('submittedAt', {
              date: new Intl.DateTimeFormat('th-TH', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Bangkok',
              }).format(new Date(submittedAt)),
            })}
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button
              aria-controls={answersId}
              aria-expanded={isAnswersShown}
              onClick={() => setIsAnswersShown((current) => !current)}
              type="button"
              variant="outline"
            >
              {t('viewAnswers')}
            </Button>
            <Link className={buttonVariants()} href="/">
              {t('backHome')}
            </Link>
          </div>
        </div>
      </BlurFade>

      <div className="flex flex-col gap-4" hidden={!isAnswersShown} id={answersId}>
        {isAnswersShown ? children : null}
      </div>
    </div>
  );
}

/** The check mark draws itself once, unless the Student asked for less motion. */
function SubmittedCheck() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <span
      aria-hidden="true"
      className="flex size-16 items-center justify-center rounded-full bg-success-background text-success"
    >
      <svg
        className="size-9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        viewBox="0 0 24 24"
      >
        {prefersReducedMotion === true ? (
          <path d={CHECK_PATH} />
        ) : (
          <motion.path
            animate={{ pathLength: 1 }}
            d={CHECK_PATH}
            initial={{ pathLength: 0 }}
            transition={{ delay: 0.2, duration: 0.45, ease: 'easeOut' }}
          />
        )}
      </svg>
    </span>
  );
}
