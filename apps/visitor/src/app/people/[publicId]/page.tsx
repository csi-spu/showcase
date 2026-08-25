import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { getVisitorCoreUrl, PublicProfileCoreClient } from '@/lib/public-profile-core';
import { PublicProfileView } from '../public-profile-view';

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) notFound();
  const profile = await new PublicProfileCoreClient(getVisitorCoreUrl()).getProfile(publicId);
  if (profile === null) notFound();
  const t = await getTranslations('People');

  return (
    <main className="mx-auto min-h-svh w-full max-w-[1440px] bg-background">
      <header className="border-b border-border px-[clamp(1rem,4vw,3rem)] py-6">
        <nav aria-label={t('navigation')} className="flex items-center justify-between gap-4">
          <Link className="font-semibold tracking-[0.12em]" href="/">
            STUDENT SHOWCASE
          </Link>
          <Link className="text-sm font-medium text-primary underline" href="/">
            {t('back')}
          </Link>
        </nav>
      </header>
      <div className="px-[clamp(1rem,4vw,3rem)] py-10 lg:py-16">
        <PublicProfileView
          labels={{
            entryYear: t('entryYear', { year: profile.entryYear }),
            links: t('links'),
            photoAlt: t('photoAlt', { name: profile.displayName }),
          }}
          profile={profile}
        />
      </div>
    </main>
  );
}
