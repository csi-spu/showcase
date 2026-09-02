'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { PublicWork } from '@/lib/public-work-core';

const AVATAR_PALETTE = [
  'oklch(0.58 0.19 340)',
  'oklch(0.6 0.15 280)',
  'oklch(0.62 0.16 220)',
  'oklch(0.6 0.14 165)',
  'oklch(0.65 0.16 60)',
  'oklch(0.6 0.19 25)',
] as const;

function initialsOf(name: string): string {
  const graphemes = Array.from(name.trim());
  return graphemes.slice(0, 2).join('').toUpperCase() || '?';
}

function hashSeed(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash;
}

export function AttributionAvatar({
  attribution,
}: {
  attribution: PublicWork['attributions'][number];
}) {
  const [hasImageFailed, setHasImageFailed] = useState(false);

  if (attribution.profilePublicId !== null && attribution.hasPhoto && !hasImageFailed) {
    return (
      <Image
        alt={attribution.attributionName}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] motion-reduce:transform-none"
        fill
        onError={() => setHasImageFailed(true)}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        src={`/people/${attribution.profilePublicId}/photo`}
        unoptimized
      />
    );
  }

  const accent = AVATAR_PALETTE[hashSeed(attribution.attributionPublicId) % AVATAR_PALETTE.length];
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 grid place-items-center text-6xl font-semibold text-white"
      style={{ backgroundColor: accent }}
    >
      {initialsOf(attribution.attributionName)}
    </span>
  );
}
