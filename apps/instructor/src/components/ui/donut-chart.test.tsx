import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { DonutChart } from './donut-chart';

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
});
