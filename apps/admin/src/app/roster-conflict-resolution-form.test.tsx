import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import type { RosterConflictAction } from './roster-conflict-state';
import { RosterConflictResolutionForm } from './roster-conflict-resolution-form';

describe('RosterConflictResolutionForm', () => {
  afterEach(cleanup);

  it('submits the stable optimistic fields and audited reason', async () => {
    const action = vi.fn<RosterConflictAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="th" messages={messages}>
        <RosterConflictResolutionForm
          action={action}
          batchId="20000000-0000-4000-8000-000000000001"
          conflictId="30000000-0000-4000-8000-000000000001"
          expectedVersion={1}
          idempotencyKey="40000000-0000-4000-8000-000000000001"
        />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByLabelText('เหตุผลประกอบการตัดสินใจ'), 'ตรวจสอบแล้ว');
    await user.click(screen.getByRole('button', { name: 'ยอมรับชื่อจากไฟล์' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    const formData = action.mock.calls[0]?.[1];
    expect(Object.fromEntries(formData?.entries() ?? [])).toMatchObject({
      batchId: '20000000-0000-4000-8000-000000000001',
      conflictId: '30000000-0000-4000-8000-000000000001',
      expectedVersion: '1',
      idempotencyKey: '40000000-0000-4000-8000-000000000001',
      reason: 'ตรวจสอบแล้ว',
      resolution: 'accept_incoming_name',
    });
  });
});
