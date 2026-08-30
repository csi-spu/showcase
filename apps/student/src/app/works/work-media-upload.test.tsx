import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';

const actions = vi.hoisted(() => ({
  attach: vi.fn(),
  authorize: vi.fn(),
  finalize: vi.fn(),
  getStatus: vi.fn(),
  refresh: vi.fn(),
}));
const cropper = vi.hoisted(() => ({ getCroppedCanvas: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }));
vi.mock('./work.actions', () => ({
  attachWorkMediaAction: actions.attach,
  finalizeWorkMediaAction: actions.finalize,
  getWorkMediaStatusAction: actions.getStatus,
  uploadWorkMediaAction: actions.authorize,
}));
vi.mock('react-cropper', () => ({
  default: forwardRef(function CropperMock(
    { aspectRatio }: { aspectRatio: number },
    ref: React.ForwardedRef<unknown>,
  ) {
    useImperativeHandle(ref, () => ({ cropper: { getCroppedCanvas: cropper.getCroppedCanvas } }));
    return <div aria-label="เครื่องมือครอป" data-aspect-ratio={aspectRatio} />;
  }),
}));

import { WorkMediaUpload } from './work-media-upload';

const ASSET_ID = '64000000-0000-4000-8000-000000000001';
const PUBLIC_ID = '64000000-0000-4000-8000-000000000002';

describe('WorkMediaUpload', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    FakeXmlHttpRequest.latest = null;
  });

  it('shows determinate progress, finalizes, polls processed output, and attaches it', async () => {
    actions.authorize.mockResolvedValue({
      assetId: ASSET_ID,
      expiresAt: '2026-08-25T12:10:00.000Z',
      headers: { 'content-type': 'image/jpeg' },
      status: 'pending_upload',
      uploadUrl: 'https://r2.example.test/presigned',
    });
    actions.finalize.mockResolvedValue({ assetId: ASSET_ID, status: 'uploaded' });
    actions.getStatus.mockResolvedValue({
      assetId: ASSET_ID,
      preview: {
        expiresAt: '2026-08-25T12:10:00.000Z',
        height: 1600,
        url: 'https://r2.example.test/preview',
        width: 1200,
      },
      rejectionCode: null,
      status: 'ready',
      warnings: ['poster_width_below_recommended'],
    });
    actions.attach.mockResolvedValue({ outcome: 'attached', version: 2 });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    renderUpload();

    const file = new File(['image'], 'poster.JPG', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('เลือกไฟล์โปสเตอร์'), { target: { files: [file] } });
    await waitFor(() => expect(FakeXmlHttpRequest.latest).not.toBeNull());
    FakeXmlHttpRequest.latest?.progress(1, 2);
    expect(await screen.findByText('กำลังอัปโหลด 50%')).toBeTruthy();
    FakeXmlHttpRequest.latest?.respond(200);

    await waitFor(() => expect(screen.getByText('เพิ่มรูปภาพแล้ว')).toBeTruthy());
    expect(actions.authorize).toHaveBeenCalledWith({
      byteSize: file.size,
      contentType: 'image/jpeg',
      fileExtension: 'jpg',
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      mediaKind: 'poster',
      publicId: PUBLIC_ID,
    });
    expect(actions.finalize).toHaveBeenCalledWith({ assetId: ASSET_ID, publicId: PUBLIC_ID });
    expect(actions.attach).toHaveBeenCalledWith({
      assetId: ASSET_ID,
      expectedVersion: 1,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
      mediaKind: 'poster',
      publicId: PUBLIC_ID,
    });
    const preview = screen.getByAltText('ตัวอย่างโปสเตอร์ที่ผ่านการประมวลผล');
    expect(preview.className).toContain('max-h-80');
    expect(preview.parentElement?.className).toContain('max-w-64');
    expect(screen.getByText('เพิ่มรูปภาพแล้ว')).toBeTruthy();
    expect(screen.getByText(/กว้างต่ำกว่า 1,200 พิกเซล/)).toBeTruthy();
    expect(actions.refresh).toHaveBeenCalledOnce();
  });

  it('uploads multiple Gallery files sequentially and keeps every compact preview', async () => {
    const secondAssetId = '64000000-0000-4000-8000-000000000003';
    actions.authorize
      .mockResolvedValueOnce({
        assetId: ASSET_ID,
        expiresAt: '2026-08-25T12:10:00.000Z',
        headers: { 'content-type': 'image/png' },
        status: 'pending_upload',
        uploadUrl: 'https://r2.example.test/presigned',
      })
      .mockResolvedValueOnce({
        assetId: secondAssetId,
        expiresAt: '2026-08-25T12:10:00.000Z',
        headers: { 'content-type': 'image/png' },
        status: 'pending_upload',
        uploadUrl: 'https://r2.example.test/presigned-2',
      });
    actions.finalize.mockResolvedValue({ assetId: ASSET_ID, status: 'uploaded' });
    actions.getStatus
      .mockResolvedValueOnce({
        assetId: ASSET_ID,
        preview: {
          expiresAt: '2026-08-25T12:10:00.000Z',
          height: 900,
          url: 'https://r2.example.test/preview',
          width: 1600,
        },
        rejectionCode: null,
        status: 'ready',
        warnings: [],
      })
      .mockResolvedValueOnce({
        assetId: secondAssetId,
        preview: {
          expiresAt: '2026-08-25T12:10:00.000Z',
          height: 900,
          url: 'https://r2.example.test/preview-2',
          width: 1600,
        },
        rejectionCode: null,
        status: 'ready',
        warnings: [],
      });
    actions.attach
      .mockResolvedValueOnce({ outcome: 'attached', version: 2 })
      .mockResolvedValueOnce({ outcome: 'attached', version: 3 });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    renderUpload({ height: 900, mediaKind: 'gallery', width: 1600 });

    const input = screen.getByLabelText('เลือกไฟล์ภาพแกลเลอรี');
    expect((input as HTMLInputElement).multiple).toBe(true);
    fireEvent.change(input, {
      target: {
        files: [
          new File(['image'], 'gallery.png', { type: 'image/png' }),
          new File(['image-2'], 'gallery-2.png', { type: 'image/png' }),
        ],
      },
    });
    await waitFor(() => expect(FakeXmlHttpRequest.latest).not.toBeNull());
    const firstRequest = FakeXmlHttpRequest.latest;
    firstRequest?.respond(200);

    const firstPreview = await screen.findByAltText('ตัวอย่างภาพแกลเลอรีที่ผ่านการประมวลผล');
    expect(firstPreview.className).toContain('max-h-64');
    expect(firstPreview.parentElement?.className).toContain('max-w-md');

    await waitFor(() => expect(FakeXmlHttpRequest.latest).not.toBe(firstRequest));
    FakeXmlHttpRequest.latest?.respond(200);

    await waitFor(() =>
      expect(screen.getAllByAltText('ตัวอย่างภาพแกลเลอรีที่ผ่านการประมวลผล')).toHaveLength(2),
    );
    expect(actions.attach).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 2 }),
    );
  });

  it('restores attached Gallery previews and stops at three images', async () => {
    const media = [
      galleryMedia('64000000-0000-4000-8000-000000000011', 1),
      galleryMedia('64000000-0000-4000-8000-000000000012', 2),
      galleryMedia('64000000-0000-4000-8000-000000000013', 3),
    ];
    actions.getStatus.mockImplementation(({ assetId }: { assetId: string }) =>
      Promise.resolve({
        assetId,
        preview: {
          expiresAt: '2026-08-25T12:10:00.000Z',
          height: 900,
          url: `https://r2.example.test/${assetId}`,
          width: 1600,
        },
        rejectionCode: null,
        status: 'ready',
        warnings: [],
      }),
    );

    renderUpload({ media, mediaKind: 'gallery' });

    await waitFor(() =>
      expect(screen.getAllByAltText('ตัวอย่างภาพแกลเลอรีที่ผ่านการประมวลผล')).toHaveLength(3),
    );
    expect((screen.getByLabelText('เลือกไฟล์ภาพแกลเลอรี') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('เพิ่มแล้ว 3 จาก 3 ภาพ')).toBeTruthy();
  });

  it('offers the Cropper.js editor for a Poster outside the accepted ratio', async () => {
    const croppedBlob = new Blob(['cropped-image'], { type: 'image/jpeg' });
    cropper.getCroppedCanvas.mockReturnValue({
      height: 1200,
      toBlob: (callback: BlobCallback) => callback(croppedBlob),
      width: 900,
    });
    actions.authorize.mockResolvedValue({
      assetId: ASSET_ID,
      expiresAt: '2026-08-25T12:10:00.000Z',
      headers: { 'content-type': 'image/jpeg' },
      status: 'pending_upload',
      uploadUrl: 'https://r2.example.test/presigned',
    });
    actions.attach.mockResolvedValue({ outcome: 'attached', version: 2 });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    renderUpload({ height: 1200, width: 1600 });

    fireEvent.change(screen.getByLabelText('เลือกไฟล์โปสเตอร์'), {
      target: { files: [new File(['image'], 'landscape.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('heading', { name: 'ครอปโปสเตอร์' })).toBeTruthy();
    expect(screen.getByLabelText('เครื่องมือครอป').getAttribute('data-aspect-ratio')).toBe('0.75');
    expect(actions.authorize).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ครอปและอัปโหลด' }));

    await waitFor(() => expect(actions.authorize).toHaveBeenCalledOnce());
    expect(actions.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        byteSize: croppedBlob.size,
        contentType: 'image/jpeg',
        fileExtension: 'jpg',
      }),
    );
  });

  it('offers the Cropper.js editor for an oversized Gallery image', async () => {
    renderUpload({ height: 9_000, mediaKind: 'gallery', width: 9_000 });

    fireEvent.change(screen.getByLabelText('เลือกไฟล์ภาพแกลเลอรี'), {
      target: { files: [new File(['image'], 'large-gallery.png', { type: 'image/png' })] },
    });

    expect(await screen.findByRole('heading', { name: 'ครอปรูปแกลเลอรี' })).toBeTruthy();
    expect(screen.getByLabelText('เครื่องมือครอป').getAttribute('data-aspect-ratio')).toBeNull();
    expect(actions.authorize).not.toHaveBeenCalled();
  });

  it('rejects a MIME and extension mismatch before requesting authorization', async () => {
    renderUpload();
    const input = screen.getByLabelText('เลือกไฟล์โปสเตอร์');
    expect(input.className).toContain('sr-only');
    input.focus();
    expect(document.activeElement).toBe(input);
    expect(input.closest('[data-slot="field"]')?.className).toContain(
      'has-[:focus-visible]:ring-2',
    );
    expect(screen.getByText('ยังไม่ได้เลือกไฟล์')).toBeTruthy();
    const file = new File(['image'], 'poster.png', { type: 'image/jpeg' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(screen.getByText('poster.png')).toBeTruthy();
    expect(await screen.findByText(/นามสกุลต้องตรงกับชนิดไฟล์/)).toBeTruthy();
    expect(actions.authorize).not.toHaveBeenCalled();
  });

  it('opens the crop editor for a Poster with an invalid portrait ratio', async () => {
    renderUpload({ height: 1200, width: 1600 });
    const file = new File(['image'], 'landscape.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText('เลือกไฟล์โปสเตอร์'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole('heading', { name: 'ครอปโปสเตอร์' })).toBeTruthy();
    expect(actions.authorize).not.toHaveBeenCalled();
  });

  it('explains an authoritative invalid media rejection', async () => {
    actions.authorize.mockResolvedValue({
      assetId: ASSET_ID,
      expiresAt: '2026-08-25T12:10:00.000Z',
      headers: { 'content-type': 'image/png' },
      status: 'pending_upload',
      uploadUrl: 'https://r2.example.test/presigned',
    });
    actions.finalize.mockResolvedValue({ assetId: ASSET_ID, status: 'uploaded' });
    actions.getStatus.mockResolvedValue({
      assetId: ASSET_ID,
      preview: null,
      rejectionCode: 'invalid_media',
      status: 'rejected',
      warnings: [],
    });
    vi.stubGlobal('XMLHttpRequest', FakeXmlHttpRequest);
    renderUpload();

    fireEvent.change(screen.getByLabelText('เลือกไฟล์โปสเตอร์'), {
      target: { files: [new File(['image'], 'poster.png', { type: 'image/png' })] },
    });
    await waitFor(() => expect(FakeXmlHttpRequest.latest).not.toBeNull());
    FakeXmlHttpRequest.latest?.respond(200);

    expect(await screen.findByText(/ระบบปฏิเสธไฟล์รูปภาพ/)).toBeTruthy();
    expect(actions.attach).toHaveBeenCalledOnce();
  });
});

function renderUpload({
  height = 1600,
  media = [],
  mediaKind = 'poster',
  width = 1200,
}: {
  height?: number;
  media?: Parameters<typeof WorkMediaUpload>[0]['media'];
  mediaKind?: 'gallery' | 'poster';
  width?: number;
} = {}) {
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn().mockResolvedValue({ close: vi.fn(), height, width } as unknown as ImageBitmap),
  );
  function UploadHarness() {
    const [version, setVersion] = useState(1);
    return (
      <WorkMediaUpload
        expectedVersion={version}
        media={media}
        mediaKind={mediaKind}
        onVersion={setVersion}
        publicId={PUBLIC_ID}
      />
    );
  }
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <UploadHarness />
    </NextIntlClientProvider>,
  );
}

function galleryMedia(assetId: string, position: number) {
  return {
    assetId,
    height: 900,
    kind: 'gallery' as const,
    position,
    rejectionCode: null,
    status: 'ready' as const,
    width: 1600,
  };
}

class FakeXmlHttpRequest {
  static latest: FakeXmlHttpRequest | null = null;
  status = 0;
  timeout = 0;
  private readonly listeners = new Map<string, () => void>();
  private progressListener: ((event: ProgressEvent) => void) | null = null;
  readonly upload = {
    addEventListener: (_name: string, listener: (event: ProgressEvent) => void) => {
      this.progressListener = listener;
    },
  };

  constructor() {
    FakeXmlHttpRequest.latest = this;
  }

  open(): void {}
  setRequestHeader(): void {}
  send(): void {}
  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
  progress(loaded: number, total: number): void {
    this.progressListener?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number): void {
    this.status = status;
    this.listeners.get('load')?.();
  }
}
