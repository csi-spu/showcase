import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import { StudentAuthJourney } from './student-auth-journey';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function renderJourney() {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <StudentAuthJourney coreUrl="https://core.example.test" />
    </NextIntlClientProvider>,
  );
}

describe('StudentAuthJourney', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('supports login and forced password change without putting Student ID in a URL', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED' } }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          canUseStudentCapabilities: false,
          csrfToken: 'csrf-token-1',
          sessionState: 'password_change_required',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          canUseStudentCapabilities: true,
          csrfToken: 'csrf-token-2',
          sessionState: 'active',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderJourney();

    fireEvent.change(await screen.findByLabelText('รหัสนักศึกษา'), {
      target: { value: '69000001' },
    });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), {
      target: { value: '69000001' },
    });
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    expect(
      await screen.findByRole('heading', { name: 'เปลี่ยนรหัสผ่านก่อนใช้งาน' }),
    ).not.toBeNull();
    const loginRequest = fetchMock.mock.calls[1];
    expect(loginRequest?.[0]).toBe('https://core.example.test/v1/student/auth/login');
    expect(loginRequest?.[0]).not.toContain('69000001');
    expect(loginRequest?.[1]).toMatchObject({
      body: JSON.stringify({ password: '69000001', studentId: '69000001' }),
      credentials: 'include',
      method: 'POST',
    });

    fireEvent.change(screen.getByLabelText('รหัสผ่านปัจจุบัน'), {
      target: { value: '69000001' },
    });
    fireEvent.change(screen.getByLabelText('รหัสผ่านใหม่'), {
      target: { value: 'correct horse battery staple' },
    });
    fireEvent.change(screen.getByLabelText('ยืนยันรหัสผ่านใหม่'), {
      target: { value: 'correct horse battery staple' },
    });
    await user.click(screen.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }));

    expect(await screen.findByRole('heading', { name: 'บัญชีพร้อมใช้งาน' })).not.toBeNull();
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      credentials: 'include',
      headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token-1' }),
    });
  });

  it('shows an expired-session journey and returns to login', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'SESSION_EXPIRED' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderJourney();

    expect(await screen.findByRole('heading', { name: 'เซสชันหมดอายุ' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบอีกครั้ง' }));
    expect(screen.getByRole('heading', { name: 'เข้าสู่ระบบนักศึกษา' })).not.toBeNull();
  });

  it('shows one generic login error for invalid credentials', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHENTICATED' } }))
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS' } }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderJourney();

    fireEvent.change(await screen.findByLabelText('รหัสนักศึกษา'), {
      target: { value: '69000001' },
    });
    fireEvent.change(screen.getByLabelText('รหัสผ่าน'), {
      target: { value: 'wrong-password' },
    });
    await user.click(screen.getByRole('button', { name: 'เข้าสู่ระบบ' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'รหัสนักศึกษาหรือรหัสผ่านไม่ถูกต้อง',
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('logs out an active session with the current CSRF token', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          canUseStudentCapabilities: true,
          csrfToken: 'active-csrf-token',
          sessionState: 'active',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    renderJourney();

    await user.click(await screen.findByRole('button', { name: 'ออกจากระบบ' }));
    expect(await screen.findByRole('heading', { name: 'เข้าสู่ระบบนักศึกษา' })).not.toBeNull();
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      credentials: 'include',
      headers: { 'x-csrf-token': 'active-csrf-token' },
      method: 'POST',
    });
  });
});
