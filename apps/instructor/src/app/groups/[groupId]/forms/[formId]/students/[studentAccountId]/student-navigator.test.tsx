import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  NEXT_STUDENT_LINK_ID,
  StudentEntrance,
  StudentNavigator,
  VersionSelect,
  type StudentLink,
} from './student-navigator';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const STUDENTS: StudentLink[] = [
  { href: '/students/a?status=awaiting_checking', id: 'a', name: 'ก สกุล' },
  { href: '/students/b?status=awaiting_checking', id: 'b', name: 'ข สกุล' },
  { href: '/students/c?status=awaiting_checking', id: 'c', name: 'ค สกุล' },
];

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe('StudentNavigator', () => {
  it('shows where the Student sits and links both neighbours', () => {
    render(
      <StudentNavigator
        currentId="b"
        next={STUDENTS[2]!}
        position={2}
        previous={STUDENTS[0]!}
        students={STUDENTS}
        total={STUDENTS.length}
      />,
    );

    expect(screen.getByText('position 2 3')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'previousStudent ก สกุล' }).getAttribute('href')).toBe(
      STUDENTS[0]!.href,
    );
    const next = screen.getByRole('link', { name: 'nextStudent ค สกุล' });
    expect(next.id).toBe(NEXT_STUDENT_LINK_ID);
  });

  it('counts the whole filtered list while the jump list holds one table page', () => {
    render(
      <StudentNavigator
        currentId="b"
        next={STUDENTS[2]!}
        position={12}
        previous={STUDENTS[0]!}
        students={STUDENTS}
        total={40}
      />,
    );

    expect(screen.getByText('position 12 40')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(STUDENTS.length);
  });

  it('disables a step that has nowhere to go and jumps to a chosen Student', async () => {
    const user = userEvent.setup();
    render(
      <StudentNavigator
        currentId="a"
        next={STUDENTS[1]!}
        position={1}
        previous={null}
        students={STUDENTS}
        total={STUDENTS.length}
      />,
    );

    expect(
      (screen.getByRole('button', { name: 'previousStudent' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await user.selectOptions(screen.getByLabelText('studentSelectLabel'), 'c');
    expect(push).toHaveBeenCalledWith(STUDENTS[2]!.href);
  });

  it('says so when a decision moved the Student out of the filter', () => {
    render(
      <StudentNavigator
        currentId="b"
        next={STUDENTS[2]!}
        position={null}
        previous={STUDENTS[0]!}
        students={STUDENTS}
        total={STUDENTS.length}
      />,
    );

    expect(screen.getByText('outsideFilter 3')).toBeTruthy();
  });

  it('enters the next Student from the side that was stepped towards, once', async () => {
    const user = userEvent.setup();
    const preventNavigation = (event: Event) => event.preventDefault();
    document.addEventListener('click', preventNavigation, { capture: true });
    render(
      <StudentNavigator
        currentId="b"
        next={STUDENTS[2]!}
        position={2}
        previous={STUDENTS[0]!}
        students={STUDENTS}
        total={STUDENTS.length}
      />,
    );

    await user.click(screen.getByRole('link', { name: 'nextStudent ค สกุล' }));
    document.removeEventListener('click', preventNavigation, { capture: true });
    const { container, unmount } = render(<StudentEntrance>content</StudentEntrance>);
    expect(container.firstElementChild?.className).toContain('slide-in-from-right-4');
    expect(container.firstElementChild?.className).toContain('motion-reduce:animate-none');
    unmount();

    const again = render(<StudentEntrance>content</StudentEntrance>);
    expect(again.container.firstElementChild?.className).not.toContain('slide-in-from-right-4');
  });
});

describe('VersionSelect', () => {
  it('opens the chosen version without scrolling away', async () => {
    const user = userEvent.setup();
    render(
      <VersionSelect
        current={2}
        versions={[
          { href: '/students/a', label: 'ฉบับที่ 2', version: 2 },
          { href: '/students/a?version=1', label: 'ฉบับที่ 1', version: 1 },
        ]}
      />,
    );

    await user.selectOptions(screen.getByLabelText('versionLabel'), '1');
    expect(push).toHaveBeenCalledWith('/students/a?version=1', { scroll: false });
  });
});
