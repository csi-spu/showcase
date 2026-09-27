import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) =>
    `${namespace}.${key}${values === undefined ? '' : `:${JSON.stringify(values)}`}`,
}));
vi.mock('@showcase/ui/toast', () => ({ toast }));

import { ShareFormDialog } from './share-form-dialog';

const LINK = 'https://collect.example.test/forms/8d7f4c1e-2b6a-4f3d-9e5c-1a2b3c4d5e6f';

function renderDialog() {
  render(
    <ShareFormDialog
      downloadHref="/groups/group-1/forms/form-1/qr-code"
      formTitle="เอกสารฝึกงาน"
      link={LINK}
      qrCodeSvg='<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    />,
  );
}

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

describe('ShareFormDialog', () => {
  beforeEach(() => {
    toast.error.mockReset();
    toast.success.mockReset();
  });

  afterEach(() => {
    cleanup();
    stubClipboard(undefined);
  });

  it('stays closed until the Instructor asks to share', () => {
    renderDialog();

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the Student link, the QR code, and its download', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Forms.share.action' }));

    const input = screen.getByLabelText('Forms.share.linkLabel') as HTMLInputElement;
    expect(input.value).toBe(LINK);
    expect(input.readOnly).toBe(true);
    expect(
      screen.getByRole('img', { name: 'Forms.share.qrCodeAlt:{"title":"เอกสารฝึกงาน"}' }),
    ).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Forms.share.downloadQrCode' }).getAttribute('href'),
    ).toBe('/groups/group-1/forms/form-1/qr-code');
  });

  it('confirms a successful copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Forms.share.action' }));
    stubClipboard(writeText);

    await user.click(screen.getByRole('button', { name: 'Forms.share.copy' }));

    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(toast.success).toHaveBeenCalledWith('Forms.share.copied');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('asks for a manual copy when the clipboard refuses', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Forms.share.action' }));
    stubClipboard(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });

    await user.click(screen.getByRole('button', { name: 'Forms.share.copy' }));

    expect(toast.error).toHaveBeenCalledWith('Forms.share.copyFailed');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('asks for a manual copy when the clipboard is unavailable', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: 'Forms.share.action' }));
    stubClipboard(undefined);

    await user.click(screen.getByRole('button', { name: 'Forms.share.copy' }));

    expect(toast.error).toHaveBeenCalledWith('Forms.share.copyFailed');
  });
});
