import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { buttonVariants } from '@/components/ui/button';
import { PublicCatalogCoreClient } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl, PublicProfileCoreClient } from '@/lib/public-profile-core';
import { PublicShell } from '../../public-shell';
import { PublicProfileView } from '../public-profile-view';
import { PublicProfileWorks } from '../public-profile-works';

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  if (!z.uuid().safeParse(publicId).success) notFound();
  const coreUrl = getVisitorCoreUrl();
  const [profile, works, t] = await Promise.all([
    new PublicProfileCoreClient(coreUrl).getProfile(publicId),
    new PublicCatalogCoreClient(coreUrl).listWorks({
      limit: '6',
      profile: publicId,
      sort: 'recent',
    }),
    getTranslations('People'),
  ]);
  if (profile === null) notFound();

  return (
    <PublicShell>
      <div className="grid gap-8 px-[clamp(1rem,4vw,3rem)] py-8 lg:gap-12 lg:py-12">
        <Link className={buttonVariants({ className: 'w-fit', variant: 'link' })} href="/people">
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t('back')}
        </Link>
        <PublicProfileView
          labels={{
            bioFallback: t('bioFallback'),
            entryYear: t('entryYear', { year: profile.entryYear }),
            eyebrow: t('profileEyebrow'),
            links: t('links'),
            linksFallback: t('linksFallback'),
            photoAlt: t('photoAlt', { name: `${profile.firstName} ${profile.lastName}` }),
          }}
          profile={profile}
        />
        <PublicProfileWorks
          labels={{
            description: t('worksDescription'),
            empty: t('worksEmpty'),
            heading: t('worksHeading'),
            openWork: t('openWork'),
            posterAlt: (title) => t('workPosterAlt', { title }),
          }}
          works={works.items}
        />
      </div>
    </PublicShell>
  );
}
