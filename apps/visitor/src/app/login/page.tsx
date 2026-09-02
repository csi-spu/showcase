import type { Metadata } from 'next';
import { ArrowRightIcon, GraduationCapIcon, SparkleIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { buttonVariants } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PublicShell } from '../public-shell';

const STUDENT_LOGIN_URL = 'https://student.csisitspu.com';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Login');
  return {
    alternates: { canonical: '/login' },
    robots: { follow: true, index: false },
    title: `${t('title')} | Student Showcase`,
  };
}

export default async function LoginPage() {
  const t = await getTranslations('Login');

  return (
    <PublicShell>
      <div className="relative isolate grid min-h-[calc(100svh-4rem)] place-items-center overflow-hidden px-[clamp(1rem,4vw,3rem)] py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--primary),transparent_84%),transparent)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -z-10 size-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_180deg,color-mix(in_oklch,var(--primary),transparent_88%),transparent_35%,transparent_65%,color-mix(in_oklch,var(--primary),transparent_88%))] blur-3xl"
        />

        <div className="grid w-full max-w-[26rem] gap-8 justify-items-center text-center">
          <div className="grid gap-3 justify-items-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-3 py-1 text-xs font-medium tracking-[0.02em] text-primary">
              <SparkleIcon className="size-3.5" />
              {t('comingSoonBadge')}
            </span>
            <h1 className="text-[clamp(2rem,5vw,2.75rem)] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">
              {t('title')}
            </h1>
            <p className="max-w-sm text-base leading-relaxed text-muted-foreground text-pretty">
              {t('description')}
            </p>
          </div>

          <div className="relative w-full overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/80 p-1 shadow-[0_2.5rem_5rem_-2.25rem_color-mix(in_oklch,var(--primary),transparent_60%),0_0.5rem_1rem_-0.5rem_rgba(20,10,20,0.08)] backdrop-blur-xl">
            <div className="relative rounded-[1.5rem] border border-border/60 bg-gradient-to-b from-card to-muted/40 px-6 py-8 sm:px-8">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-1 z-10 flex items-center justify-center rounded-[1.5rem] bg-card/55 backdrop-blur-[3px]"
              >
                <span className="grid size-14 place-items-center rounded-full border border-primary/15 bg-background shadow-[0_0.75rem_2rem_-0.75rem_color-mix(in_oklch,var(--primary),transparent_45%)]">
                  <svg
                    aria-hidden="true"
                    className="size-6 text-primary"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    viewBox="0 0 24 24"
                  >
                    <rect height="11" rx="2.5" width="16" x="4" y="11" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    <circle cx="12" cy="15.5" fill="currentColor" r="1.25" stroke="none" />
                  </svg>
                </span>
              </div>

              <fieldset
                aria-hidden="true"
                className="pointer-events-none select-none opacity-90"
                disabled
                tabIndex={-1}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel className="text-left" htmlFor="student-id">
                      {t('studentIdLabel')}
                    </FieldLabel>
                    <Input
                      className="h-11 rounded-xl bg-background/70 text-left"
                      id="student-id"
                      placeholder={t('studentIdPlaceholder')}
                      readOnly
                      tabIndex={-1}
                      type="text"
                    />
                  </Field>
                  <Field>
                    <FieldLabel className="text-left" htmlFor="password">
                      {t('passwordLabel')}
                    </FieldLabel>
                    <Input
                      className="h-11 rounded-xl bg-background/70 text-left"
                      id="password"
                      placeholder={t('passwordPlaceholder')}
                      readOnly
                      tabIndex={-1}
                      type="password"
                    />
                  </Field>
                  <button
                    className={buttonVariants({
                      className: 'mt-1 min-h-11 w-full rounded-xl',
                      size: 'lg',
                    })}
                    tabIndex={-1}
                    type="button"
                  >
                    {t('formSubmit')}
                  </button>
                </FieldGroup>
              </fieldset>
            </div>
          </div>

          <div className="grid gap-4 justify-items-center">
            <p className="max-w-sm text-base leading-relaxed font-medium text-pretty">{t('cta')}</p>
            <a
              className={buttonVariants({
                className:
                  'min-h-12 rounded-full px-7 shadow-[0_0.75rem_2rem_-0.75rem_color-mix(in_oklch,var(--primary),transparent_35%)]',
                size: 'lg',
              })}
              href={STUDENT_LOGIN_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <GraduationCapIcon aria-hidden="true" data-icon="inline-start" />
              {t('ctaButton')}
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </a>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
