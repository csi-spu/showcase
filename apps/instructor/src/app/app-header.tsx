import { ChevronRightIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { logoutAction } from './instructor-auth.actions';
import { HeaderLogoutButton } from './header-logout-button';

interface Breadcrumb {
  href?: string;
  label: string;
}

export async function AppHeader({ trail = [] }: { trail?: Breadcrumb[] }) {
  const t = await getTranslations('Nav');

  return (
    <header className="instructor-header sticky top-0 z-10 border-b border-border/70">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link className="flex shrink-0 items-center gap-2" href="/rounds">
            <Image
              alt="คณะเทคโนโลยีสารสนเทศ"
              className="h-7 w-auto"
              height={64}
              sizes="56px"
              src="/brand/sit-school-of-information-technology-color.webp"
              width={214}
            />
            <span className="hidden text-sm font-semibold tracking-tight text-foreground sm:inline">
              {t('brand')}
            </span>
          </Link>
          <nav
            aria-label={t('breadcrumbLabel')}
            className="flex min-w-0 items-center gap-1 text-sm"
          >
            <ChevronRightIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <Link
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              href="/rounds"
            >
              {t('rounds')}
            </Link>
            {trail.map((crumb) => (
              <span className="flex min-w-0 items-center gap-1" key={crumb.label}>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
                {crumb.href ? (
                  <Link
                    className="truncate text-muted-foreground transition-colors hover:text-foreground"
                    href={crumb.href}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate font-medium text-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        </div>
        <HeaderLogoutButton action={logoutAction} />
      </div>
    </header>
  );
}
