import { cn } from '@showcase/ui/cn';
import { ImagesIcon, type LucideIcon } from 'lucide-react';
import Image from 'next/image';
import type { PeopleCatalogCard } from '@/lib/public-catalog-core';

// Tailwind's bg-gradient-to-* utilities interpolate in oklab and render as
// `none` on engines that don't support that gradient syntax, so this scrim
// uses a plain rgba() linear-gradient (same technique as the page hero).
export const CARD_SCRIM_CLASS =
  'pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.92)_0%,rgba(0,0,0,0.55)_42%,rgba(0,0,0,0)_100%)]';

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

// Person portraits fall back to a deterministic identicon-style tile: initials
// over a soft graphic backdrop. The palette and composition are derived from
// the Public ID so a Person keeps the same tile across renders and surfaces,
// while an adjacent grid of People without photos still reads as varied.
// The tile is a flat, light colour we chose, so its caption scrim is short and
// tinted with the tile's own ink: a black one turns the pastel to muddy grey
// and throws away the per-Person colour.
const PORTRAIT_FALLBACK_THEMES = [
  {
    dot: 'bg-[rgb(145_0_123_/_0.34)]',
    initials: 'text-[rgb(112_0_95_/_0.82)]',
    panel: 'bg-[rgb(145_0_123_/_0.12)]',
    scrim:
      'bg-[linear-gradient(to_top,rgb(112_0_95_/_0.95)_0%,rgb(112_0_95_/_0.85)_22%,rgb(112_0_95_/_0.35)_40%,rgb(112_0_95_/_0)_58%)]',
    ring: 'border-[rgb(145_0_123_/_0.09)]',
    surface: 'bg-[linear-gradient(150deg,rgb(250_238_248)_0%,rgb(240_222_237)_100%)]',
  },
  {
    dot: 'bg-[rgb(12_74_110_/_0.32)]',
    initials: 'text-[rgb(12_63_94_/_0.82)]',
    panel: 'bg-[rgb(12_74_110_/_0.12)]',
    scrim:
      'bg-[linear-gradient(to_top,rgb(12_63_94_/_0.95)_0%,rgb(12_63_94_/_0.85)_22%,rgb(12_63_94_/_0.35)_40%,rgb(12_63_94_/_0)_58%)]',
    ring: 'border-[rgb(12_74_110_/_0.09)]',
    surface: 'bg-[linear-gradient(150deg,rgb(236_245_251)_0%,rgb(218_233_244)_100%)]',
  },
  {
    dot: 'bg-[rgb(154_52_18_/_0.32)]',
    initials: 'text-[rgb(124_45_18_/_0.8)]',
    panel: 'bg-[rgb(154_52_18_/_0.12)]',
    scrim:
      'bg-[linear-gradient(to_top,rgb(124_45_18_/_0.95)_0%,rgb(124_45_18_/_0.85)_22%,rgb(124_45_18_/_0.35)_40%,rgb(124_45_18_/_0)_58%)]',
    ring: 'border-[rgb(154_52_18_/_0.09)]',
    surface: 'bg-[linear-gradient(150deg,rgb(253_243_235)_0%,rgb(246_228_213)_100%)]',
  },
  {
    dot: 'bg-[rgb(21_94_79_/_0.32)]',
    initials: 'text-[rgb(19_78_66_/_0.82)]',
    panel: 'bg-[rgb(21_94_79_/_0.12)]',
    scrim:
      'bg-[linear-gradient(to_top,rgb(19_78_66_/_0.95)_0%,rgb(19_78_66_/_0.85)_22%,rgb(19_78_66_/_0.35)_40%,rgb(19_78_66_/_0)_58%)]',
    ring: 'border-[rgb(21_94_79_/_0.09)]',
    surface: 'bg-[linear-gradient(150deg,rgb(236_248_243)_0%,rgb(215_236_228)_100%)]',
  },
  {
    dot: 'bg-[rgb(76_29_149_/_0.3)]',
    initials: 'text-[rgb(67_26_130_/_0.8)]',
    panel: 'bg-[rgb(76_29_149_/_0.11)]',
    scrim:
      'bg-[linear-gradient(to_top,rgb(67_26_130_/_0.95)_0%,rgb(67_26_130_/_0.85)_22%,rgb(67_26_130_/_0.35)_40%,rgb(67_26_130_/_0)_58%)]',
    ring: 'border-[rgb(76_29_149_/_0.09)]',
    surface: 'bg-[linear-gradient(150deg,rgb(243_240_252)_0%,rgb(227_221_246)_100%)]',
  },
  {
    dot: 'bg-[rgb(133_77_14_/_0.32)]',
    initials: 'text-[rgb(113_63_18_/_0.8)]',
    panel: 'bg-[rgb(133_77_14_/_0.12)]',
    scrim:
      'bg-[linear-gradient(to_top,rgb(113_63_18_/_0.95)_0%,rgb(113_63_18_/_0.85)_22%,rgb(113_63_18_/_0.35)_40%,rgb(113_63_18_/_0)_58%)]',
    ring: 'border-[rgb(133_77_14_/_0.09)]',
    surface: 'bg-[linear-gradient(150deg,rgb(252_247_233)_0%,rgb(245_234_206)_100%)]',
  },
] as const;

const PORTRAIT_FALLBACK_COMPOSITIONS = [
  { dot: 'right-9 top-12', panel: '-left-10 -bottom-6 rotate-12', ring: '-right-24 -top-20' },
  { dot: 'left-9 top-14', panel: '-right-10 -bottom-8 -rotate-12', ring: '-left-24 -top-16' },
  { dot: 'right-10 bottom-24', panel: '-left-12 -top-10 -rotate-6', ring: '-right-20 -bottom-24' },
] as const;

// Thai has no case, so an initial is the name's first consonant. Leading
// vowels (เ แ โ ใ ไ) are written before their consonant but are not read
// first, so `ไชยเค้า` initials as `ช`; combining vowels and tone marks above
// or below the consonant are dropped too. Names in other scripts fall back to
// the first letter, upper-cased.
const THAI_CONSONANT = /[ก-ฮ]/u;
const LETTER = /\p{L}/u;

function nameInitial(value: string): string {
  const thaiConsonant = THAI_CONSONANT.exec(value);
  if (thaiConsonant !== null) {
    return thaiConsonant[0];
  }

  const letter = LETTER.exec(value);
  return letter === null ? '' : letter[0].toLocaleUpperCase();
}

export function personInitials(person: Pick<PeopleCatalogCard, 'firstName' | 'lastName'>): string {
  const initials = `${nameInitial(person.firstName)}${nameInitial(person.lastName)}`;
  return initials === '' ? '\u2014' : initials;
}

export function personScrimClass(person: Pick<PeopleCatalogCard, 'photo' | 'publicId'>): string {
  if (person.photo !== null) return CARD_SCRIM_CLASS;

  const theme = PORTRAIT_FALLBACK_THEMES[portraitFallbackVariant(person.publicId)]!;
  return cn('pointer-events-none absolute inset-0', theme.scrim);
}

export function portraitFallbackVariant(publicId: string): number {
  let hash = 0;
  for (const character of publicId) {
    hash = (hash * 31 + character.codePointAt(0)!) % 1_000_003;
  }
  return hash % PORTRAIT_FALLBACK_THEMES.length;
}

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
    const variant = portraitFallbackVariant(person.publicId);
    const theme = PORTRAIT_FALLBACK_THEMES[variant]!;
    const composition =
      PORTRAIT_FALLBACK_COMPOSITIONS[variant % PORTRAIT_FALLBACK_COMPOSITIONS.length]!;

    return (
      <div
        className={cn('absolute inset-0 overflow-hidden', theme.surface)}
        data-person-photo-fallback="true"
        data-person-photo-fallback-kind="initials"
        data-person-photo-fallback-variant={variant}
      >
        <span className="sr-only">{alt}</span>
        <div aria-hidden="true" className="absolute inset-0">
          <span
            className={cn(
              'absolute size-64 rounded-full border-[2.75rem] transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none',
              theme.ring,
              composition.ring,
            )}
          />
          <span
            className={cn(
              'absolute size-36 rounded-media transition-transform duration-500 group-hover:-translate-y-1.5 motion-reduce:transform-none',
              theme.panel,
              composition.panel,
            )}
          />
          <span className={cn('absolute size-4 rounded-full', theme.dot, composition.dot)} />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center pb-[26%] transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transform-none"
        >
          <span
            className={cn(
              'text-5xl leading-none font-semibold tracking-tight sm:text-6xl',
              theme.initials,
            )}
          >
            {personInitials(person)}
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
