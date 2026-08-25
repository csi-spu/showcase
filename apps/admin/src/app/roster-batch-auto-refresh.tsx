'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const REFRESH_INTERVAL_MS = 2_000;

export function RosterBatchAutoRefresh({ label }: { label: string }) {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <p aria-live="polite" className="text-sm text-muted-foreground" role="status">
      <span
        aria-hidden="true"
        className="mr-2 inline-block size-2 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
      />
      {label}
    </p>
  );
}
