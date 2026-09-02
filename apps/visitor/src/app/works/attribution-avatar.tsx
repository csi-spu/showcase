'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { PublicWork } from '@/lib/public-work-core';

const RETRY_DELAY_MIN_MS = 300;
const RETRY_JITTER_MS = 200;

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
  const [state, setState] = useState<{
    attempt: 0 | 1;
    phase: 'loading' | 'retry_wait' | 'failed';
  }>({ attempt: 0, phase: 'loading' });
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
    },
    [],
  );

  const handleError = () => {
    if (state.attempt === 1) {
      setState({ attempt: 1, phase: 'failed' });
      return;
    }
    if (retryTimer.current !== null) return;
    setState({ attempt: 0, phase: 'retry_wait' });
    retryTimer.current = setTimeout(
      () => {
        retryTimer.current = null;
        setState({ attempt: 1, phase: 'loading' });
      },
      RETRY_DELAY_MIN_MS + Math.floor(Math.random() * (RETRY_JITTER_MS + 1)),
    );
  };

  if (attribution.profilePublicId !== null && attribution.hasPhoto && state.phase !== 'failed') {
    const path = `/people/${attribution.profilePublicId}/photo`;
    return (
      <Image
        alt={attribution.attributionName}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] motion-reduce:transform-none"
        fill
        onError={handleError}
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        src={state.attempt === 0 ? path : `${path}?retry=1`}
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
