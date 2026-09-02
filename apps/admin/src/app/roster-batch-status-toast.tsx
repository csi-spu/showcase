'use client';

import { toast } from '@showcase/ui/toast';
import { useEffect, useRef } from 'react';

export function RosterBatchStatusToast({
  message,
  tone,
}: {
  message: string;
  tone: 'success' | 'warning' | null;
}) {
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (tone === null || hasFiredRef.current) return;
    hasFiredRef.current = true;
    if (tone === 'success') toast.success(message);
    else toast.warning(message);
  }, [message, tone]);

  return null;
}
