import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/th.json';

const { exchangeExternalInvitationAction } = vi.hoisted(() => ({
  exchangeExternalInvitationAction: vi.fn(),
}));

vi.mock('../contributor-invitations.actions', () => ({
  exchangeExternalInvitationAction,
}));

import { InvitationExchange } from './invitation-exchange';

describe('InvitationExchange', () => {
  afterEach(() => {
    cleanup();
    exchangeExternalInvitationAction.mockReset();
    window.history.replaceState(null, '', '/');
  });

  it('removes the bearer token from the URL before exchanging it once', async () => {
    const token = 'a'.repeat(43);
    window.history.replaceState(null, '', `/contributor-invitations/external#token=${token}`);

    render(
      <NextIntlClientProvider locale="th" messages={messages}>
        <InvitationExchange />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(exchangeExternalInvitationAction).toHaveBeenCalledWith(token));
    expect(exchangeExternalInvitationAction).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
    expect(screen.getByText('กำลังตรวจสอบลิงก์คำเชิญ…')).toBeTruthy();
  });
});
