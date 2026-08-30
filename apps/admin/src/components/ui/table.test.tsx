import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

describe('Admin operational table', () => {
  afterEach(cleanup);

  it('keeps column relationships semantic inside a responsive scroll region', () => {
    render(
      <Table aria-label="คิวจัดการผลงาน">
        <TableHeader>
          <TableRow>
            <TableHead>ผลงาน</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead className="text-right">ดำเนินการ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>ผลงานตัวอย่าง</TableCell>
            <TableCell>รอตรวจ</TableCell>
            <TableCell className="text-right">เปิดตรวจ</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = screen.getByRole('table', { name: 'คิวจัดการผลงาน' });
    expect(table.parentElement?.className).toContain('overflow-x-auto');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });
});
