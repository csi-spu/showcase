'use client';

import { Button } from '@showcase/ui/button';
import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

export default function WorksError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('WorkPage');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="grid min-h-svh place-items-center p-6">
      <section className="grid max-w-xl gap-4 rounded-surface border border-border bg-card p-8">
        <h1 className="text-2xl font-semibold">{t('errorHeading')}</h1>
        <p className="text-muted-foreground">{t('errorDescription')}</p>
        <Button onClick={reset}>{t('retry')}</Button>
      </section>
    </main>
  );
}
