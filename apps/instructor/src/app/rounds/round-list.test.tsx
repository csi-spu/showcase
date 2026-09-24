import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { RoundList } from './round-list';

const labels = {
  active: 'เปิดอยู่',
  all: 'ทั้งหมด',
  closed: 'ปิดแล้ว',
  description: 'จัดการชุดงานและกลุ่มที่ใช้เก็บเอกสาร',
  filter: 'กรองชุดงานตามสถานะ',
  title: 'ชุดงานของคุณ',
};

const rounds = [
  {
    createdAtLabel: 'สร้างเมื่อ 24 ก.ย. 2569',
    id: 'round-active-1',
    name: 'ชุดงานฝึกงาน',
    status: 'active' as const,
  },
  {
    createdAtLabel: 'สร้างเมื่อ 24 ก.ย. 2569',
    id: 'round-active-2',
    name: 'ชุดงานกิจกรรม',
    status: 'active' as const,
  },
  {
    createdAtLabel: 'สร้างเมื่อ 21 ก.ย. 2569',
    id: 'round-closed',
    name: 'ชุดงานที่สิ้นสุดแล้ว',
    status: 'closed' as const,
  },
];

describe('RoundList', () => {
  afterEach(cleanup);

  it('filters collection sets by status with accessible pressed controls', async () => {
    const user = userEvent.setup();
    render(<RoundList labels={labels} rounds={rounds} />);

    const allFilter = screen.getByRole('button', { name: 'ทั้งหมด 3' });
    const activeFilter = screen.getByRole('button', { name: 'เปิดอยู่ 2' });
    const closedFilter = screen.getByRole('button', { name: 'ปิดแล้ว 1' });

    expect(allFilter.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(3);

    await user.click(closedFilter);

    expect(closedFilter.getAttribute('aria-pressed')).toBe('true');
    expect(allFilter.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('ชุดงานที่สิ้นสุดแล้ว')).toBeDefined();
    expect(screen.queryByText('ชุดงานฝึกงาน')).toBeNull();

    await user.click(activeFilter);

    expect(activeFilter.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByText('ชุดงานที่สิ้นสุดแล้ว')).toBeNull();
  });
});
