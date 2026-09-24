import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { AuthAction } from './student-collection-auth-action-state';
import { LoginForm } from './student-collection-auth-forms';

describe('Student collection authentication form', () => {
  afterEach(() => cleanup());

  it('keeps the password value while toggling its visibility', async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="th" messages={messages}>
        <LoginForm action={vi.fn<AuthAction>()} />
      </NextIntlClientProvider>,
    );

    const password = screen.getByLabelText('รหัสผ่าน') as HTMLInputElement;
    await user.type(password, 'student-password');
    await user.click(screen.getByRole('button', { name: 'แสดงรหัสผ่าน' }));

    expect(password.type).toBe('text');
    expect(password.value).toBe('student-password');
    expect(screen.getByRole('button', { name: 'ซ่อนรหัสผ่าน' })).toBeDefined();
  });
});
