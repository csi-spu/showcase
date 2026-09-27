'use client';

import { toast } from '@showcase/ui/toast';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

const PASSWORD_SET_TOAST_ID = 'password-set';

/*
 * Confirms a first-login password change on whichever page the Student lands
 * on -- the dashboard, or the deeplink that brought them here. The flag is a
 * one-shot signal: it is replaced out of the current history entry straight
 * away, so reload, back navigation and a shared URL never show it again, and
 * without a router round trip that would fetch the page from Core twice.
 */
export function PasswordSetToast() {
  const t = useTranslations('Auth.change');
  const isPasswordSet = useSearchParams().get('passwordSet') === '1';

  useEffect(() => {
    if (!isPasswordSet) return;
    // A fixed id keeps a re-run effect from stacking a second toast.
    toast.success(t('success'), { id: PASSWORD_SET_TOAST_ID });
    const url = new URL(window.location.href);
    url.searchParams.delete('passwordSet');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [isPasswordSet, t]);

  return null;
}
