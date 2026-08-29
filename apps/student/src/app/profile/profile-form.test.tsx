import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import { ConsentPanel, ProfileForm } from './profile-form';
import type { ProfileActionState } from './profile-action-state';

const action = vi.fn(async (): Promise<ProfileActionState> => ({ error: null, success: true }));
const person = { entryYear: 2569, firstName: 'ณัฐดนัย', lastName: 'สุขใจ' };

describe('Student Public Profile UI', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders bounded Thai fields and up to five labeled HTTPS links', async () => {
    renderProfile(<ProfileForm {...baseProps()} />);

    expect(screen.getByLabelText('ชื่อจริง')).toHaveProperty('readOnly', true);
    expect(screen.getByLabelText('นามสกุล')).toHaveProperty('readOnly', true);
    expect(screen.getByLabelText('แนะนำตัว').getAttribute('maxlength')).toBe('500');
    expect(screen.getAllByRole('textbox', { name: /ชื่อของลิงก์/ })).toHaveLength(5);
    expect(screen.getAllByRole('textbox', { name: /URL ของลิงก์/ })).toHaveLength(5);
    expect(
      (screen.getByRole('button', { name: 'บันทึกโปรไฟล์' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('keeps Alumnus content read-only while consent management remains available', () => {
    const profile = {
      bio: null,
      consent: null,
      links: [],
      photo: null,
      photoId: null,
      publicId: '71000000-0000-4000-8000-000000000001',
      version: 1,
    };
    renderProfile(
      <>
        <ProfileForm {...baseProps()} canEditProfile={false} profile={profile} />
        <ConsentPanel
          grantAction={action}
          idempotencyKey="71000000-0000-4000-8000-000000000003"
          profile={profile}
          withdrawAction={action}
        />
      </>,
    );

    expect((screen.getByLabelText('ชื่อจริง') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'บันทึกโปรไฟล์' })).toBeNull();
    expect(
      (screen.getByRole('checkbox', { name: 'ยินยอมให้เผยแพร่โปรไฟล์' }) as HTMLInputElement)
        .disabled,
    ).toBe(false);
  });

  it('updates Profile Consent from a compact checkbox', async () => {
    const grantAction = vi.fn(async (): Promise<ProfileActionState> => ({
      error: null,
      success: true,
    }));
    const profile = {
      bio: null,
      consent: null,
      links: [],
      photo: null,
      photoId: null,
      publicId: '71000000-0000-4000-8000-000000000001',
      version: 1,
    };
    renderProfile(
      <ConsentPanel
        grantAction={grantAction}
        idempotencyKey="71000000-0000-4000-8000-000000000003"
        profile={profile}
        withdrawAction={action}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox', { name: 'ยินยอมให้เผยแพร่โปรไฟล์' }));

    await waitFor(() => {
      expect(grantAction).toHaveBeenCalledTimes(1);
    });
  });

  it('withdraws existing Profile Consent by clearing the checkbox', async () => {
    const withdrawAction = vi.fn(async (): Promise<ProfileActionState> => ({
      error: null,
      success: true,
    }));
    const profile = {
      bio: null,
      consent: {
        consentTextVersion: 'phase-1-v1',
        grantedAt: '2026-08-29T04:00:00.000Z',
      },
      links: [],
      photo: null,
      photoId: null,
      publicId: '71000000-0000-4000-8000-000000000001',
      version: 2,
    };
    renderProfile(
      <ConsentPanel
        grantAction={action}
        idempotencyKey="71000000-0000-4000-8000-000000000004"
        profile={profile}
        withdrawAction={withdrawAction}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'ยินยอมให้เผยแพร่โปรไฟล์' });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await userEvent.click(checkbox);

    await waitFor(() => {
      expect(withdrawAction).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps Profile Consent disabled until a private profile exists', () => {
    renderProfile(
      <ConsentPanel
        grantAction={action}
        idempotencyKey="71000000-0000-4000-8000-000000000005"
        profile={null}
        withdrawAction={action}
      />,
    );

    expect(
      (screen.getByRole('checkbox', { name: 'ยินยอมให้เผยแพร่โปรไฟล์' }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText('บันทึกข้อมูลโปรไฟล์ก่อนเปิดเผย')).toBeTruthy();
  });

  it('rejects an oversized photo in the browser before requesting a presign', async () => {
    const createPhotoUpload = vi.fn();
    renderProfile(<ProfileForm {...baseProps()} createPhotoUpload={createPhotoUpload} />);
    const input = screen.getByLabelText('รูปโปรไฟล์');
    await userEvent.upload(
      input,
      new File([new Uint8Array(2_097_153)], 'profile.png', { type: 'image/png' }),
    );

    expect(createPhotoUpload).not.toHaveBeenCalled();
    expect(screen.getByText(/ไฟล์รูปโปรไฟล์ไม่ถูกต้อง/).textContent).toContain(
      'ไฟล์รูปโปรไฟล์ไม่ถูกต้อง',
    );
  });

  it('allows an existing optional photo to be removed before saving', async () => {
    const profile = {
      bio: null,
      consent: null,
      links: [],
      photo: {
        height: 512,
        url: 'https://media.example.test/profile.webp',
        width: 512,
      },
      photoId: '71000000-0000-4000-8000-000000000004',
      publicId: '71000000-0000-4000-8000-000000000001',
      version: 1,
    };
    const { container } = renderProfile(<ProfileForm {...baseProps()} profile={profile} />);

    expect((container.querySelector('input[name="photoId"]') as HTMLInputElement).value).toBe(
      profile.photoId,
    );
    await userEvent.click(screen.getByRole('button', { name: 'นำรูปออก' }));
    expect((container.querySelector('input[name="photoId"]') as HTMLInputElement).value).toBe('');
  });

  it('preserves a draft when a persisted Public Profile rerenders without a Base UI warning', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const rendered = renderProfile(<ProfileForm {...baseProps()} />);
    const profile = {
      bio: 'ผู้พัฒนาซอฟต์แวร์',
      consent: null,
      links: [{ label: 'เว็บไซต์', url: 'https://example.test' }],
      photo: null,
      photoId: null,
      publicId: '71000000-0000-4000-8000-000000000001',
      version: 1,
    };

    await userEvent.type(screen.getByLabelText('แนะนำตัว'), 'ร่างที่ยังไม่บันทึก');

    rendered.rerender(
      <NextIntlClientProvider locale="th" messages={messages}>
        <ProfileForm {...baseProps()} profile={profile} />
      </NextIntlClientProvider>,
    );

    expect((screen.getByLabelText('ชื่อจริง') as HTMLInputElement).value).toBe(person.firstName);
    expect((screen.getByLabelText('นามสกุล') as HTMLInputElement).value).toBe(person.lastName);
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('changing the default value state of an uncontrolled FieldControl'),
    );
  });
});

function baseProps() {
  return {
    canEditProfile: true,
    createPhotoUpload: vi.fn(),
    finalizePhotoUpload: vi.fn(),
    idempotencyKey: '71000000-0000-4000-8000-000000000002',
    person,
    profile: null,
    updateAction: action,
  };
}

function renderProfile(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}
