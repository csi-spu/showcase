import { buttonVariants } from '@showcase/ui/button';
import { ArrowRightIcon, CircleCheckBigIcon, KeyRoundIcon } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function ProfileSecurityPanel({
  actionLabel,
  description,
  heading,
  isPasswordChanged = false,
  successMessage,
}: {
  actionLabel: string;
  description: string;
  heading: string;
  isPasswordChanged?: boolean;
  successMessage?: string | undefined;
}) {
  return (
    <section className="grid gap-5 rounded-surface border border-border/80 bg-card p-5 shadow-[0_1rem_2rem_-2rem_rgba(50,20,45,0.18)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6 lg:p-7">
      <div className="grid min-w-0 gap-4">
        <header className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3">
          <span className="grid size-10 place-items-center rounded-control bg-primary-soft text-primary">
            <KeyRoundIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="grid gap-1">
            <h2 className="text-lg font-semibold tracking-tight">{heading}</h2>
            <p className="max-w-[52ch] text-sm text-pretty text-muted-foreground">{description}</p>
          </div>
        </header>
        {isPasswordChanged && successMessage ? (
          <Alert role="status">
            <CircleCheckBigIcon aria-hidden="true" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <Link
        className={buttonVariants({
          className: 'w-full justify-between sm:w-auto sm:min-w-44',
          variant: 'outline',
        })}
        href="/profile/password"
      >
        {actionLabel}
        <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
      </Link>
    </section>
  );
}
