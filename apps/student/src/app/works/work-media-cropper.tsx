'use client';

import { useEffect, useRef, useState } from 'react';
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
  file,
  onCancel,
  onCrop,
  title,
}: {
  aspectRatio?: number;
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  file: File;
  onCancel: () => void;
  onCrop: (result: WorkMediaCropResult) => Promise<void>;
  title: string;
}) {
  const cropperRef = useRef<ReactCropperElement>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [sourceUrl] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    return () => URL.revokeObjectURL(sourceUrl);
  }, [sourceUrl]);

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
          <Cropper
            {...(aspectRatio === undefined ? {} : { aspectRatio })}
            autoCropArea={1}
            background={false}
            className="h-[min(60svh,36rem)] w-full overflow-hidden rounded-media bg-muted"
            dragMode="move"
            guides
            ref={cropperRef}
            responsive
            src={sourceUrl}
            viewMode={1}
          />
          {hasError ? <p className="mt-3 text-sm text-destructive">{description}</p> : null}
        </div>
        <SheetFooter>
          <Button disabled={isCropping} onClick={onCancel} type="button" variant="outline">
            {cancelLabel}
          </Button>
          <Button disabled={isCropping} onClick={confirm} type="button">
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
