import type { PropsWithChildren } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstructorCollectionForm } from '@/lib/instructor-collection-forms-contract';

const services = vi.hoisted(() => ({
  getGroup: vi.fn(),
  list: vi.fn(),
  previewReopen: vi.fn(),
}));
const shareDialog = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ notFound: vi.fn(), redirect: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock('@/lib/instructor-auth-page-state', () => ({
  getInstructorAuthPageState: vi.fn(async () => ({ kind: 'active' })),
}));
vi.mock('@/lib/instructor-auth-session', () => ({
  readInstructorSessionToken: vi.fn(async () => 'session-token'),
}));
vi.mock('@/lib/instructor-collection-groups-core', () => ({
  InstructorCollectionGroupsCoreClient: class {
    getGroup = services.getGroup;
  },
}));
vi.mock('@/lib/instructor-collection-forms-core', () => ({
  InstructorCollectionFormsCoreClient: class {
    list = services.list;
    previewReopen = services.previewReopen;
  },
}));
vi.mock('@/lib/server-environment', () => ({
  getInstructorServerEnvironment: vi.fn(() => ({
    studentCollectionUrl: 'https://collect.example.test',
  })),
}));
vi.mock('@/app/app-shell', () => ({
  AppShell: ({ children }: PropsWithChildren) => <>{children}</>,
}));
vi.mock('@/app/collection-forms.actions', () => ({
  closeCollectionFormAction: vi.fn(),
  openCollectionFormAction: vi.fn(),
  reopenCollectionFormAction: vi.fn(),
  saveCollectionFormAsTemplateAction: vi.fn(),
  updateCollectionFormAction: vi.fn(),
  updateCollectionFormMetadataAction: vi.fn(),
}));
vi.mock('../form-builder', () => ({ FormBuilder: () => null }));
vi.mock('./share-form-dialog', () => ({
  ShareFormDialog: (props: { downloadHref: string; link: string; qrCodeSvg: string }) => {
    shareDialog(props);
    return <button type="button">share</button>;
  },
}));

import FormPage from './page';

const GROUP_ID = '0b1f5a9e-6c1d-4f7a-8e2b-3c4d5e6f7a8b';
const FORM_ID = '8d7f4c1e-2b6a-4f3d-9e5c-1a2b3c4d5e6f';

function form(status: InstructorCollectionForm['status']): InstructorCollectionForm {
  return {
    createdFromTemplateId: null,
    deadlineAt: null,
    description: '',
    fields: [],
    groupId: GROUP_ID,
    id: FORM_ID,
    status,
    title: 'เอกสารฝึกงาน',
    version: 1,
  };
}

async function renderPage(status: InstructorCollectionForm['status']): Promise<void> {
  services.list.mockResolvedValue([form(status)]);
  render(await FormPage({ params: Promise.resolve({ formId: FORM_ID, groupId: GROUP_ID }) }));
}

describe('Form page header', () => {
  beforeEach(() => {
    shareDialog.mockReset();
    services.getGroup.mockResolvedValue({ group: { name: 'CS67-1', roundId: 'round-1' } });
    services.previewReopen.mockResolvedValue({ newlyAssignedCount: 0 });
  });

  afterEach(() => cleanup());

  it('offers no Student link on a draft form', async () => {
    await renderPage('draft');

    expect(screen.queryByRole('button', { name: 'share' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'review.openAction' })).toBeNull();
  });

  it.each(['open', 'closed'] as const)(
    'shares the Student link beside the queue on a %s form',
    async (status) => {
      await renderPage(status);

      expect(screen.getByRole('button', { name: 'share' })).toBeDefined();
      expect(screen.getByRole('link', { name: 'review.openAction' })).toBeDefined();
      expect(shareDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          downloadHref: `/groups/${GROUP_ID}/forms/${FORM_ID}/qr-code`,
          link: `https://collect.example.test/forms/${FORM_ID}`,
          qrCodeSvg: expect.stringMatching(/^<svg/u),
        }),
      );
    },
  );
});
