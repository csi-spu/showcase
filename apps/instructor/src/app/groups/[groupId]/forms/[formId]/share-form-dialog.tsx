'use client';

import { Button, buttonVariants } from '@showcase/ui/button';
import { toast } from '@showcase/ui/toast';
import { CopyIcon, DownloadIcon, QrCodeIcon } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

const QR_CODE_DISPLAY_SIZE = 224;

/*
 * The QR code arrives already rendered on the server, so the QR library stays
 * out of this bundle. It is shown as an image, never injected as markup.
 */
export function ShareFormDialog({
  downloadHref,
  formTitle,
  link,
  qrCodeSvg,
}: {
  downloadHref: string;
  formTitle: string;
  link: string;
  qrCodeSvg: string;
}) {
  const t = useTranslations('Forms');

  async function copyLink() {
    try {
      /* Absent outside a secure context, so it fails into the same guidance. */
      if (navigator.clipboard === undefined) throw new Error('CLIPBOARD_UNAVAILABLE');
      await navigator.clipboard.writeText(link);
      toast.success(t('share.copied'));
    } catch {
      toast.error(t('share.copyFailed'));
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <QrCodeIcon aria-hidden="true" data-icon="inline-start" />
            {t('share.action')}
          </Button>
        }
      />
      <DialogContent>
        <DialogTitle>{t('share.title')}</DialogTitle>
        <DialogDescription>{t('share.description')}</DialogDescription>
        <Image
          alt={t('share.qrCodeAlt', { title: formTitle })}
          className="mx-auto rounded-control border border-border bg-white"
          height={QR_CODE_DISPLAY_SIZE}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCodeSvg)}`}
          unoptimized
          width={QR_CODE_DISPLAY_SIZE}
        />
        <Field>
          <FieldLabel htmlFor="student-form-link">{t('share.linkLabel')}</FieldLabel>
          <div className="flex gap-2">
            <Input
              className="min-w-0 flex-1"
              id="student-form-link"
              onFocus={(event) => event.currentTarget.select()}
              readOnly
              value={link}
            />
            <Button onClick={copyLink} type="button">
              <CopyIcon aria-hidden="true" data-icon="inline-start" />
              {t('share.copy')}
            </Button>
          </div>
        </Field>
        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline">
                {t('share.close')}
              </Button>
            }
          />
          <a className={buttonVariants({ variant: 'outline' })} download href={downloadHref}>
            <DownloadIcon aria-hidden="true" data-icon="inline-start" />
            {t('share.downloadQrCode')}
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
