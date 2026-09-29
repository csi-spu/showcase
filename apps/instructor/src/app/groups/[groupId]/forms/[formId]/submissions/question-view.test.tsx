import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFieldAnswersAction } from '@/app/collection-forms.actions';
import type {
  InstructorCollectionField,
  InstructorStudentAnswer,
} from '@/lib/instructor-collection-forms-contract';
import { groupByOption, QuestionView } from './question-view';

/* Keys are shown without their namespace, as each component asks for them. */
vi.mock('next-intl', () => ({
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString().slice(0, 10),
    number: (value: number) => String(value),
  }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/app/collection-forms.actions', () => ({ readFieldAnswersAction: vi.fn() }));

const GROUP_ID = '20000000-0000-4000-8000-000000000001';
const FORM_ID = '30000000-0000-4000-8000-000000000001';

const FIELDS: InstructorCollectionField[] = [
  {
    description: '',
    id: 'colour',
    label: 'สีที่ชอบ',
    options: ['แดง', 'เขียว'],
    required: true,
    type: 'single_choice',
  },
  { description: '', id: 'essay', label: 'เรียงความ', required: false, type: 'long_text' },
];

function answer(index: number, value: InstructorStudentAnswer['value']): InstructorStudentAnswer {
  return {
    files: [],
    rosterName: { firstNameTh: `ชื่อ${index}`, lastNameTh: 'สกุล' },
    studentAccountId: `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    studentId: String(66000000 + index),
    value,
  };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true });
});

afterEach(() => {
  cleanup();
  vi.mocked(readFieldAnswersAction).mockReset();
  push.mockReset();
});

describe('groupByOption', () => {
  it('keeps option runs together and gathers values no longer offered', () => {
    const groups = groupByOption(
      [answer(1, 'แดง'), answer(2, 'แดง'), answer(3, 'เขียว'), answer(4, 'ม่วง')],
      ['แดง', 'เขียว'],
    );

    expect(groups.map((group) => [group.option, group.items.length])).toEqual([
      ['แดง', 2],
      ['เขียว', 1],
      [expect.any(Symbol), 1],
    ]);
  });
});

describe('QuestionView', () => {
  it('steps between questions and names each Student with a link to their page', async () => {
    const user = userEvent.setup();
    render(
      <QuestionView
        fieldId="colour"
        fields={FIELDS}
        formId={FORM_ID}
        groupId={GROUP_ID}
        option={null}
        result={{
          ok: true,
          page: { items: [answer(1, 'แดง')], kind: 'students', nextCursor: null },
        }}
      />,
    );

    expect(screen.getByText('question.position 1 2')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'question.previous' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'question.next' }).getAttribute('href')).toBe(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions?view=question&field=essay`,
    );
    expect(
      screen.getByRole('link', { name: 'question.openStudent ชื่อ1 สกุล' }).getAttribute('href'),
    ).toBe(`/groups/${GROUP_ID}/forms/${FORM_ID}/students/40000000-0000-4000-8000-000000000001`);

    await user.selectOptions(screen.getByLabelText('question.selectLabel'), 'essay');
    expect(push).toHaveBeenCalledWith(
      `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions?view=question&field=essay`,
    );
  });

  it('highlights the option opened from Summary and brings it into view', () => {
    render(
      <QuestionView
        fieldId="colour"
        fields={FIELDS}
        formId={FORM_ID}
        groupId={GROUP_ID}
        option="เขียว"
        result={{
          ok: true,
          page: {
            items: [answer(1, 'แดง'), answer(2, 'เขียว')],
            kind: 'students',
            nextCursor: null,
          },
        }}
      />,
    );

    const highlighted = document.querySelector('[data-highlighted="true"]');
    expect(highlighted?.textContent).toContain('เขียว');
    expect(highlighted?.textContent).toContain('ชื่อ2 สกุล');
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
    });
  });

  it('keeps loaded answers when a page fails and loads it again on retry', async () => {
    const user = userEvent.setup();
    vi.mocked(readFieldAnswersAction)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({
        ok: true,
        page: { items: [answer(2, 'ข้อความที่สอง')], kind: 'students', nextCursor: null },
      });
    render(
      <QuestionView
        fieldId="essay"
        fields={FIELDS}
        formId={FORM_ID}
        groupId={GROUP_ID}
        option={null}
        result={{
          ok: true,
          page: { items: [answer(1, 'ข้อความแรก')], kind: 'students', nextCursor: 'cursor-1' },
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'showMore' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('loadMoreFailed')).toBeTruthy();
    expect(screen.getByText('ข้อความแรก')).toBeTruthy();

    await user.click(within(alert).getByRole('button', { name: /retry/u }));
    expect(await screen.findByText('ข้อความที่สอง')).toBeTruthy();
    expect(screen.getByText('ข้อความแรก')).toBeTruthy();
    expect(vi.mocked(readFieldAnswersAction).mock.calls).toEqual([
      [FORM_ID, 'essay', 'question', 'cursor-1'],
      [FORM_ID, 'essay', 'question', 'cursor-1'],
    ]);
  });

  it('says the answers could not be read instead of showing an empty question', () => {
    render(
      <QuestionView
        fieldId="essay"
        fields={FIELDS}
        formId={FORM_ID}
        groupId={GROUP_ID}
        option={null}
        result={{ ok: false }}
      />,
    );

    expect(screen.getByText('loadFailed')).toBeTruthy();
    expect(screen.queryByText('question.empty')).toBeNull();
  });
});
