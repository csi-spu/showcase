import { cn } from '@showcase/ui/cn';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ResponseView } from './responses-query';

/**
 * Summary, Question and Individual as one segmented control.
 *
 * Each view is a link, so the choice lives in the URL and survives a reload.
 * The highlight slides between segments by transform only; it is the same
 * element across navigations, so the move is a CSS transition.
 */
export function ResponseViewSwitch({
  current,
  views,
}: {
  current: ResponseView;
  views: ReadonlyArray<{ href: string; view: ResponseView }>;
}) {
  const t = useTranslations('Forms.responses');
  const index = Math.max(
    0,
    views.findIndex((item) => item.view === current),
  );

  return (
    <nav aria-label={t('viewsLabel')}>
      <div className="relative w-full rounded-full bg-muted p-1 sm:w-fit sm:min-w-96">
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 rounded-full bg-card shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{
            transform: `translateX(${index * 100}%)`,
            width: `calc((100% - 0.5rem) / ${views.length})`,
          }}
        />
        <ul className="relative grid list-none auto-cols-fr grid-flow-col p-0">
          {views.map((item) => {
            const isActive = item.view === current;
            return (
              <li key={item.view}>
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition-[color,scale] duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  href={item.href}
                  scroll={false}
                >
                  {t(`views.${item.view}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
