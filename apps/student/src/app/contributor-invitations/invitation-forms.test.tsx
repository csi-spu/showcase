import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import type { AttributionInvitation } from '@/lib/student-works-core';

vi.mock('./contributor-invitations.actions', () => ({
  respondToAccountInvitationAction: vi.fn(),
  respondToExternalInvitationAction: vi.fn(),
}));

import { AccountInvitationResponseForm, ExternalInvitationResponseForm } from './invitation-forms';

describe('Attribution Invitation forms', () => {
  afterEach(cleanup);

  it('requires an Account-backed Person to confirm public name, Study Year, and consent', () => {
    renderForm(<AccountInvitationResponseForm invitation={invitation('account')} />);

    expect(screen.getByLabelText('ชื่อที่ต้องการแสดงต่อสาธารณะ').getAttribute('maxlength')).toBe(
      '100',
    );
    expect(screen.getByLabelText('ชั้นปีเมื่อมีส่วนร่วม (1–8)').getAttribute('max')).toBe('8');
    expect((screen.getByRole('checkbox') as HTMLInputElement).required).toBe(true);
    expect(screen.getByRole('button', { name: 'ยืนยันการแสดงชื่อ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ปฏิเสธ' })).toBeTruthy();
  });

  it('prefills proposed external attribution while requiring explicit consent', () => {
    renderForm(<ExternalInvitationResponseForm invitation={invitation('external')} />);

    expect((screen.getByLabelText('ชื่อที่ต้องการแสดงต่อสาธารณะ') as HTMLInputElement).value).toBe(
      'Alex Example',
    );
    expect((screen.getByLabelText('บทบาทที่มีต่อผลงาน') as HTMLInputElement).value).toBe(
      'ที่ปรึกษา',
    );
    expect((screen.getByRole('checkbox') as HTMLInputElement).required).toBe(true);
  });
});

function renderForm(element: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

function invitation(kind: 'account' | 'external'): AttributionInvitation {
  return {
    affiliation: kind === 'external' ? 'SPU' : null,
    attributionName: null,
    contributionRole: kind === 'external' ? 'ที่ปรึกษา' : null,
    createdAt: '2026-08-25T10:00:00.000Z',
    expiresAt: '2026-09-08T10:00:00.000Z',
    kind,
    proposedAttributionName: kind === 'external' ? 'Alex Example' : null,
    publicId: '67000000-0000-4000-8000-000000000001',
    state: 'pending',
    studyYear: null,
    version: 1,
  };
}
