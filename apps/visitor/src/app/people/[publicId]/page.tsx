import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { buttonVariants } from '@/components/ui/button';
import { getVisitorCoreUrl, PublicProfileCoreClient } from '@/lib/public-profile-core';
import { PublicShell } from '../../public-shell';
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
    <PublicShell>
      <div className="grid gap-8 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-12 lg:py-12">
        <Link className={buttonVariants({ className: 'w-fit', variant: 'link' })} href="/people">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('back')}
        </Link>
        <PublicProfileView
          labels={{
            entryYear: t('entryYear', { year: profile.entryYear }),
            eyebrow: t('profileEyebrow'),
            links: t('links'),
            photoAlt: t('photoAlt', { name: profile.displayName }),
          }}
          profile={profile}
        />
      </div>
    </PublicShell>
  );
}
