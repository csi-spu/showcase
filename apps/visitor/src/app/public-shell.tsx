import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ArrowUpRightIcon } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { PublicNavigation } from './public-navigation';

export function PublicShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell');

  return (
    <div className="relative mx-auto min-h-svh w-full max-w-[1440px] overflow-clip bg-background">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:rounded-control focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        href="#main-content"
      >
        {t('skipToContent')}
      </a>
      <PublicNavigation />
      <main id="main-content">{children}</main>
      <footer className="px-[clamp(1rem,4vw,3rem)] pb-8 pt-16">
        <Separator />
        <div className="grid gap-8 py-8 sm:grid-cols-2 sm:items-end">
          <div className="grid gap-5">
            <Image
              alt={t('brandAlt')}
              className="h-auto w-[clamp(14rem,34vw,20rem)]"
              height={212}
              sizes="(max-width: 640px) 224px, 320px"
              src="/brand/sit-school-of-information-technology-color.webp"
              width={640}
            />
            <div className="grid gap-2">
              <p className="font-semibold tracking-[0.12em]">{t('title')}</p>
              <p className="max-w-md text-sm text-muted-foreground">{t('description')}</p>
            </div>
          </div>
          <Link
            className="group flex min-h-11 items-center gap-2 justify-self-start font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary sm:justify-self-end"
            href="/works"
          >
            {t('viewWorks')}
            <ArrowUpRightIcon
              aria-hidden="true"
              className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:transform-none"
            />
          </Link>
        </div>
      </footer>
    </div>
  );
}
