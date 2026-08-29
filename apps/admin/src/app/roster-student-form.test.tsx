import { NextIntlClientProvider } from 'next-intl';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import { RosterStudentForm } from './roster-student-form';
import type { RosterStudentAction } from './roster-student-state';

describe('RosterStudentForm', () => {
  afterEach(cleanup);

  it('submits only Student ID and Roster Name fields', async () => {
    const action = vi.fn<RosterStudentAction>().mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="th" messages={messages}>
        <RosterStudentForm action={action} />
      </NextIntlClientProvider>,
    );

    await user.type(screen.getByLabelText('รหัสนักศึกษา'), '69000001');
    await user.type(screen.getByLabelText('ชื่อจริง'), 'สมชาย');
    await user.type(screen.getByLabelText('นามสกุล'), 'ใจดี');
    await user.click(screen.getByRole('button', { name: 'เพิ่มนักศึกษา' }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    const submitted = Object.fromEntries(action.mock.calls[0]?.[1]?.entries() ?? []);
    expect(submitted).toEqual({
      firstNameTh: 'สมชาย',
      lastNameTh: 'ใจดี',
      studentId: '69000001',
    });
    expect(screen.queryByLabelText('ปีแรกเข้า')).toBeNull();
  });
});
