'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Cropper, { type ReactCropperElement } from 'react-cropper';
import 'cropperjs/dist/cropper.css';
import { Button } from '@showcase/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type WorkMediaCropResult = {
  blob: Blob;
  height: number;
  width: number;
};

export function WorkMediaCropper({
  aspectRatio,
  cancelLabel,
  confirmLabel,
  description,
  errorLabel,
  file,
  loadingLabel,
  onCancel,
  onCrop,
  title,
}: {
  aspectRatio?: number;
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  errorLabel: string;
  file: File;
  loadingLabel: string;
  onCancel: () => void;
  onCrop: (result: WorkMediaCropResult) => Promise<void>;
  title: string;
}) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  useEffect(() => {
    const reader = new FileReader();

    const handleLoad = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        return;
      }
      setHasError(true);
    };
    const handleError = () => setHasError(true);

    reader.addEventListener('load', handleLoad);
    reader.addEventListener('error', handleError);
    reader.readAsDataURL(file);

    return () => {
      reader.removeEventListener('load', handleLoad);
      reader.removeEventListener('error', handleError);
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [file]);

  const handleReady = useCallback(() => setIsReady(true), []);

  const confirm = async () => {
    const canvas = cropperRef.current?.cropper.getCroppedCanvas({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      maxHeight: 2_560,
      maxWidth: 2_560,
      minHeight: 320,
      minWidth: 320,
    });
    if (canvas === undefined || canvas === null) {
      setHasError(true);
      return;
    }
    setIsCropping(true);
    setHasError(false);
    const blob = await canvasToBlob(canvas);
    if (blob === null) {
      setHasError(true);
      setIsCropping(false);
      return;
    }
    await onCrop({ blob, height: canvas.height, width: canvas.width });
  };

  return (
    <Sheet
      onOpenChange={(isOpen) => {
        if (!isOpen && !isCropping) onCancel();
      }}
      open
    >
      <SheetContent
        className="w-full max-w-full overflow-y-auto sm:max-w-2xl"
        closeLabel={cancelLabel}
        side="right"
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="text-xl">{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 px-4">
          {sourceUrl === null ? (
            <div className="flex h-[min(60svh,36rem)] items-center justify-center rounded-media bg-muted px-6 text-center text-sm text-muted-foreground">
              {hasError ? errorLabel : loadingLabel}
            </div>
          ) : (
            <Cropper
              {...(aspectRatio === undefined ? {} : { aspectRatio })}
              autoCropArea={1}
              background={false}
              className="h-[min(60svh,36rem)] w-full overflow-hidden rounded-media bg-muted"
              dragMode="move"
              guides
              ready={handleReady}
              ref={cropperRef}
              responsive
              src={sourceUrl}
              viewMode={1}
            />
          )}
          {hasError && sourceUrl !== null ? (
            <p className="mt-3 text-sm text-destructive">{errorLabel}</p>
          ) : null}
        </div>
        <SheetFooter>
          <Button disabled={isCropping} onClick={onCancel} type="button" variant="outline">
            {cancelLabel}
          </Button>
          <Button disabled={isCropping || !isReady} onClick={confirm} type="button">
            {confirmLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}
