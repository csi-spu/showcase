import { cn } from '@showcase/ui/cn';
import { ImagesIcon, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import type { PeopleCatalogCard } from '@/lib/public-catalog-core';

const FALLBACK_COMPOSITIONS = [
  {
    accent: 'right-8 top-20 rotate-6',
    dot: 'left-8 top-10',
    panel: '-left-8 bottom-16 -rotate-12',
    ring: '-right-20 -bottom-16',
  },
  {
    accent: '-left-6 bottom-20 -rotate-6',
    dot: 'right-10 bottom-10',
    panel: 'right-8 top-16 rotate-12',
    ring: '-left-16 -top-12',
  },
  {
    accent: 'left-10 top-16 -rotate-12',
    dot: 'right-12 top-10',
    panel: '-right-6 bottom-14 rotate-6',
    ring: 'left-8 -bottom-24',
  },
] as const;

export function WorkPosterFallback({ title, variant }: { title: string; variant: number }) {
  const composition = FALLBACK_COMPOSITIONS[variant] ?? FALLBACK_COMPOSITIONS[0];

  return (
    <div
      className="absolute inset-0 overflow-hidden bg-primary/[0.055]"
      data-fallback-variant={variant}
      data-poster-fallback="true"
    >
      <span className="sr-only">{title}</span>
      <div aria-hidden="true" className="absolute inset-0">
        <span
          className={cn(
            'absolute size-64 rounded-full border-[2.25rem] border-primary/10 transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none',
            composition.ring,
          )}
        />
        <span
          className={cn(
            'absolute h-48 w-32 rounded-media bg-primary/12 transition-transform duration-500 group-hover:-translate-y-2 motion-reduce:transform-none',
            composition.panel,
          )}
        />
        <span
          className={cn(
            'absolute h-28 w-44 rounded-media border border-primary/20 bg-background/80 shadow-[0_1.25rem_3rem_-2rem_color-mix(in_oklch,var(--primary),transparent_45%)] backdrop-blur-sm transition-transform duration-500 group-hover:translate-x-2 motion-reduce:transform-none',
            composition.accent,
          )}
        >
          <span className="absolute top-5 left-5 h-2 w-16 rounded-control bg-primary/25" />
          <span className="absolute top-10 left-5 h-2 w-24 rounded-control bg-primary/15" />
          <span className="absolute right-5 bottom-5 size-8 rounded-control bg-primary/18" />
        </span>
        <span className={cn('absolute size-5 rounded-full bg-primary/35', composition.dot)} />
        <span className="absolute right-7 bottom-7 h-px w-20 rotate-[-35deg] bg-primary/25" />
        <span className="absolute right-7 bottom-7 h-20 w-px rotate-[-35deg] bg-primary/25" />
      </div>
    </div>
  );
}

export function PersonPortrait({
  alt,
  person,
  sizes,
}: {
  alt: string;
  person: PeopleCatalogCard;
  sizes: string;
}) {
  if (person.photo === null) {
    return (
      <div
        className="absolute inset-0 overflow-hidden bg-primary/[0.055]"
        data-person-photo-fallback="true"
      >
        <span className="sr-only">{alt}</span>
        <div aria-hidden="true" className="absolute inset-0">
          <span className="absolute -top-20 -right-20 size-64 rounded-full border-[2.5rem] border-primary/10" />
          <span className="absolute -bottom-16 -left-12 size-52 rounded-full bg-primary/10" />
          <span className="absolute top-10 left-8 h-2 w-20 rounded-control bg-primary/20" />
          <span className="absolute top-10 right-8 size-3 rounded-full bg-primary/30" />
          <span className="absolute top-16 right-8 size-2 rounded-full bg-primary/20" />
          <span className="absolute inset-x-8 top-1/2 grid aspect-square -translate-y-1/2 place-items-center rounded-[2rem] border border-primary/20 bg-background/75 text-[clamp(4rem,8vw,6.5rem)] leading-none font-semibold text-primary shadow-[0_1.5rem_4rem_-2.5rem_color-mix(in_oklch,var(--primary),transparent_40%)] backdrop-blur-sm">
            {Array.from(person.displayName.trim()).at(0)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <Image
      alt={alt}
      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
      fill
      loading="lazy"
      sizes={sizes}
      src={`/people/${person.publicId}/photo`}
      unoptimized
    />
  );
}

export function CatalogEmptyState({
  icon: Icon = ImagesIcon,
  message,
}: {
  icon?: LucideIcon;
  message: string;
}) {
  return (
    <div
      aria-live="polite"
      className="relative grid min-h-64 place-items-center overflow-hidden rounded-media border border-dashed border-border bg-card/40 px-6 py-12 text-center"
      data-empty-state="true"
      role="status"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-6 top-6 grid grid-cols-3 gap-3 opacity-45"
      >
        <span className="h-2 rounded-control bg-border" />
        <span className="h-2 rounded-control bg-border" />
        <span className="h-2 rounded-control bg-border" />
      </div>
      <div className="relative grid justify-items-center gap-4">
        <span className="grid size-14 place-items-center rounded-media text-primary ring-1 ring-border">
          <Icon aria-hidden="true" className="size-6" />
        </span>
        <p className="max-w-sm font-medium text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
