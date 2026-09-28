import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import { FormFileField } from './form-file-field';
import type { StudentCollectionField } from '@/lib/student-collection-forms-contract';

const actions = vi.hoisted(() => ({
  attach: vi.fn(),
  create: vi.fn(),
  detach: vi.fn(),
  finalize: vi.fn(),
  retry: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./collection-forms.actions', () => ({
  attachCollectionFileAction: actions.attach,
  createCollectionUploadAction: actions.create,
  detachCollectionFileAction: actions.detach,
  finalizeCollectionUploadAction: actions.finalize,
  retryCollectionUploadAction: actions.retry,
}));

vi.mock('@/lib/upload-file', () => ({ uploadFileBytes: actions.upload }));

const FIELD: StudentCollectionField = {
  description: '',
  file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
  id: 'field-id',
  label: 'Resume',
  required: true,
  type: 'file_upload',
};

describe('FormFileField', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('retries byte transfer with the existing ticket instead of consuming another slot', async () => {
    const user = userEvent.setup();
    actions.create.mockResolvedValue({
      error: null,
      file: {
        byteSize: 3,
        createdAt: '2026-09-25T00:00:00.000Z',
        declaredContentType: 'application/pdf',
        detectedContentType: null,
        fieldId: FIELD.id,
        formId: 'form-id',
        id: 'file-id',
        inspectionErrorCode: null,
        originalFilename: 'resume.pdf',
        status: 'pending_upload',
      },
      uploadUrl: 'https://media.example.test/upload',
    });
    actions.upload.mockResolvedValueOnce('failed').mockResolvedValueOnce('sent');
    actions.retry.mockResolvedValue({
      error: null,
      uploadUrl: 'https://media.example.test/refreshed-upload',
    });
    actions.finalize.mockResolvedValue({ error: null });
    actions.attach.mockResolvedValue({ error: null });

    const { container } = render(
      <NextIntlClientProvider locale="th" messages={messages}>
        <FormFileField
          field={FIELD}
          files={[]}
          formId="form-id"
          isReadOnly={false}
          onBusyChange={vi.fn()}
          onChanged={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('FILE_INPUT_MISSING');
    await user.upload(input, new File(['pdf'], 'resume.pdf', { type: 'application/pdf' }));
    await user.click(await screen.findByRole('button', { name: 'ลองส่งไฟล์อีกครั้ง' }));

    await waitFor(() => expect(actions.attach).toHaveBeenCalledTimes(1));
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.retry).toHaveBeenCalledWith('form-id', 'file-id');
    expect(actions.upload).toHaveBeenCalledTimes(2);
    expect(actions.upload.mock.calls[1]?.[0]).toMatchObject({
      url: 'https://media.example.test/refreshed-upload',
    });
    expect(actions.finalize).toHaveBeenCalledTimes(1);
    expect(actions.attach).toHaveBeenCalledWith('form-id', FIELD.id, 'file-id');
  });
});
