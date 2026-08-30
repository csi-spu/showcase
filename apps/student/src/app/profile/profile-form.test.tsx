import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import {
  ConsentPanel,
  ProfileForm,
  ProfileOverviewEditLink,
  ProfilePhotoButton,
} from './profile-form';
import type { ProfileActionState } from './profile-action-state';

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => navigation }));

const action = vi.fn(async (): Promise<ProfileActionState> => ({ error: null, success: true }));

describe('Student Public Profile UI', () => {
  afterEach(() => {
    cleanup();
    navigation.refresh.mockReset();
    vi.restoreAllMocks();
  });

  it('shows profile details without fields until an editable item is selected', () => {
    renderProfile(<ProfileForm {...baseProps()} />);

    expect(screen.queryByText('ข้อมูลโปรไฟล์')).toBeNull();
    expect(screen.queryByText('ณัฐดนัย สุขใจ')).toBeNull();
    expect(screen.queryByText('ชื่อจากทะเบียน')).toBeNull();
    expect(screen.queryByText('รูปโปรไฟล์')).toBeNull();
    expect(screen.queryByLabelText('ชื่อจริง')).toBeNull();
    expect(screen.queryByLabelText('นามสกุล')).toBeNull();
    expect(screen.queryByLabelText('แนะนำตัว')).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Portfolio' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'LinkedIn' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'แก้ไขรูปโปรไฟล์' })).toBeNull();
    expect(screen.getByRole('button', { name: 'แก้ไขคำแนะนำตัว' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'แก้ไข Portfolio' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'แก้ไข LinkedIn' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'แก้ไขชื่อจากทะเบียน' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'บันทึกโปรไฟล์' })).toBeNull();
  });

  it('opens the photo picker from the large profile photo', async () => {
    const handlePhotoInputClick = vi.fn();
    renderProfile(
      <>
        <ProfilePhotoButton
          canEditProfile
          hasPhoto={false}
          photoAlt="รูปโปรไฟล์ของ ณัฐดนัย สุขใจ"
          photoVersion={0}
        />
        <input id="profile-photo" onClick={handlePhotoInputClick} type="file" />
      </>,
    );

    const photoButton = screen.getByRole('button', { name: 'แก้ไขรูปโปรไฟล์' });
    expect(photoButton.className).not.toContain('overflow-hidden');
    expect(photoButton.querySelector('.overflow-hidden')).toBeTruthy();

    await userEvent.click(photoButton);

    expect(handlePhotoInputClick).toHaveBeenCalledOnce();
  });

  it('keeps the large profile photo non-interactive without edit permission', () => {
    renderProfile(
      <ProfilePhotoButton
        canEditProfile={false}
        hasPhoto={false}
        photoAlt="รูปโปรไฟล์ของศิษย์เก่า"
        photoVersion={0}
      />,
    );

    expect(screen.queryByRole('button', { name: 'แก้ไขรูปโปรไฟล์' })).toBeNull();
  });

  it('adds and removes custom links progressively', async () => {
    renderProfile(<ProfileForm {...baseProps()} />);

    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มลิงก์' }));

    expect(screen.getByRole('textbox', { name: 'ชื่อของลิงก์ 3' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'URL ของลิงก์ 3' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'ลบลิงก์ 3' }));

    expect(screen.queryByRole('textbox', { name: 'ชื่อของลิงก์ 3' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'URL ของลิงก์ 3' })).toBeNull();
  });

  it('opens only the selected inline editor from its pencil button', async () => {
    renderProfile(<ProfileForm {...baseProps()} />);

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขคำแนะนำตัว' }));

    expect(screen.getByLabelText('แนะนำตัว').getAttribute('maxlength')).toBe('500');
    expect(screen.getByRole('button', { name: 'บันทึกโปรไฟล์' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไข Portfolio' }));

    expect(screen.queryByLabelText('แนะนำตัว')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'URL ของลิงก์ 1' })).toBeTruthy();
  });

  it('opens the bio editor from the large profile heading', async () => {
    renderProfile(
      <>
        <ProfileOverviewEditLink label="แก้ไขโปรไฟล์">ชื่อโปรไฟล์</ProfileOverviewEditLink>
        <ProfileForm {...baseProps()} />
      </>,
    );

    await userEvent.click(screen.getByRole('link', { name: 'แก้ไขโปรไฟล์' }));

    expect(screen.getByLabelText('แนะนำตัว')).toBeTruthy();
  });

  it('keeps the total number of external links bounded at five', async () => {
    renderProfile(<ProfileForm {...baseProps()} />);

    const addButton = screen.getByRole('button', { name: 'เพิ่มลิงก์' });
    await userEvent.click(addButton);
    await userEvent.click(addButton);
    await userEvent.click(addButton);

    expect(
      screen.getAllByRole('button', { name: /แก้ไข (Portfolio|LinkedIn|ลิงก์ใหม่)/ }),
    ).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'เพิ่มลิงก์' })).toBeNull();
  });

  it('submits a preset label only after its URL is filled', async () => {
    const updateAction = vi.fn(
      async (_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> => {
        expect(formData.get('linkLabel0')).toBe('Portfolio');
        expect(formData.get('linkUrl0')).toBe('https://portfolio.example.test');
        expect(formData.get('linkLabel1')).toBe('');
        expect(formData.get('linkUrl1')).toBe('');
        return { error: null, success: true };
      },
    );
    renderProfile(<ProfileForm {...baseProps()} updateAction={updateAction} />);

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไข Portfolio' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'URL ของลิงก์ 1' }),
      'https://portfolio.example.test',
    );
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกโปรไฟล์' }));

    await waitFor(() => expect(updateAction).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'URL ของลิงก์ 1' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'บันทึกโปรไฟล์' })).toBeNull();
    });
  });

  it('keeps Portfolio before LinkedIn when a saved profile has only LinkedIn', () => {
    const profile = {
      bio: null,
      consent: null,
      links: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/example' }],
      photo: null,
      photoId: null,
      publicId: '71000000-0000-4000-8000-000000000001',
      version: 1,
    };
    renderProfile(<ProfileForm {...baseProps()} profile={profile} />);

    const portfolio = screen.getByRole('button', { name: 'แก้ไข Portfolio' });
    const linkedin = screen.getByRole('button', { name: 'แก้ไข LinkedIn' });

    expect(portfolio.compareDocumentPosition(linkedin) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(4);
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

    expect(screen.getByText('ยังไม่ได้เพิ่มคำแนะนำตัว')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'แก้ไขรูปโปรไฟล์' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'แก้ไขคำแนะนำตัว' })).toBeNull();
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
    renderProfile(
      <>
        <ProfilePhotoButton
          canEditProfile
          hasPhoto={false}
          photoAlt="รูปโปรไฟล์ของ ณัฐดนัย สุขใจ"
          photoVersion={0}
        />
        <ProfileForm {...baseProps()} createPhotoUpload={createPhotoUpload} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขรูปโปรไฟล์' }));
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

  it('finalizes and saves a selected profile photo immediately', async () => {
    const updateAction = vi.fn(async (): Promise<ProfileActionState> => ({
      error: null,
      success: true,
    }));
    const createPhotoUpload = vi.fn().mockResolvedValue({
      data: {
        headers: { 'content-type': 'image/png' },
        uploadId: '71000000-0000-4000-8000-000000000004',
        uploadUrl: 'https://upload.example.test/profile',
      },
    });
    const finalizePhotoUpload = vi.fn().mockResolvedValue({
      data: {
        photoId: '71000000-0000-4000-8000-000000000004',
        status: 'ready',
        version: 1,
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    const { container } = renderProfile(
      <>
        <ProfilePhotoButton
          canEditProfile
          hasPhoto={false}
          photoAlt="รูปโปรไฟล์ของ ณัฐดนัย สุขใจ"
          photoVersion={0}
        />
        <ProfileForm
          {...baseProps()}
          createPhotoUpload={createPhotoUpload}
          finalizePhotoUpload={finalizePhotoUpload}
          updateAction={updateAction}
        />
      </>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขรูปโปรไฟล์' }));
    await userEvent.upload(
      screen.getByLabelText('รูปโปรไฟล์'),
      new File([new Uint8Array(1_024)], 'profile.png', { type: 'image/png' }),
    );

    await waitFor(() => {
      expect(finalizePhotoUpload).toHaveBeenCalledWith({
        expectedVersion: 0,
        idempotencyKey: '71000000-0000-4000-8000-000000000006',
        uploadId: '71000000-0000-4000-8000-000000000004',
      });
    });
    expect(updateAction).not.toHaveBeenCalled();
    expect(screen.getByText('บันทึกรูปโปรไฟล์แล้ว')).toBeTruthy();
    expect(
      (container.querySelector('input[name="expectedVersion"]') as HTMLInputElement).value,
    ).toBe('1');
    expect((container.querySelector('input[name="photoId"]') as HTMLInputElement).value).toBe(
      '71000000-0000-4000-8000-000000000004',
    );
    expect(screen.queryByRole('button', { name: 'บันทึกโปรไฟล์' })).toBeNull();
    expect(navigation.refresh).toHaveBeenCalledOnce();
  });

  it('changes the private photo URL when the profile version changes', () => {
    renderProfile(
      <ProfilePhotoButton
        canEditProfile
        hasPhoto
        photoAlt="รูปโปรไฟล์ของ ณัฐดนัย สุขใจ"
        photoVersion={4}
      />,
    );

    expect(screen.getByRole('img').getAttribute('src')).toBe('/profile/photo?v=4');
  });

  it('keeps existing photo state outside the bio-only editor', () => {
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
    expect(screen.queryByRole('button', { name: 'นำรูปออก' })).toBeNull();
    expect(screen.queryByText('รูปพร้อมบันทึก')).toBeNull();
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

    await userEvent.click(screen.getByRole('button', { name: 'แก้ไขคำแนะนำตัว' }));
    await userEvent.type(screen.getByLabelText('แนะนำตัว'), 'ร่างที่ยังไม่บันทึก');

    rendered.rerender(
      <NextIntlClientProvider locale="th" messages={messages}>
        <ProfileForm {...baseProps()} profile={profile} />
      </NextIntlClientProvider>,
    );

    expect((screen.getByLabelText('แนะนำตัว') as HTMLTextAreaElement).value).toBe(
      'ร่างที่ยังไม่บันทึก',
    );
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
    photoIdempotencyKey: '71000000-0000-4000-8000-000000000006',
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
