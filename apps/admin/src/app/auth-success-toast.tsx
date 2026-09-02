'use client';

import { toast } from '@showcase/ui/toast';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function AuthSuccessToast({
  message,
  redirectTo = '/',
}: {
  message: string | null;
  redirectTo?: string;
}) {
  const router = useRouter();
  const hasShownRef = useRef(false);

  useEffect(() => {
    if (message === null || hasShownRef.current) return;
    hasShownRef.current = true;
    toast.success(message);
    router.replace(redirectTo, { scroll: false });
  }, [message, redirectTo, router]);

  return null;
}
