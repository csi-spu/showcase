import { getTranslations } from 'next-intl/server';

export default async function Home() {
  const t = await getTranslations('Home');

  return (
    <main className="surface-shell">
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1>{t('title')}</h1>
      <p>{t('description')}</p>
    </main>
  );
}
