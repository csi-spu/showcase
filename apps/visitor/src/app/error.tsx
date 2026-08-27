'use client';

import { useTranslations } from 'next-intl';
import { PublicFeedback } from './public-page';
import { PublicShell } from './public-shell';

export default function Error({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations('States');

  return (
    <PublicShell>
      <div className="px-[clamp(1rem,4vw,3rem)] py-8 lg:py-12">
        <PublicFeedback
          actionLabel={t('errorAction')}
          code="ERROR"
          description={t('errorDescription')}
          onAction={retry}
          role="alert"
          title={t('errorTitle')}
        />
      </div>
    </PublicShell>
  );
}
