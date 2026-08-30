import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';

export function AdminWorkspacePage({
  actions,
  children,
  description,
  eyebrow,
  layout = 'overview',
  title,
}: {
  actions?: ReactNode;
  children: ReactNode;
  description: ReactNode;
  eyebrow: string;
  layout?: 'detail' | 'overview';
  title: ReactNode;
}) {
  const isDetail = layout === 'detail';
  return (
    <div className="grid gap-8">
      <header
        className={
          isDetail
            ? 'grid gap-4 border-b border-border/80 pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-8'
            : 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10'
        }
      >
        <div className="grid gap-3">
          <Badge className="w-fit" variant="secondary">
            {eyebrow}
          </Badge>
          <h1
            className={
              isDetail
                ? 'max-w-4xl text-2xl leading-tight font-semibold tracking-tight sm:text-3xl'
                : 'max-w-4xl text-[clamp(2rem,4vw,3.25rem)] leading-[1.12] font-semibold tracking-[-0.035em] text-balance'
            }
          >
            {title}
          </h1>
          <div className="max-w-[65ch] text-pretty text-muted-foreground">{description}</div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </header>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
