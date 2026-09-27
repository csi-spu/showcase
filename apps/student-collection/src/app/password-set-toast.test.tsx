import { cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';

const dependencies = vi.hoisted(() => ({
  search: '',
  toastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(dependencies.search),
}));
vi.mock('@showcase/ui/toast', () => ({ toast: { success: dependencies.toastSuccess } }));

import { PasswordSetToast } from './password-set-toast';

function renderAt(url: string) {
  window.history.replaceState(null, '', url);
  dependencies.search = window.location.search;
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <PasswordSetToast />
    </NextIntlClientProvider>,
  );
}

describe('PasswordSetToast', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('confirms the new password once and drops the flag from the URL', () => {
    const { rerender } = renderAt('/forms/form-1?passwordSet=1');

    expect(dependencies.toastSuccess).toHaveBeenCalledTimes(1);
    expect(dependencies.toastSuccess).toHaveBeenCalledWith('ตั้งรหัสผ่านสำเร็จ', {
      id: 'password-set',
    });
    expect(`${window.location.pathname}${window.location.search}`).toBe('/forms/form-1');

    // The router's view of the URL follows the replaced entry, as on a reload.
    dependencies.search = window.location.search;
    rerender(
      <NextIntlClientProvider locale="th" messages={messages}>
        <PasswordSetToast />
      </NextIntlClientProvider>,
    );
    expect(dependencies.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('keeps any other query on the destination', () => {
    renderAt('/?passwordSet=1&tab=history');

    expect(`${window.location.pathname}${window.location.search}`).toBe('/?tab=history');
  });

  it('stays silent without the flag', () => {
    renderAt('/forms/form-1');

    expect(dependencies.toastSuccess).not.toHaveBeenCalled();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/forms/form-1');
  });
});
