import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DonutChart } from './donut-chart';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(cleanup);

function renderChart() {
  render(
    <DonutChart
      centerLabel="คน"
      segments={[
        { label: 'ส่งครบแล้ว', tone: 'success', value: 7 },
        { label: 'ยังไม่ส่งเลย', tone: 'muted', value: 21 },
      ]}
      title="สัดส่วนการส่งเอกสาร"
      total={28}
    />,
  );
  return screen.getByRole('figure', { name: 'สัดส่วนการส่งเอกสาร' });
}

describe('DonutChart', () => {
  it('keeps a pressed segment in the middle until it is pressed again', async () => {
    const user = userEvent.setup();
    const figure = renderChart();
    const segment = within(figure).getByRole('button', { name: /ยังไม่ส่งเลย/u });

    await user.click(segment);
    await user.unhover(segment);
    expect(segment.getAttribute('aria-pressed')).toBe('true');
    expect(within(figure).getAllByText('75%')).toHaveLength(2);

    await user.click(segment);
    await user.unhover(segment);
    expect(segment.getAttribute('aria-pressed')).toBe('false');
    expect(within(figure).getByText('คน')).toBeDefined();
  });

  it('makes a segment with a destination a link instead of a toggle', () => {
    render(
      <DonutChart
        centerLabel="คน"
        segments={[
          { href: '/list?status=passed', label: 'ผ่านแล้ว', tone: 'success', value: 3 },
          { label: 'ยังไม่ส่ง', tone: 'muted', value: 1 },
        ]}
        title="สถานะ"
        total={4}
      />,
    );
    const figure = screen.getByRole('figure', { name: 'สถานะ' });

    expect(
      within(figure)
        .getByRole('link', { name: /ผ่านแล้ว/u })
        .getAttribute('href'),
    ).toBe('/list?status=passed');
    expect(within(figure).getByRole('button', { name: /ยังไม่ส่ง/u })).toBeDefined();
  });
});
