'use client';

import { Button } from '@showcase/ui/button';
import { useTranslations } from 'next-intl';

export default function PublicProfileError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('People');
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <section className="grid max-w-xl gap-4 text-center">
        <h1 className="text-3xl font-semibold">{t('errorHeading')}</h1>
        <p className="text-muted-foreground">{t('errorDescription')}</p>
        <Button onClick={reset}>{t('retry')}</Button>
      </section>
    </main>
  );
}
