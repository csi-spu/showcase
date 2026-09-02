'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorkCatalogCard } from '@/lib/public-catalog-core';

const RETRY_DELAY_MIN_MS = 300;
const RETRY_JITTER_MS = 200;

export function WorkPosterImage({
  alt,
  className,
  fallback,
  loading,
  poster,
  preload = false,
  sizes,
  workPublicId,
}: {
  alt: string;
  className: string;
  fallback: ReactNode;
  loading?: 'eager' | 'lazy';
  poster: NonNullable<WorkCatalogCard['poster']>;
  preload?: boolean;
  sizes: string;
  workPublicId: string;
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

  if (state.phase !== 'loading') return fallback;

  const largest = poster.variants.at(-1);
  if (largest === undefined) return fallback;
  const mediaPath = (width: number) => {
    const path = `/works/${workPublicId}/media/${poster.assetId}/${width}`;
    return state.attempt === 0 ? path : `${path}?retry=1`;
  };

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

  return (
    <div
      className="absolute inset-0"
      data-poster-attempt={state.attempt + 1}
      style={{ backgroundColor: poster.dominantColor }}
    >
      <picture>
        <source
          sizes={sizes}
          srcSet={poster.variants
            .map((variant) => `${mediaPath(variant.width)} ${variant.width}w`)
            .join(', ')}
          type="image/webp"
        />
        <Image
          alt={alt}
          className={className}
          height={largest.height}
          loading={loading}
          onError={handleError}
          preload={preload}
          sizes={sizes}
          src={mediaPath(largest.width)}
          unoptimized
          width={largest.width}
        />
      </picture>
    </div>
  );
}
