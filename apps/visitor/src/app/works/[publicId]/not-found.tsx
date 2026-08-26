import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

export default async function PublicWorkNotFound() {
  const t = await getTranslations('Works');
  return (
    <main className="grid min-h-svh place-items-center px-6 py-16">
      <div className="grid max-w-lg gap-5 text-center">
        <h1 className="text-3xl font-semibold">{t('notFoundHeading')}</h1>
        <p className="text-muted-foreground">{t('notFoundDescription')}</p>
        <Link className="font-medium text-primary underline" href="/">
          {t('back')}
        </Link>
      </div>
    </main>
  );
}
