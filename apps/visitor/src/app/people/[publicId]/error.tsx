'use client';

import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { PublicFeedback } from '../../public-page';
import { PublicShell } from '../../public-shell';

export default function PublicProfileError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('People');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <PublicShell>
      <div className="px-[clamp(1rem,4vw,3rem)] py-8 lg:py-12">
        <PublicFeedback
          actionLabel={t('retry')}
          code="ERROR"
          description={t('errorDescription')}
          onAction={reset}
          role="alert"
          title={t('errorHeading')}
        />
      </div>
    </PublicShell>
  );
}
