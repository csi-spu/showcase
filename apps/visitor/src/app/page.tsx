import { buttonVariants } from '@showcase/ui/button';
import { ArrowRightIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import { WordRotate } from '@/components/ui/word-rotate';
import { PublicCatalogCoreClient } from '@/lib/public-catalog-core';
import { getVisitorCoreUrl } from '@/lib/public-profile-core';
import { HeroArtwork } from './hero-artwork';
import { HomepageBrandMarquee } from './homepage-brand-marquee';
import { HomepageFeaturedCollections } from './homepage-featured-collections';
import { HomepageQuickSearch } from './homepage-quick-search';
import { PublicShell } from './public-shell';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const catalogClient = new PublicCatalogCoreClient(getVisitorCoreUrl());
  const [t, quickSearchT, courseWorks, competitionEntries, academicArticles, people] =
    await Promise.all([
      getTranslations('Home'),
      getTranslations('QuickSearch'),
      catalogClient.listWorks({ category: 'course_work', limit: '3', sort: 'recent' }),
      catalogClient.listWorks({ category: 'competition_entry', limit: '3', sort: 'recent' }),
      catalogClient.listWorks({ category: 'academic_article', limit: '3', sort: 'recent' }),
      catalogClient.listPeople({ limit: '4', sort: 'name' }),
    ]);

  return (
    <PublicShell>
      <div className="grid gap-24 px-[clamp(1rem,4vw,3rem)] pb-12 pt-6 lg:gap-32 lg:pb-24 lg:pt-10">
        <div>
          <BlurFade blur="8px" duration={0.45}>
            <header className="relative isolate grid min-h-[40rem] grid-cols-4 items-end gap-x-4 overflow-hidden rounded-media bg-muted px-5 py-10 shadow-[0_2rem_5rem_-2.5rem_color-mix(in_oklch,var(--primary),transparent_55%)] md:min-h-[44rem] md:grid-cols-8 md:px-8 md:py-14 lg:min-h-[38rem] lg:grid-cols-12 lg:items-center lg:gap-x-6 lg:px-12 lg:py-16">
              <HeroArtwork alt={t('heroAlt')} />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-4/5 bg-[linear-gradient(to_top,rgba(19,15,25,0.98)_0%,rgba(19,15,25,0.88)_48%,rgba(19,15,25,0)_100%)] lg:hidden"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,rgba(19,15,25,0.98)_0%,rgba(25,17,34,0.92)_38%,rgba(25,17,34,0.58)_52%,rgba(25,17,34,0)_70%)] lg:block"
              />
              <InteractiveGridPattern
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 left-auto -z-10 h-full w-full border-0 opacity-65 [mask-image:linear-gradient(to_left,black,transparent_82%)] md:w-4/5"
                squares={[18, 13]}
                squaresClassName="stroke-primary-foreground/20"
                tabIndex={-1}
              />
              <div className="col-span-4 grid content-center gap-6 text-white md:col-span-7 lg:col-span-5">
                <Badge
                  className="border-white/20 bg-white/10 text-white backdrop-blur-sm"
                  variant="outline"
                >
                  {t('eyebrow')}
                </Badge>
                <h1 className="mt-2 max-w-4xl text-[clamp(2.75rem,6vw,5.5rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance lg:max-w-2xl">
                  <span className="block">{t('title')}</span>
                  <WordRotate
                    accessibleLabel={t('titleRotating.accessibleLabel')}
                    className="mt-[0.08em] w-fit max-w-full text-[clamp(2rem,4vw,4rem)] leading-[1.12] tracking-[-0.04em] text-nowrap text-[#f3a6e4]"
                    duration={3000}
                    words={[
                      t('titleRotating.courseWork'),
                      t('titleRotating.competitionEntry'),
                      t('titleRotating.academicArticle'),
                    ]}
                  />
                </h1>
                <p className="max-w-xl text-lg leading-relaxed text-white/75 sm:text-xl">
                  {t('description')}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className={buttonVariants({
                      className:
                        'transition-[transform,background-color] duration-200 hover:-translate-y-0.5 motion-reduce:transform-none',
                      size: 'lg',
                    })}
                    href="/works"
                  >
                    {t('viewWorks')}
                    <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
                  </Link>
                  <Link
                    className={buttonVariants({
                      className:
                        'border-white/30 bg-white/10 text-white backdrop-blur-sm transition-[transform,background-color,color] duration-200 hover:-translate-y-0.5 hover:bg-white/15 hover:text-white motion-reduce:transform-none',
                      size: 'lg',
                      variant: 'outline',
                    })}
                    href="/people"
                  >
                    {t('viewPeople')}
                  </Link>
                </div>
                <HomepageBrandMarquee
                  csiLogoAlt={t('brandMarquee.csiLogoAlt')}
                  label={t('brandMarquee.label')}
                  sitLogoAlt={t('brandMarquee.sitLogoAlt')}
                  spuLogoAlt={t('brandMarquee.spuLogoAlt')}
                />
              </div>
            </header>
          </BlurFade>
          <HomepageQuickSearch
            placeholderWords={[
              quickSearchT('exampleStudent'),
              quickSearchT('exampleWork'),
              quickSearchT('exampleTopic'),
            ]}
          />
        </div>

        <HomepageFeaturedCollections
          academicArticles={academicArticles.items}
          competitionEntries={competitionEntries.items}
          courseWorks={courseWorks.items}
          labels={{
            academicArticles: {
              artworkAlt: t('featured.academicArticles.artworkAlt'),
              description: t('featured.academicArticles.description'),
              title: t('featured.academicArticles.title'),
              viewAll: t('featured.academicArticles.viewAll'),
            },
            competitionEntries: {
              artworkAlt: t('featured.competitionEntries.artworkAlt'),
              description: t('featured.competitionEntries.description'),
              title: t('featured.competitionEntries.title'),
              viewAll: t('featured.competitionEntries.viewAll'),
            },
            courseWorks: {
              artworkAlt: t('featured.courseWorks.artworkAlt'),
              description: t('featured.courseWorks.description'),
              title: t('featured.courseWorks.title'),
              viewAll: t('featured.courseWorks.viewAll'),
            },
            emptyPeople: t('featured.emptyPeople'),
            emptyWorks: t('featured.emptyWorks'),
            personPhotoAlt: (name) => t('featured.personPhotoAlt', { name }),
            people: {
              artworkAlt: t('featured.people.artworkAlt'),
              description: t('featured.people.description'),
              title: t('featured.people.title'),
              viewAll: t('featured.people.viewAll'),
            },
            posterAlt: (title) => t('posterAlt', { title }),
            publishedWorks: (count) => t('featured.publishedWorks', { count }),
            studentEntryYear: (year) => t('featured.studentEntryYear', { year }),
          }}
          people={people.items}
        />
      </div>
    </PublicShell>
  );
}
