import { useTranslations } from 'next-intl';
import { PublicShell } from './public-shell';

export default function Loading() {
  const t = useTranslations('States');

  return (
    <PublicShell>
      <div
        aria-live="polite"
        className="grid gap-8 px-[clamp(1rem,4vw,3rem)] py-8 lg:py-12"
        role="status"
      >
        <span className="sr-only">{t('loading')}</span>
        <div className="relative min-h-[24rem] animate-pulse overflow-hidden rounded-media border border-border bg-card p-6 sm:p-10 motion-reduce:animate-none">
          <div className="absolute -top-24 -right-20 size-72 rounded-full border-[3rem] border-primary/[0.06]" />
          <div className="grid max-w-2xl gap-5">
            <div className="h-4 w-44 rounded-control bg-primary/15" />
            <div className="h-14 w-4/5 rounded-control bg-muted sm:h-20" />
            <div className="h-14 w-3/5 rounded-control bg-muted sm:h-20" />
            <div className="mt-3 h-4 w-full rounded-control bg-muted" />
            <div className="h-4 w-2/3 rounded-control bg-muted" />
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div className="grid animate-pulse gap-4 motion-reduce:animate-none" key={item}>
              <div className="aspect-[3/4] rounded-media bg-muted" />
              <div className="h-5 w-2/3 rounded-control bg-muted" />
              <div className="h-4 w-full rounded-control bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
