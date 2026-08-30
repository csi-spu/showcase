import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminDashboard } from './admin-dashboard';

describe('AdminDashboard', () => {
  afterEach(cleanup);

  it('presents task-first destinations without inventing aggregate counts', () => {
    render(
      <AdminDashboard
        labels={{
          accountDescription: 'ค้นหาและจัดการบัญชีนักศึกษา',
          accountTitle: 'บัญชีและสิทธิ์',
          description: 'เลือกงานที่ต้องดำเนินการ',
          eyebrow: 'ภาพรวมงานผู้ดูแล',
          recoveryDescription: 'ตรวจคำขอและสถานะการเผยแพร่',
          recoveryTitle: 'คำขอจัดการผลงาน',
          reviewDescription: 'ตรวจ Revision ที่ส่งเข้ามา',
          reviewTitle: 'ผลงานที่รอตรวจ',
          rosterDescription: 'เพิ่มนักศึกษาและติดตามไฟล์นำเข้า',
          rosterTitle: 'ทะเบียนนักศึกษา',
          title: 'จัดการงานสำคัญจากที่เดียว',
        }}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'จัดการงานสำคัญจากที่เดียว' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /ผลงานที่รอตรวจ/ }).getAttribute('href')).toBe(
      '/works?view=reviews',
    );
    expect(screen.getByRole('link', { name: /คำขอจัดการผลงาน/ }).getAttribute('href')).toBe(
      '/works?view=removals',
    );
    expect(screen.getByRole('link', { name: /ทะเบียนนักศึกษา/ }).getAttribute('href')).toBe(
      '/roster',
    );
    expect(screen.queryByTestId('admin-dashboard-count')).toBeNull();
  });
});
