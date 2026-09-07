'use client';

import { UserRoundIcon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import type { WorkRevision } from '@/lib/student-works-core';

const RETRY_DELAY_MIN_MS = 300;
const RETRY_JITTER_MS = 200;

export function WorkRevisionAttributionAvatar({
  attribution,
}: {
  attribution: WorkRevision['attributions'][number];
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

  if (attribution.hasPhoto && attribution.profilePublicId !== null && state.phase !== 'failed') {
    const path = `/people/${attribution.profilePublicId}/photo`;
    return (
      <span className="grid size-9 place-items-center overflow-hidden rounded-full bg-primary-soft text-primary">
        <Image
          alt={attribution.attributionName}
          className="size-full object-cover"
          height={36}
          onError={handleError}
          sizes="36px"
          src={state.attempt === 0 ? path : `${path}?retry=1`}
          unoptimized
          width={36}
        />
      </span>
    );
  }

  return (
    <span className="grid size-9 place-items-center rounded-full bg-primary-soft text-primary">
      <UserRoundIcon aria-hidden="true" className="size-4" />
    </span>
  );
}
