import Image from 'next/image';
import { ArrowUpRightIcon, LinkIcon, UserRoundIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BlurFade } from '@/components/ui/blur-fade';
import { InteractiveGridPattern } from '@/components/ui/interactive-grid-pattern';
import type { PublicProfile } from '@/lib/public-profile-core';

interface PublicProfileLabels {
  bioFallback: string;
  entryYear: string;
  eyebrow: string;
  links: string;
  linksFallback: string;
  photoAlt: string;
}

export function PublicProfileView({
  labels,
  profile,
}: {
  labels: PublicProfileLabels;
  profile: PublicProfile;
}) {
  const bio = profile.bio?.trim();

  return (
    <article className="grid gap-8 lg:gap-12">
      <BlurFade blur="8px" duration={0.45}>
        <section className="relative isolate grid overflow-hidden rounded-media border border-border bg-card shadow-[0_2rem_5rem_-3rem_color-mix(in_oklch,var(--primary),transparent_50%)] lg:grid-cols-12">
          <InteractiveGridPattern
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 left-auto -z-10 h-full w-4/5 border-0 opacity-55 [mask-image:linear-gradient(to_left,black,transparent_88%)]"
            squares={[16, 14]}
            squaresClassName="stroke-primary/10"
            tabIndex={-1}
          />
          <header className="grid content-center gap-5 px-5 py-10 sm:px-8 sm:py-12 lg:col-span-7 lg:px-12 lg:py-16">
            <Badge className="w-fit" variant="outline">
              {labels.eyebrow}
            </Badge>
            <h1 className="text-[clamp(2.6rem,6vw,5rem)] leading-[1.08] font-semibold tracking-[-0.05em] text-balance">
              {profile.displayName}
            </h1>
            <Badge className="w-fit" variant="secondary">
              {labels.entryYear}
            </Badge>
            <p
              className={
                bio
                  ? 'max-w-[65ch] text-lg leading-[1.85] text-foreground text-pretty'
                  : 'max-w-[52ch] text-base leading-relaxed text-muted-foreground italic'
              }
            >
              {bio || labels.bioFallback}
            </p>
          </header>

          <div className="relative min-h-[24rem] overflow-hidden border-t border-border bg-muted lg:col-span-5 lg:min-h-[36rem] lg:border-t-0 lg:border-l">
            {profile.photo ? (
              <Image
                alt={labels.photoAlt}
                className="object-cover transition-transform duration-700 hover:scale-[1.02] motion-reduce:transition-none motion-reduce:transform-none"
                fill
                sizes="(max-width: 1024px) 100vw, 42vw"
                src={`/people/${profile.publicId}/photo`}
                unoptimized
              />
            ) : (
              <ProfilePhotoFallback alt={labels.photoAlt} />
            )}
          </div>
        </section>
      </BlurFade>

      <BlurFade blur="5px" duration={0.4} inView>
        <section className="grid gap-5 rounded-media border border-border bg-card p-5 shadow-[0_1.5rem_4rem_-3rem_color-mix(in_oklch,var(--primary),transparent_58%)] sm:p-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] lg:gap-12 lg:p-10">
          <div className="grid content-start gap-3">
            <span className="grid size-11 place-items-center rounded-control bg-primary-soft text-primary">
              <LinkIcon aria-hidden="true" className="size-5" />
            </span>
            <h2 className="text-3xl font-semibold tracking-[-0.03em]">{labels.links}</h2>
          </div>
          {profile.links.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {profile.links.map((link) => (
                <li key={link.url}>
                  <a
                    className="group flex min-h-14 items-center justify-between gap-3 rounded-control border border-border bg-background px-4 font-medium text-primary transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/35 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary motion-reduce:transform-none"
                    href={link.url}
                    rel="external noopener noreferrer"
                  >
                    {link.label}
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none"
                    />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid min-h-28 place-items-center rounded-media border border-dashed border-border bg-muted/35 px-6 text-center text-muted-foreground">
              <p>{labels.linksFallback}</p>
            </div>
          )}
        </section>
      </BlurFade>
    </article>
  );
}

function ProfilePhotoFallback({ alt }: { alt: string }) {
  return (
    <div
      className="absolute inset-0 grid place-items-center overflow-hidden bg-primary/[0.055]"
      data-profile-photo-fallback="true"
    >
      <span className="sr-only">{alt}</span>
      <span
        aria-hidden="true"
        className="absolute -top-20 -right-20 size-72 rounded-full border-[3rem] border-primary/10"
      />
      <span
        aria-hidden="true"
        className="absolute -bottom-20 -left-16 size-64 rounded-full bg-primary/10"
      />
      <span className="relative grid size-48 place-items-center rounded-full border border-primary/20 bg-background/75 text-primary shadow-[0_2rem_5rem_-3rem_color-mix(in_oklch,var(--primary),transparent_45%)] backdrop-blur-sm sm:size-56">
        <UserRoundIcon aria-hidden="true" className="size-28 sm:size-32" strokeWidth={1.1} />
      </span>
    </div>
  );
}
