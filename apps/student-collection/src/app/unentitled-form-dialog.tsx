'use client';

import { buttonVariants } from '@showcase/ui/button';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

/*
 * Shown when Core returns no obligation for a form this Student opened. One
 * neutral message covers a form that does not exist and one outside the
 * Student's groups, so the page never reveals which ids are real. The dialog
 * has no other way to close than going home: Escape leaves too, and a stray
 * click on the backdrop does not.
 */
export function UnentitledFormDialog() {
  const t = useTranslations('Forms.unentitled');
  const router = useRouter();

  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(isOpen) => {
        if (!isOpen) router.push('/');
      }}
      open
    >
      <DialogContent>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
        <DialogFooter>
          <Link className={buttonVariants()} href="/">
            {t('action')}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
