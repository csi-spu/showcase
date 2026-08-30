import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';

export function WorkspacePage({
  children,
  decoration,
  description,
  eyebrow,
  layout = 'overview',
  meta,
  title,
}: {
  children: ReactNode;
  decoration?: ReactNode;
  description: ReactNode;
  eyebrow: string;
  layout?: 'authoring' | 'overview';
  meta?: ReactNode;
  title: ReactNode;
}) {
  const isAuthoring = layout === 'authoring';

  return (
    <div
      className={
        isAuthoring
          ? 'grid gap-6'
          : 'grid gap-8 lg:grid-cols-[minmax(14rem,0.68fr)_minmax(0,1.8fr)] lg:gap-10 xl:gap-12'
      }
    >
      <header
        className={
          isAuthoring
            ? 'grid gap-3 border-b border-border/80 pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8'
            : 'grid content-start gap-4 xl:sticky xl:top-28 xl:self-start'
        }
      >
        <div className="grid gap-3">
          <Badge className="w-fit" variant="secondary">
            {eyebrow}
          </Badge>
          <h1
            className={
              isAuthoring
                ? 'max-w-3xl text-2xl leading-tight font-semibold tracking-tight sm:text-3xl'
                : 'max-w-xl text-[clamp(2rem,4vw,3.25rem)] leading-[1.12] font-semibold tracking-[-0.035em] text-balance'
            }
          >
            {title}
          </h1>
          <div className="max-w-[62ch] text-pretty text-muted-foreground">{description}</div>
          {decoration}
        </div>
        {meta ? (
          <div className="text-sm whitespace-nowrap text-muted-foreground">{meta}</div>
        ) : null}
      </header>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
