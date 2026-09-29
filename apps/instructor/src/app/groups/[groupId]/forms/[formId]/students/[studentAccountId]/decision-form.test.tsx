import { toast } from '@showcase/ui/toast';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_FORM_ACTION_STATE,
  type CollectionFormActionState,
} from '@/app/collection-forms-state';
import { DecisionForm } from './decision-form';
import { NEXT_STUDENT_LINK_ID } from './student-navigator';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock('@showcase/ui/toast', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const SUBMISSION_ID = '50000000-0000-4000-8000-000000000001';

function renderForm(result: CollectionFormActionState) {
  const checkAction = vi.fn().mockResolvedValue(result);
  render(
    <>
      <DecisionForm checkAction={checkAction} submissionId={SUBMISSION_ID} />
      <a href="/next" id={NEXT_STUDENT_LINK_ID}>
        next
      </a>
    </>,
  );
  return checkAction;
}

function sentFields(checkAction: ReturnType<typeof vi.fn>): Record<string, FormDataEntryValue> {
  const formData = checkAction.mock.calls[0]?.[1] as FormData;
  return Object.fromEntries(formData.entries());
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DecisionForm', () => {
  it('passes the version it was rendered for, then refreshes and moves focus to the next Student', async () => {
    const user = userEvent.setup();
    const checkAction = renderForm({ ...INITIAL_FORM_ACTION_STATE, submitted: true });

    await user.click(screen.getByRole('button', { name: 'review.confirm' }));
    expect(await screen.findByRole('button', { name: 'responses.individual.saved' })).toBeTruthy();

    expect(sentFields(checkAction)).toEqual({
      decision: 'passed',
      reason: '',
      submissionId: SUBMISSION_ID,
    });
    expect(toast.success).toHaveBeenCalledWith('review.saved');
    expect(refresh).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).toBe(NEXT_STUDENT_LINK_ID);
  });

  it('asks for a reason only when requesting changes, and sends it', async () => {
    const user = userEvent.setup();
    const checkAction = renderForm({ ...INITIAL_FORM_ACTION_STATE, submitted: true });
    expect(screen.queryByLabelText('review.reasonLabel')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'review.requestChanges' }));
    const reason = screen.getByLabelText('review.reasonLabel') as HTMLTextAreaElement;
    expect(reason.required).toBe(true);
    expect(reason.closest('[class*="motion-reduce:animate-none"]')).not.toBeNull();

    await user.type(reason, 'เพิ่มบทสรุป');
    await user.click(screen.getByRole('button', { name: 'review.confirm' }));
    await waitFor(() => expect(checkAction).toHaveBeenCalledOnce());

    expect(sentFields(checkAction)).toMatchObject({
      decision: 'changes_required',
      reason: 'เพิ่มบทสรุป',
    });
  });

  it('reloads onto the current version when the decision was stale', async () => {
    const user = userEvent.setup();
    renderForm({ ...INITIAL_FORM_ACTION_STATE, error: 'submissionStale', submitted: true });

    await user.click(screen.getByRole('button', { name: 'review.confirm' }));
    expect(await screen.findByText('submissionStale')).toBeTruthy();

    expect(toast.error).toHaveBeenCalledWith('submissionStale');
    expect(refresh).toHaveBeenCalledOnce();
    expect(document.activeElement?.id).not.toBe(NEXT_STUDENT_LINK_ID);
  });

  it('keeps the page as it is on any other failure', async () => {
    const user = userEvent.setup();
    renderForm({ ...INITIAL_FORM_ACTION_STATE, error: 'unavailable', submitted: true });

    await user.click(screen.getByRole('button', { name: 'review.confirm' }));
    expect(await screen.findByText('unavailable')).toBeTruthy();

    expect(toast.error).toHaveBeenCalledWith('unavailable');
    expect(refresh).not.toHaveBeenCalled();
  });
});
