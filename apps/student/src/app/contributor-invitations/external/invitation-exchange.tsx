'use client';

import { startTransition, useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { exchangeExternalInvitationAction } from '../contributor-invitations.actions';

export function InvitationExchange() {
  const t = useTranslations('ContributorInvitations');
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => '');
  const token = hash === '' ? null : new URLSearchParams(hash.slice(1)).get('token');
  const isInvalid = hash !== '' && token === null;
  const exchangedToken = useRef<string | null>(null);

  useEffect(() => {
    if (token === null || exchangedToken.current === token) {
      return;
    }
    exchangedToken.current = token;
    window.history.replaceState(null, '', window.location.pathname);
    startTransition(() => {
      void exchangeExternalInvitationAction(token);
    });
  }, [token]);

  return (
    <p aria-live="polite" className="text-muted-foreground">
      {isInvalid ? t('invalidLink') : t('exchanging')}
    </p>
  );
}

function subscribeToHash(onStoreChange: () => void) {
  window.addEventListener('hashchange', onStoreChange);
  return () => window.removeEventListener('hashchange', onStoreChange);
}

function readHash() {
  return window.location.hash || '#';
}
