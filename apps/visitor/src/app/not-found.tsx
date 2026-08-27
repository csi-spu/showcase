import { getTranslations } from 'next-intl/server';
import { PublicFeedback } from './public-page';
import { PublicShell } from './public-shell';

export default async function NotFound() {
  const t = await getTranslations('States');

  return (
    <PublicShell>
      <div className="px-[clamp(1rem,4vw,3rem)] py-8 lg:py-12">
        <PublicFeedback
          actionHref="/"
          actionLabel={t('notFoundAction')}
          code="404"
          description={t('notFoundDescription')}
          title={t('notFoundTitle')}
        />
      </div>
    </PublicShell>
  );
}
