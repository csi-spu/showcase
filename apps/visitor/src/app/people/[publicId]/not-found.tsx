import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function PublicProfileNotFound() {
  const t = await getTranslations('People');
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <section className="grid max-w-xl gap-4 text-center">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary">404</p>
        <h1 className="text-3xl font-semibold">{t('notFoundHeading')}</h1>
        <p className="text-muted-foreground">{t('notFoundDescription')}</p>
        <Link className="font-medium text-primary underline" href="/">
          {t('back')}
        </Link>
      </section>
    </main>
  );
}
