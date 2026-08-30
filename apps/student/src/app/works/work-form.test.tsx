import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';

const mocks = vi.hoisted(() => ({
  onReplace: undefined as ((href: string) => void) | undefined,
  saveDraft: vi.fn(),
  status: vi.fn(),
  replace: vi.fn(),
  submit: vi.fn(),
  suggest: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: (href: string, options?: unknown) => {
      mocks.replace(href, options);
      mocks.onReplace?.(href);
    },
  }),
}));
vi.mock('./work.actions', () => ({
  getWorkMediaStatusAction: mocks.status,
  saveWorkDraftAction: mocks.saveDraft,
  submitLatestWorkAction: mocks.submit,
  suggestWorkTagsAction: mocks.suggest,
}));
vi.mock('./work-contributor-editor', () => ({
  WorkContributorEditor: () => <div>contributor-editor</div>,
}));
vi.mock('./work-media-upload', () => ({
  WorkMediaUpload: ({ mediaKind }: { mediaKind: 'gallery' | 'poster' }) => (
    <div>
      media-upload
      <input aria-label={`media-client-state-${mediaKind}`} />
    </div>
  ),
}));
import { WorkForm } from './work-form';

describe('five-step Work authoring', () => {
  beforeEach(() => {
    mocks.onReplace = undefined;
    mocks.saveDraft.mockResolvedValue(savedWorkResult());
    mocks.status.mockResolvedValue({
      assetId: '64000000-0000-4000-8000-000000000008',
      preview: {
        expiresAt: '2026-08-29T00:05:00.000Z',
        height: 1800,
        url: 'https://media.example.test/preview.webp',
        width: 1200,
      },
      rejectionCode: null,
      status: 'ready',
      warnings: [],
    });
    window.history.replaceState(null, '', '/works/new');
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('shows exactly five approved steps and does not create a Work by opening the page', async () => {
    vi.useFakeTimers();
    renderForm();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getAllByText('1 ข้อมูลผลงาน')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /1 ข้อมูลผลงาน/ })).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('creates an incomplete private Draft only after the Student presses Next', async () => {
    vi.useFakeTimers();
    mocks.saveDraft.mockResolvedValue({
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
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(mocks.saveDraft).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());
    expect(screen.getAllByText('media-upload')).toHaveLength(2);
    expect(mocks.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: null,
        patch: { title: 'ผลงานใหม่' },
        publicId: null,
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      '/works/64000000-0000-4000-8000-000000000001?step=2',
      { scroll: false },
    );
  });

  it('keeps the next step mounted after the first Draft save resolves', async () => {
    let resolveSave!: (value: ReturnType<typeof savedWorkResult>) => void;
    mocks.saveDraft.mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    const replaceState = window.history.replaceState.bind(window.history);
    vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
      replaceState(data, unused, url);
      mocks.onReplace?.(String(url));
    });
    renderRemountingRoute();
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานใหม่' } });

    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

    const savingButton = await screen.findByRole('button', { name: 'กำลังบันทึก…' });
    expect((savingButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByLabelText('ชื่อผลงาน')).toBeTruthy();
    expect(screen.queryByText('media-upload')).toBeNull();
    await act(async () => resolveSave(savedWorkResult()));

    expect(screen.getAllByText('media-upload')).toHaveLength(2);
  });

  it('stays on the current step when saving on Next fails', async () => {
    mocks.saveDraft.mockResolvedValue({ error: 'unavailable', outcome: 'error' });
    renderForm();
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานใหม่' } });

    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(await screen.findByText('เชื่อมต่อระบบไม่ได้')).toBeTruthy();
    expect(screen.getByLabelText('ชื่อผลงาน')).toBeTruthy();
    expect(screen.queryByText('media-upload')).toBeNull();
  });

  it('keeps a version conflict actionable after more local edits', async () => {
    mocks.saveDraft.mockResolvedValue({ error: 'conflict', outcome: 'error' });
    renderForm(savedWorkResult().work);
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'แก้ไขครั้งแรก' } });
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(await screen.findByText('พบการแก้ไขจากอีกหน้าหรืออุปกรณ์')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'แก้ไขอีกครั้ง' } });
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

    expect(screen.getByText('พบการแก้ไขจากอีกหน้าหรืออุปกรณ์')).toBeTruthy();
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('retries an ambiguous save only after another Next press with the same payload and key', async () => {
    vi.useFakeTimers();
    mocks.saveDraft
      .mockResolvedValueOnce({ error: 'unavailable', outcome: 'error' })
      .mockResolvedValueOnce(savedWorkResult());
    renderForm();

    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานใหม่' } });
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());

    expect(mocks.saveDraft).toHaveBeenCalledTimes(2);
    expect(mocks.saveDraft.mock.calls[1]?.[0]).toEqual(mocks.saveDraft.mock.calls[0]?.[0]);
  });

  it('keeps newer values unsaved until Next is pressed after an ambiguous save is confirmed', async () => {
    mocks.saveDraft
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
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());
    fireEvent.change(screen.getByLabelText('ชื่อผลงาน'), { target: { value: 'ผลงานล่าสุด' } });
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());

    expect(mocks.saveDraft.mock.calls[1]?.[0]).toEqual(mocks.saveDraft.mock.calls[0]?.[0]);
    expect(mocks.saveDraft).toHaveBeenCalledTimes(2);
    expect(mocks.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());
    expect(mocks.saveDraft.mock.calls[2]?.[0]).toMatchObject({
      expectedVersion: 1,
      patch: { title: 'ผลงานล่าสุด' },
      publicId: '64000000-0000-4000-8000-000000000001',
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      '/works/64000000-0000-4000-8000-000000000001?step=2',
      { scroll: false },
    );
  });

  it('keeps Contributor assignment inside the attribution step', async () => {
    renderForm(savedWorkResult().work);
    await advanceSteps(2);
    expect(screen.getByText('contributor-editor')).toBeTruthy();
  });

  it('preserves local values without saving when the Student presses Previous', async () => {
    renderForm(savedWorkResult().work);
    await advanceSteps(2);
    fireEvent.change(screen.getByLabelText('ชั้นปีเมื่อทำผลงาน'), { target: { value: '2' } });

    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));

    expect(mocks.saveDraft).not.toHaveBeenCalled();
    expect(screen.getAllByText('media-upload')).toHaveLength(2);
  });

  it('preserves client-side media state after advancing and returning to the media step', async () => {
    renderForm(savedWorkResult().work);
    await advanceSteps(1);
    const posterState = screen.getByLabelText('media-client-state-poster');
    fireEvent.change(posterState, { target: { value: 'uploaded-preview' } });

    await advanceSteps(1);
    fireEvent.click(screen.getByRole('button', { name: 'ย้อนกลับ' }));

    expect((screen.getByLabelText('media-client-state-poster') as HTMLInputElement).value).toBe(
      'uploaded-preview',
    );
  });

  it('maps invalid optional discovery data back to step four and reviews every field group', async () => {
    renderForm(savedWorkResult().work);
    await advanceSteps(3);
    fireEvent.change(screen.getByLabelText('GitHub'), {
      target: { value: 'https://example.com/not-github' },
    });
    await advanceSteps(1);

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
      'แท็ก',
      'ลิงก์วิดีโอ YouTube หรือ TikTok แยกบรรทัด',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('offers historical Academic Years before Entry Year but never a future year', () => {
    renderForm();

    expect(screen.getByRole('option', { name: '2565' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '2570' })).toBeNull();
  });

  it('uses prototype-like field proportions and groups classification controls', () => {
    renderForm();

    expect(screen.getByLabelText('สรุปผลงาน').getAttribute('rows')).toBe('3');
    expect(screen.getByLabelText('รายละเอียดผลงาน').getAttribute('rows')).toBe('6');
    const classification = screen.getByRole('group', {
      name: 'ประเภทและช่วงเวลาของผลงาน',
    });
    expect(within(classification).getByLabelText('ประเภทผลงาน')).toBeTruthy();
    expect(within(classification).getByLabelText('ปีการศึกษา')).toBeTruthy();
    expect(within(classification).getByLabelText('ภาคการศึกษา')).toBeTruthy();
  });

  it('keeps Poster and Gallery controls on equal-width stretched cards', async () => {
    renderForm(savedWorkResult().work);
    await advanceSteps(1);

    const mediaLayout = document.querySelector('[data-slot="work-media-layout"]');
    expect(mediaLayout).not.toBeNull();
    expect((mediaLayout as HTMLElement).className).toContain('lg:grid-cols-2');
    expect((mediaLayout as HTMLElement).className).toContain('items-stretch');
  });

  it('renders the ready Poster and grouped preview cards before submission', async () => {
    renderForm(completeWork());
    await advanceSteps(4);

    expect(screen.getByText('ตัวอย่างสื่อก่อนส่งตรวจ')).toBeTruthy();
    expect(await screen.findByAltText('ตัวอย่างโปสเตอร์ที่ผ่านการประมวลผล')).toBeTruthy();
    expect(screen.getByText('การแสดงชื่อและผู้ร่วมผลงาน')).toBeTruthy();
    expect(screen.getByText('การค้นพบและลิงก์')).toBeTruthy();
  });

  it('reuses the final submission idempotency key after an unavailable result', async () => {
    mocks.submit.mockResolvedValueOnce({ error: 'unavailable' }).mockResolvedValueOnce({
      outcome: 'submitted',
      revisionPublicId: '64000000-0000-4000-8000-000000000009',
    });
    renderForm(completeWork());
    await advanceSteps(4);
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

function renderRemountingRoute() {
  function RouteHarness() {
    const [route, setRoute] = useState({ initialStep: 0, key: 'new' });
    useEffect(() => {
      mocks.onReplace = (href) => {
        const target = new URL(href, window.location.origin);
        setRoute({
          initialStep: target.searchParams.get('step') === '2' ? 1 : 0,
          key: 'saved',
        });
      };
      return () => {
        mocks.onReplace = undefined;
      };
    }, []);
    return (
      <WorkForm
        context={{ currentAcademicYear: 2569, entryYear: 2566 }}
        initialStep={route.initialStep}
        initialWork={route.key === 'new' ? null : savedWorkResult().work}
        key={route.key}
      />
    );
  }

  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <RouteHarness />
    </NextIntlClientProvider>,
  );
}

async function advanceSteps(count: number) {
  for (let current = 0; current < count; current += 1) {
    fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
    await act(async () => Promise.resolve());
  }
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
