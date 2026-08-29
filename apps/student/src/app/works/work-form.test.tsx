import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';

const mocks = vi.hoisted(() => ({
  autosave: vi.fn(),
  lookup: vi.fn(),
  replace: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: mocks.replace }),
}));
vi.mock('./work.actions', () => ({
  addAccountContributorAction: vi.fn(),
  addExternalContributorAction: vi.fn(),
  autosaveWorkAction: mocks.autosave,
  lookupContributorAction: mocks.lookup,
  removeContributorAction: vi.fn(),
  submitLatestWorkAction: mocks.submit,
}));
vi.mock('./work-media-upload', () => ({ WorkMediaUpload: () => <div>media-upload</div> }));
import { WorkForm } from './work-form';

describe('five-step Work authoring', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('shows exactly five approved steps and does not create a Work by opening the page', async () => {
    vi.useFakeTimers();
    renderForm();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /1 ข้อมูลผลงาน/ })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.autosave).not.toHaveBeenCalled();
  });

  it('creates an incomplete private Draft after the first meaningful change and one-second debounce', async () => {
    vi.useFakeTimers();
    mocks.autosave.mockResolvedValue({
      outcome: 'saved',
      publicId: '64000000-0000-4000-8000-000000000001',
      savedAt: '2026-08-29T00:00:00.000Z',
      version: 1,
      work: {
        activityState: 'active',
        basePublishedRevisionId: null,
        contributors: [],
        draft: {
          academicPeriod: { semester: null, year: null },
          category: null,
          description: null,
          links: [],
          submitterStudyYear: null,
          summary: null,
          tags: [],
          title: 'ผลงานใหม่',
          videoLinks: [],
        },
        isComplete: false,
        media: [],
        publicationState: 'never_published',
        publishedRevisionId: null,
        publicId: '64000000-0000-4000-8000-000000000001',
        savedAt: '2026-08-29T00:00:00.000Z',
        submitterAttributionName: 'ผู้ส่ง',
        version: 1,
      },
    });
    renderForm();
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: '  ผลงานใหม่  ' } });
    expect(screen.getByText('ยังไม่ได้บันทึกข้อมูลล่าสุด')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(mocks.autosave).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: null,
        patch: { title: 'ผลงานใหม่' },
        publicId: null,
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith('/works/64000000-0000-4000-8000-000000000001', {
      scroll: false,
    });
  });

  it('retries an ambiguous first autosave with the same payload and idempotency key', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mocks.autosave
      .mockResolvedValueOnce({ error: 'unavailable', outcome: 'error' })
      .mockResolvedValueOnce(savedWorkResult());
    renderForm();

    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานใหม่' } });
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(mocks.autosave).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(800));
    await act(() => vi.runOnlyPendingTimersAsync());
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(mocks.autosave).toHaveBeenCalledTimes(2);
    expect(mocks.autosave.mock.calls[1]?.[0]).toEqual(mocks.autosave.mock.calls[0]?.[0]);
  });

  it('queues newer local values until the ambiguous autosave is confirmed', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    mocks.autosave
      .mockResolvedValueOnce({ error: 'unavailable', outcome: 'error' })
      .mockResolvedValueOnce(savedWorkResult())
      .mockResolvedValueOnce({
        ...savedWorkResult(),
        version: 2,
        work: {
          ...savedWorkResult().work,
          draft: { ...savedWorkResult().work.draft, title: 'ผลงานล่าสุด' },
          version: 2,
        },
      });
    renderForm();

    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานใหม่' } });
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานล่าสุด' } });
    await act(() => vi.advanceTimersByTimeAsync(800));
    await act(() => vi.runOnlyPendingTimersAsync());
    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(mocks.autosave.mock.calls[1]?.[0]).toEqual(mocks.autosave.mock.calls[0]?.[0]);
    expect(mocks.autosave.mock.calls[2]?.[0]).toMatchObject({
      expectedVersion: 1,
      patch: { title: 'ผลงานล่าสุด' },
      publicId: '64000000-0000-4000-8000-000000000001',
    });
  });

  it('keeps the Student ID only in lookup input and clears it immediately after lookup', async () => {
    mocks.lookup.mockResolvedValue({ candidate: null });
    renderForm(savedWorkResult().work);
    fireEvent.click(screen.getByRole('button', { name: /3 การแสดงชื่อ/ }));
    const input = screen.getByLabelText('รหัสนักศึกษา 8 หลัก') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12345678' } });
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหาแบบตรงกัน' }));

    await waitFor(() => expect(input.value).toBe(''));
    expect(mocks.lookup).toHaveBeenCalledWith({
      publicId: '64000000-0000-4000-8000-000000000001',
      studentId: '12345678',
    });
  });

  it('maps invalid optional discovery data back to step four and reviews every field group', () => {
    vi.useFakeTimers();
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: /4 การค้นพบ/ }));
    fireEvent.change(screen.getByLabelText('GitHub'), {
      target: { value: 'https://example.com/not-github' },
    });
    fireEvent.click(screen.getByRole('button', { name: /5 ตรวจสอบและส่ง/ }));

    expect(screen.getByRole('button', { name: 'กลับไปแก้ไขขั้นที่ 4' })).toBeTruthy();
    for (const label of [
      'ประเภทผลงาน',
      'ปีการศึกษา',
      'ภาคการศึกษา',
      'โปสเตอร์',
      'ภาพแกลเลอรี',
      'ผู้ส่งผลงาน',
      'ชั้นปีเมื่อทำผลงาน',
      'ผู้ร่วมผลงาน',
      'ลิงก์',
      'แท็ก คั่นด้วยจุลภาค',
      'ลิงก์วิดีโอ YouTube หรือ TikTok แยกบรรทัด',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('reuses the final submission idempotency key after an unavailable result', async () => {
    mocks.submit.mockResolvedValueOnce({ error: 'unavailable' }).mockResolvedValueOnce({
      outcome: 'submitted',
      revisionPublicId: '64000000-0000-4000-8000-000000000009',
    });
    renderForm(completeWork());
    fireEvent.click(screen.getByRole('button', { name: /5 ตรวจสอบและส่ง/ }));
    const submit = screen.getByRole('button', { name: 'บันทึกล่าสุดและส่งตรวจ' });

    fireEvent.click(submit);
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'บันทึกล่าสุดและส่งตรวจ' }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกล่าสุดและส่งตรวจ' }));
    await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(2));

    expect(mocks.submit.mock.calls[1]?.[0].idempotencyKey).toBe(
      mocks.submit.mock.calls[0]?.[0].idempotencyKey,
    );
  });
});

function renderForm(initialWork: Parameters<typeof WorkForm>[0]['initialWork'] = null) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <WorkForm
        context={{ currentAcademicYear: 2569, entryYear: 2566 }}
        initialWork={initialWork}
      />
    </NextIntlClientProvider>,
  );
}

function completeWork(): NonNullable<Parameters<typeof WorkForm>[0]['initialWork']> {
  const base = savedWorkResult().work;
  return {
    ...base,
    draft: {
      ...base.draft,
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดผลงาน',
      submitterStudyYear: 2,
      summary: 'สรุปผลงาน',
    },
    isComplete: true,
    media: [
      {
        assetId: '64000000-0000-4000-8000-000000000008',
        height: 1800,
        kind: 'poster',
        position: 1,
        rejectionCode: null,
        status: 'ready',
        width: 1200,
      },
    ],
  };
}

function savedWorkResult() {
  return {
    outcome: 'saved' as const,
    publicId: '64000000-0000-4000-8000-000000000001',
    savedAt: '2026-08-29T00:00:00.000Z',
    version: 1,
    work: {
      activityState: 'active' as const,
      basePublishedRevisionId: null,
      contributors: [],
      draft: {
        academicPeriod: { semester: null, year: null },
        category: null,
        description: null,
        links: [],
        submitterStudyYear: null,
        summary: null,
        tags: [],
        title: 'ผลงานใหม่',
        videoLinks: [],
      },
      isComplete: false,
      media: [],
      publicationState: 'never_published' as const,
      publishedRevisionId: null,
      publicId: '64000000-0000-4000-8000-000000000001',
      savedAt: '2026-08-29T00:00:00.000Z',
      submitterAttributionName: 'ผู้ส่ง',
      version: 1,
    },
  };
}
