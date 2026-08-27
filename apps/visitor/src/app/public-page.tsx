import { cn } from '@showcase/ui/cn';
import { ArrowRightIcon } from 'lucide-react';
import Link from 'next/link';
import type { MouseEventHandler, ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';

export const PUBLIC_FIELD_CLASS =
  'min-h-12 w-full rounded-control border border-input bg-card px-3.5 text-foreground shadow-[0_0.5rem_1.5rem_-1.25rem_color-mix(in_oklch,var(--primary),transparent_72%)] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground/75 hover:border-primary/45 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20';

export const PUBLIC_FILTER_PANEL_CLASS =
  'grid gap-6 rounded-media border border-border bg-card/70 p-5 shadow-[0_1.5rem_4rem_-3rem_color-mix(in_oklch,var(--primary),transparent_58%)] backdrop-blur-sm sm:p-6 lg:p-8';

export function PublicPageIntro({
  children,
  className,
  description,
  eyebrow,
  title,
}: {
  children?: ReactNode;
  className?: string;
  description?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <header
      className={cn(
        'relative isolate grid gap-5 overflow-hidden rounded-media border border-border bg-card px-5 py-10 shadow-[0_2rem_5rem_-3.25rem_color-mix(in_oklch,var(--primary),transparent_50%)] sm:px-8 sm:py-12 lg:px-12 lg:py-16',
        className,
      )}
      data-public-page-intro="true"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-24 -z-10 size-80 rounded-full border-[3.5rem] border-primary/[0.07]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-16 bottom-8 -z-10 size-3 rounded-full bg-primary/35"
      />
      <p className="text-sm font-semibold tracking-[0.12em] text-primary">{eyebrow}</p>
      <h1 className="max-w-4xl text-[clamp(2.6rem,6vw,5rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance">
        {title}
      </h1>
      {description ? (
        <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
      ) : null}
      {children}
    </header>
  );
}

export function PublicFeedback({
  actionHref,
  actionLabel,
  code,
  description,
  onAction,
  role = 'status',
  title,
}: {
  actionHref?: string;
  actionLabel: string;
  code: string;
  description: string;
  onAction?: MouseEventHandler<HTMLButtonElement>;
  role?: 'alert' | 'status';
  title: string;
}) {
  return (
    <section
      className="relative isolate grid min-h-[32rem] place-items-center overflow-hidden rounded-media border border-border bg-card px-6 py-16 text-center shadow-[0_2rem_5rem_-3rem_color-mix(in_oklch,var(--primary),transparent_55%)]"
      data-public-feedback="true"
      role={role}
    >
      <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
        <span className="absolute -top-24 -right-20 size-72 rounded-full border-[3rem] border-primary/[0.07]" />
        <span className="absolute -bottom-28 -left-20 size-80 rounded-full bg-primary/[0.06]" />
        <span className="absolute top-12 left-[12%] size-3 rounded-full bg-primary/30" />
      </div>
      <div className="grid max-w-xl justify-items-center gap-5">
        <p className="font-mono text-sm font-semibold tracking-[0.18em] text-primary tabular-nums">
          {code}
        </p>
        <h1 className="text-[clamp(2.25rem,5vw,4rem)] leading-[1.1] font-semibold tracking-[-0.045em] text-balance">
          {title}
        </h1>
        <p className="max-w-lg text-lg leading-relaxed text-muted-foreground text-pretty">
          {description}
        </p>
        {actionHref ? (
          <Link
            className={buttonVariants({ className: 'mt-2 min-h-11 px-5', size: 'lg' })}
            href={actionHref}
          >
            {actionLabel}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Link>
        ) : (
          <button
            className={buttonVariants({ className: 'mt-2 min-h-11 px-5', size: 'lg' })}
            onClick={onAction}
            type="button"
          >
            {actionLabel}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </button>
        )}
      </div>
    </section>
  );
}
