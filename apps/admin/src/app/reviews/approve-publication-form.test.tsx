import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/th.json';
import { ApprovePublicationForm, type ApprovePublicationAction } from './approve-publication-form';

describe('Admin approve-and-publish UI', () => {
  afterEach(cleanup);

  it('keeps approval separate from Change Request and submits only concurrency fields', async () => {
    const action = vi.fn<ApprovePublicationAction>().mockResolvedValue({
      error: null,
      idempotencyKey: '85000000-0000-4000-8000-000000000002',
      publication: {
        publishedAt: '2026-08-25T18:00:00.000Z',
        workPublicId: '85000000-0000-4000-8000-000000000003',
      },
    });
    renderForm(action);
    await userEvent.setup().click(screen.getByRole('button', { name: 'อนุมัติและเผยแพร่' }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? [])).toEqual({
      expectedRevisionVersion: '3',
      idempotencyKey: '85000000-0000-4000-8000-000000000001',
    });
    expect(await screen.findByText('เผยแพร่ผลงานแล้ว')).toBeTruthy();
    expect(screen.getByText('/works/85000000-0000-4000-8000-000000000003')).toBeTruthy();
  });

  it('moves focus to a stale conflict for a safe reload', async () => {
    const action = vi.fn<ApprovePublicationAction>().mockResolvedValue({
      error: 'stale',
      idempotencyKey: '85000000-0000-4000-8000-000000000001',
      publication: null,
    });
    renderForm(action);
    await userEvent.setup().click(screen.getByRole('button', { name: 'อนุมัติและเผยแพร่' }));
    const alert = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });
});

function renderForm(action: ApprovePublicationAction) {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <ApprovePublicationForm
        action={action}
        expectedRevisionVersion={3}
        idempotencyKey="85000000-0000-4000-8000-000000000001"
      />
    </NextIntlClientProvider>,
  );
}
