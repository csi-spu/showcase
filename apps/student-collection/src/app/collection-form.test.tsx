import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import { CollectionForm } from './collection-form';
import type { SaveDraftResult, SubmitResult } from './collection-forms.actions';
import type {
  StudentCollectionFile,
  StudentCollectionObligation,
} from '@/lib/student-collection-forms-contract';

const actions = vi.hoisted(() => ({
  attach: vi.fn(),
  create: vi.fn(),
  detach: vi.fn(),
  finalize: vi.fn(),
  refresh: vi.fn(),
  retry: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('./collection-forms.actions', () => ({
  attachCollectionFileAction: actions.attach,
  createCollectionUploadAction: actions.create,
  detachCollectionFileAction: actions.detach,
  finalizeCollectionUploadAction: actions.finalize,
  retryCollectionUploadAction: actions.retry,
  saveCollectionDraftAction: actions.save,
  submitCollectionFormAction: actions.submit,
}));

vi.mock('@/lib/upload-file', () => ({ uploadFileBytes: actions.upload }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: actions.refresh }) }));

/* The entrance motion needs a layout engine jsdom does not have. */
vi.mock('@/components/ui/blur-fade', () => ({
  BlurFade: ({ children }: { children: ReactNode }) => children,
}));

const FORM_ID = '6d2f4a8e-2f0b-4c55-9d7e-3f0c6d6f1a01';
const SUBMISSION_ID = '0b8c7f7e-3b0a-4a4e-8a51-8d6f4b2c9e10';
const SUBMITTED_AT = '2026-09-28T03:15:00.000Z';

const FILE: StudentCollectionFile = {
  byteSize: 3,
  createdAt: '2026-09-28T03:00:00.000Z',
  fieldId: 'resume',
  id: '5f1e2d3c-4b5a-4968-8776-655443322110',
  inspectionErrorCode: null,
  originalFilename: 'resume.pdf',
  status: 'ready',
};

function buildObligation(
  overrides: Partial<StudentCollectionObligation> = {},
  fields: StudentCollectionObligation['form']['fields'] = [
    { description: '', id: 'company', label: 'Company', required: true, type: 'short_text' },
  ],
): StudentCollectionObligation {
  return {
    draft: { answers: {}, files: {}, updatedAt: '2026-09-28T02:00:00.000Z', version: 3 },
    firstSubmittedAt: null,
    form: {
      createdFromTemplateId: null,
      deadlineAt: null,
      description: '',
      fields,
      groupId: '1c9d8e7f-6a5b-4c3d-8e2f-1a0b9c8d7e6f',
      id: FORM_ID,
      status: 'open',
      title: 'Internship',
      version: 1,
    },
    hasDeadlinePassed: false,
    isLate: false,
    isWritable: true,
    latestCheckingReason: null,
    latestSubmission: null,
    rosterName: { firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' },
    status: 'not_submitted',
    ...overrides,
  };
}

/** What Core returns once the submission lands and the page is refreshed. */
function submittedObligation(base: StudentCollectionObligation): StudentCollectionObligation {
  return {
    ...base,
    firstSubmittedAt: SUBMITTED_AT,
    isWritable: false,
    latestSubmission: {
      answers: {},
      fields: base.form.fields,
      files: {},
      formVersion: 1,
      id: SUBMISSION_ID,
      submittedAt: SUBMITTED_AT,
      version: 1,
    },
    status: 'awaiting_checking',
  };
}

function renderForm(obligation: StudentCollectionObligation) {
  const view = render(
    <NextIntlClientProvider locale="th" messages={messages} timeZone="Asia/Bangkok">
      <CollectionForm obligation={obligation} prefills={[]} />
    </NextIntlClientProvider>,
  );
  return {
    ...view,
    rerenderForm(next: StudentCollectionObligation) {
      view.rerender(
        <NextIntlClientProvider locale="th" messages={messages} timeZone="Asia/Bangkok">
          <CollectionForm obligation={next} prefills={[]} />
        </NextIntlClientProvider>,
      );
    },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function saved(version: number): SaveDraftResult {
  return { error: null, fieldId: null, serverAnswers: null, version };
}

const SUBMITTED: SubmitResult = { blockedFieldId: null, error: null, submissionId: SUBMISSION_ID };

function typeAnswer(value: string) {
  fireEvent.change(screen.getByLabelText(/Company/u), { target: { value } });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('CollectionForm submit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('cancels a pending autosave and sends no draft write after the submit', async () => {
    actions.save.mockResolvedValue(saved(4));
    actions.submit.mockResolvedValue(SUBMITTED);
    renderForm(buildObligation());

    typeAnswer('ACME');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));
    await flush();
    await flush();

    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(actions.save).toHaveBeenCalledWith(FORM_ID, 3, { company: 'ACME' });
    expect(actions.submit).toHaveBeenCalledTimes(1);
    expect(actions.submit.mock.calls[0]?.[0]).toBe(FORM_ID);

    /* The cancelled timer never fires, and the answers are held while submitting. */
    expect(screen.getByLabelText(/Company/u).hasAttribute('disabled')).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('บันทึกไม่สำเร็จ')).toBeNull();
    expect(screen.queryByText('ยังส่งไม่ได้ กรุณาตรวจสอบรายการต่อไปนี้')).toBeNull();
    expect(actions.refresh).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight save and submits at the version it returned', async () => {
    const inFlight = deferred<SaveDraftResult>();
    actions.save.mockReturnValueOnce(inFlight.promise).mockResolvedValueOnce(saved(5));
    actions.submit.mockResolvedValue(SUBMITTED);
    renderForm(buildObligation());

    typeAnswer('ACME');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(actions.save).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));
    await flush();
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(actions.submit).not.toHaveBeenCalled();

    await act(async () => {
      inFlight.resolve(saved(4));
      await Promise.resolve();
    });
    await flush();

    expect(actions.save).toHaveBeenCalledTimes(2);
    expect(actions.save).toHaveBeenLastCalledWith(FORM_ID, 4, { company: 'ACME' });
    expect(actions.submit).toHaveBeenCalledTimes(1);
  });

  it('does not submit when the in-flight save fails, and keeps its retry', async () => {
    const inFlight = deferred<SaveDraftResult>();
    actions.save.mockReturnValueOnce(inFlight.promise);
    renderForm(buildObligation());

    typeAnswer('ACME');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));
    await act(async () => {
      inFlight.resolve({ error: 'unavailable', fieldId: null, serverAnswers: null, version: null });
      await Promise.resolve();
    });
    await flush();

    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(actions.submit).not.toHaveBeenCalled();
    expect(screen.getByText('บันทึกไม่สำเร็จ')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ลองบันทึกอีกครั้ง' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ส่งคำตอบ' }).hasAttribute('disabled')).toBe(false);
  });

  it('retries a submit whose response was lost with the same key and without a refused save', async () => {
    actions.save.mockResolvedValue(saved(4));
    actions.submit.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(SUBMITTED);
    renderForm(buildObligation());

    typeAnswer('ACME');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));
    await flush();
    await flush();
    expect(screen.getByRole('button', { name: 'ส่งคำตอบ' }).hasAttribute('disabled')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));
    await flush();
    await flush();

    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(actions.submit).toHaveBeenCalledTimes(2);
    expect(actions.submit.mock.calls[1]?.[1]).toBe(actions.submit.mock.calls[0]?.[1]);
    expect(actions.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps submit disabled until an uploaded required file is in the settled file state', async () => {
    vi.useRealTimers();
    const fields: StudentCollectionObligation['form']['fields'] = [
      {
        description: '',
        file: { allowedFileTypes: ['pdf'], maxFiles: 1 },
        id: 'resume',
        label: 'Resume',
        required: true,
        type: 'file_upload',
      },
    ];
    const created = deferred<{
      error: null;
      file: StudentCollectionFile;
      uploadUrl: string;
    }>();
    actions.create.mockReturnValue(created.promise);
    actions.upload.mockResolvedValue('sent');
    actions.finalize.mockResolvedValue({ error: null });
    actions.attach.mockResolvedValue({ error: null });
    actions.save.mockResolvedValue(saved(4));
    actions.submit.mockResolvedValue(SUBMITTED);
    const obligation = buildObligation({}, fields);
    const { container, rerenderForm } = renderForm(obligation);

    const input = container.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('FILE_INPUT_MISSING');
    fireEvent.change(input, {
      target: { files: [new File(['pdf'], 'resume.pdf', { type: 'application/pdf' })] },
    });

    const submit = () => screen.getByRole('button', { name: /ส่งคำตอบ|รอไฟล์/u });
    await waitFor(() => expect(submit().hasAttribute('disabled')).toBe(true));

    await act(async () => {
      created.resolve({
        error: null,
        file: { ...FILE, status: 'pending_upload' },
        uploadUrl: 'https://media.example.test/upload',
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(actions.attach).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(actions.refresh).toHaveBeenCalledTimes(1));
    /* Attached, but the page has not yet been refreshed with the file. */
    expect(submit().hasAttribute('disabled')).toBe(true);

    rerenderForm(
      buildObligation(
        {
          draft: {
            answers: {},
            files: { resume: [{ ...FILE, status: 'quarantined' }] },
            updatedAt: '2026-09-28T03:01:00.000Z',
            version: 3,
          },
        },
        fields,
      ),
    );
    await waitFor(() => expect(submit().hasAttribute('disabled')).toBe(false));

    fireEvent.click(submit());
    await waitFor(() => expect(actions.submit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('กรุณาแนบไฟล์อย่างน้อย 1 ไฟล์')).toBeNull();
  });
});

describe('CollectionForm confirmation', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('replaces the form with a confirmation once Core has the submission', async () => {
    actions.save.mockResolvedValue(saved(4));
    actions.submit.mockResolvedValue(SUBMITTED);
    const obligation = buildObligation();
    const { rerenderForm } = renderForm(obligation);

    typeAnswer('ACME');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));
    await waitFor(() => expect(actions.refresh).toHaveBeenCalledTimes(1));
    /* Until the refreshed obligation arrives, the submit stays in progress. */
    expect(screen.queryByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' })).toBeNull();

    rerenderForm(submittedObligation(obligation));

    const heading = await screen.findByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText('สถานะ: รอผู้สอนตรวจ')).toBeTruthy();
    const time = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(SUBMITTED_AT));
    expect(screen.getByText(`ส่งเมื่อ ${time}`)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('ส่งคำตอบเรียบร้อยแล้ว รอผู้สอนตรวจ');
    expect(screen.queryByRole('button', { name: 'ส่งคำตอบ' })).toBeNull();
    expect(screen.getByRole('link', { name: 'กลับหน้าหลัก' }).getAttribute('href')).toBe('/');

    const reveal = screen.getByRole('button', { name: 'ดูคำตอบที่ส่ง' });
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText(/Company/u)).toBeNull();
    fireEvent.click(reveal);
    expect(reveal.getAttribute('aria-expanded')).toBe('true');
    const answer = screen.getByLabelText(/Company/u);
    expect((answer as HTMLInputElement).value).toBe('ACME');
    expect(answer.hasAttribute('disabled')).toBe(true);
  });

  it('shows the read-only view without a confirmation on a later visit', () => {
    renderForm(submittedObligation(buildObligation()));

    expect(screen.queryByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' })).toBeNull();
    expect(screen.getByText('ส่งคำตอบแล้ว อยู่ระหว่างรอผู้สอนตรวจ จึงยังแก้ไขไม่ได้')).toBeTruthy();
    expect(screen.getByLabelText(/Company/u).hasAttribute('disabled')).toBe(true);
  });

  it('keeps the form editable with the error when Core refuses the submit', async () => {
    actions.save.mockResolvedValue(saved(4));
    actions.submit.mockResolvedValue({
      blockedFieldId: null,
      error: 'deadlinePassed',
      submissionId: null,
    } satisfies SubmitResult);
    renderForm(buildObligation());

    typeAnswer('ACME');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งคำตอบ' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'ส่งคำตอบ' }).hasAttribute('disabled')).toBe(false),
    );
    expect(actions.refresh).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' })).toBeNull();
    expect(screen.getByText(messages.Forms.errors.deadlinePassed)).toBeTruthy();
  });
});
