import { getTranslations } from 'next-intl/server';
import { PublicFeedback } from '../../public-page';
import { PublicShell } from '../../public-shell';

export default async function PublicWorkNotFound() {
  const t = await getTranslations('Works');
  return (
    <PublicShell>
      <div className="px-[clamp(1rem,4vw,3rem)] py-8 lg:py-12">
        <PublicFeedback
          actionHref="/works"
          actionLabel={t('back')}
          code="404"
          description={t('notFoundDescription')}
          title={t('notFoundHeading')}
        />
      </div>
    </PublicShell>
  );
}
