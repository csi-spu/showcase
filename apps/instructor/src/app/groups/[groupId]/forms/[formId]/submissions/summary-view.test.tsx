import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  InstructorCollectionField,
  InstructorResponseSummary,
} from '@/lib/instructor-collection-forms-contract';
import { SummaryView } from './summary-view';

/* Keys are shown without their namespace, as each component asks for them. */
vi.mock('next-intl', () => ({
  useFormatter: () => ({
    dateTime: (value: Date) => value.toISOString().slice(0, 10),
    number: (value: number, options?: { style?: string }) =>
      options?.style === 'percent' ? `${Math.round(value * 100)}%` : String(value),
  }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/app/collection-forms.actions', () => ({ readFieldAnswersAction: vi.fn() }));

const GROUP_ID = '20000000-0000-4000-8000-000000000001';
const FORM_ID = '30000000-0000-4000-8000-000000000001';
const BASE = `/groups/${GROUP_ID}/forms/${FORM_ID}/submissions`;

function field(
  id: string,
  type: InstructorCollectionField['type'],
  options?: string[],
): InstructorCollectionField {
  return {
    description: '',
    id,
    label: `คำถาม ${id}`,
    required: false,
    type,
    ...(options === undefined ? {} : { options }),
  };
}

function summary(overrides: Partial<InstructorResponseSummary> = {}): InstructorResponseSummary {
  return {
    fields: [
      {
        answeredCount: 4,
        fieldId: 'colour',
        options: [
          { count: 3, value: 'แดง' },
          { count: 1, value: 'เขียว' },
        ],
        otherCount: 1,
        type: 'multiple_choice',
      },
      {
        answeredCount: 0,
        fieldId: 'age',
        histogram: [],
        stats: null,
        type: 'number',
      },
      /* Answered on a field the form no longer has. */
      { answeredCount: 2, fieldId: 'removed', fileCount: 2, notReadyCount: 0, type: 'file_upload' },
    ],
    form: {
      fields: [field('colour', 'multiple_choice', ['แดง', 'เขียว']), field('age', 'number')],
      id: FORM_ID,
      status: 'open',
      title: 'แบบฟอร์ม',
    },
    totals: { assigned: 6, awaitingChecking: 2, changesRequired: 1, notSubmitted: 2, passed: 1 },
    ...overrides,
  };
}

function renderSummary(value: InstructorResponseSummary = summary()) {
  render(<SummaryView formId={FORM_ID} groupId={GROUP_ID} summary={value} />);
}

afterEach(cleanup);

describe('SummaryView', () => {
  it('counts submitted of assigned and links each status to the filtered Individual list', () => {
    renderSummary();

    expect(screen.getByText('responses.summary.submittedOf 6 4')).toBeTruthy();
    const figure = screen.getByRole('figure', { name: 'responses.summary.totalsTitle' });
    expect(
      within(figure)
        .getByRole('link', { name: /obligationStatus\.not_submitted/u })
        .getAttribute('href'),
    ).toBe(`${BASE}?status=not_submitted`);
  });

  it('draws choice bars in option order, each opening the Question view on its option', () => {
    renderSummary();
    const card = screen.getByRole('region', { name: 'คำถาม colour' });
    const bars = within(card).getAllByRole('link');

    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      'summary.optionBarLabel 3 แดง 75%',
      'summary.optionBarLabel 1 เขียว 25%',
      'summary.optionBarLabel 1 summary.otherOption 25%',
    ]);
    expect(bars[0]?.getAttribute('href')).toBe(
      `${BASE}?view=question&field=colour&option=%E0%B9%81%E0%B8%94%E0%B8%87`,
    );
    /* A changed or removed option has its own bar and no option to highlight. */
    expect(bars[2]?.getAttribute('href')).toBe(`${BASE}?view=question&field=colour`);
    expect(within(card).getByText('responses.summary.multipleAllowed')).toBeTruthy();
    expect(within(card).getByText('responses.summary.answeredBy 4')).toBeTruthy();
  });

  it('animates bars only through a motion attribute the reduced-motion query gates', () => {
    renderSummary();
    const card = screen.getByRole('region', { name: 'คำถาม colour' });

    const drawn = card.querySelectorAll<HTMLElement>('[data-animate="bar-grow-x"]');
    expect(drawn).toHaveLength(3);
    expect(drawn[0]?.style.width).toBe('75%');
    expect(drawn[0]?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('says a question was not answered and hides questions the form no longer has', () => {
    renderSummary();

    const card = screen.getByRole('region', { name: 'คำถาม age' });
    expect(within(card).getByText('responses.summary.noAnswers')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'คำถาม removed' })).toBeNull();
  });

  it('shows an empty state and only the totals before anyone submits', () => {
    renderSummary(
      summary({
        totals: {
          assigned: 3,
          awaitingChecking: 0,
          changesRequired: 0,
          notSubmitted: 3,
          passed: 0,
        },
      }),
    );

    expect(screen.getByText('responses.summary.empty')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'คำถาม colour' })).toBeNull();
  });
});
