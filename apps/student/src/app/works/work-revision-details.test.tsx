import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkRevision } from '@/lib/student-works-core';
import { WorkRevisionDetails } from './work-revision-details';

describe('WorkRevisionDetails', () => {
  afterEach(cleanup);

  it('presents immutable content, media, attribution, and discovery details in one layout', () => {
    render(
      <WorkRevisionDetails
        action={<button type="button">จัดการฉบับนี้</button>}
        labels={{
          academicPeriod: 'ภาคการศึกษา 1 / 2569',
          academicPeriodLabel: 'ภาคการศึกษา',
          attributions: 'ผู้จัดทำและผู้ร่วมผลงาน',
          category: 'ผลงานรายวิชา',
          categoryLabel: 'ประเภทผลงาน',
          description: 'รายละเอียดผลงาน',
          discovery: 'ลิงก์และวิดีโอ',
          galleryAlt: (index) => `รูปภาพเพิ่มเติม ${index}`,
          information: 'ข้อมูลผลงาน',
          links: 'ลิงก์ที่เกี่ยวข้อง',
          media: 'สื่อประกอบ',
          mediaHelp: 'โปสเตอร์และรูปภาพเพิ่มเติมของฉบับนี้',
          posterAlt: 'โปสเตอร์ผลงาน',
          revision: 'ฉบับที่ 2',
          revisionLabel: 'ฉบับ',
          studyYear: (year) => `ชั้นปีที่ ${year}`,
          submittedAt: 'ส่งเมื่อ 25 ส.ค. 2569 22:00',
          submittedAtLabel: 'วันที่ส่งตรวจ',
          submitter: 'ผู้ส่งผลงาน',
          tags: 'แท็ก',
          videos: 'วิดีโอ',
        }}
        revision={revision()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'รายละเอียดผลงาน' })).toBeTruthy();
    expect(screen.getByText('รายละเอียดระบบจัดแสดงผลงานฉบับเต็ม')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ข้อมูลผลงาน' })).toBeTruthy();
    expect(screen.getByText('ภาคการศึกษา 1 / 2569')).toBeTruthy();
    expect(screen.getByText('ฉบับที่ 2')).toBeTruthy();
    expect(screen.getByText('สมชาย ใจดี')).toBeTruthy();
    expect(screen.getByText('พัฒนา Frontend')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'สมชาย ใจดี' }).getAttribute('src')).toContain(
      '/people/65000000-0000-4000-8000-000000000005/photo',
    );
    expect(screen.getByRole('img', { name: 'โปสเตอร์ผลงาน' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'รูปภาพเพิ่มเติม 1' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'GitHub' }).getAttribute('href')).toBe(
      'https://github.com/csi-spu/showcase',
    );
    expect(screen.getByText('#Next.js')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'จัดการฉบับนี้' })).toBeTruthy();
  });

  it('retries an attribution photo once before preserving the icon fallback', async () => {
    vi.useFakeTimers();
    render(<WorkRevisionDetails labels={labels()} revision={revision()} />);

    const image = screen.getByRole('img', { name: 'สมชาย ใจดี' });
    fireEvent.error(image);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    const retriedImage = screen.getByRole('img', { name: 'สมชาย ใจดี' });
    expect(retriedImage.getAttribute('src')).toContain('retry=1');

    fireEvent.error(retriedImage);
    expect(screen.queryByRole('img', { name: 'สมชาย ใจดี' })).toBeNull();
  });
});

function labels() {
  return {
    academicPeriod: 'ภาคการศึกษา 1 / 2569',
    academicPeriodLabel: 'ภาคการศึกษา',
    attributions: 'ผู้จัดทำและผู้ร่วมผลงาน',
    category: 'ผลงานรายวิชา',
    categoryLabel: 'ประเภทผลงาน',
    description: 'รายละเอียดผลงาน',
    discovery: 'ลิงก์และวิดีโอ',
    galleryAlt: (index: number) => `รูปภาพเพิ่มเติม ${index}`,
    information: 'ข้อมูลผลงาน',
    links: 'ลิงก์ที่เกี่ยวข้อง',
    media: 'สื่อประกอบ',
    mediaHelp: 'โปสเตอร์และรูปภาพเพิ่มเติมของฉบับนี้',
    posterAlt: 'โปสเตอร์ผลงาน',
    revision: 'ฉบับที่ 2',
    revisionLabel: 'ฉบับ',
    studyYear: (year: number) => `ชั้นปีที่ ${year}`,
    submittedAt: 'ส่งเมื่อ 25 ส.ค. 2569 22:00',
    submittedAtLabel: 'วันที่ส่งตรวจ',
    submitter: 'ผู้ส่งผลงาน',
    tags: 'แท็ก',
    videos: 'วิดีโอ',
  };
}

function revision(): WorkRevision {
  return {
    authorKind: 'student_submission',
    attributions: [
      {
        affiliation: 'วิทยาลัยเทคโนโลยี',
        attributionName: 'สมชาย ใจดี',
        contributionRole: 'พัฒนา Frontend',
        hasPhoto: true,
        kind: 'account',
        profilePublicId: '65000000-0000-4000-8000-000000000005',
        studyYear: 3,
      },
    ],
    content: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดระบบจัดแสดงผลงานฉบับเต็ม',
      links: [{ label: 'GitHub', url: 'https://github.com/csi-spu/showcase' }],
      summary: 'ระบบรวมผลงานนักศึกษา',
      tags: [{ displayLabel: 'Next.js', normalizedIdentity: 'next.js' }],
      title: 'Student Showcase',
      videoLinks: [
        {
          provider: 'youtube',
          providerVideoId: 'demo',
          url: 'https://www.youtube.com/watch?v=demo',
        },
      ],
    },
    media: [
      {
        assetId: '65000000-0000-4000-8000-000000000001',
        dominantColor: '#285078',
        height: 1_800,
        kind: 'poster',
        position: 1,
        variants: [{ height: 1_152, width: 768 }],
        width: 1_200,
      },
      {
        assetId: '65000000-0000-4000-8000-000000000002',
        dominantColor: '#805028',
        height: 900,
        kind: 'gallery',
        position: 1,
        variants: [{ height: 576, width: 768 }],
        width: 1_200,
      },
    ],
    number: 2,
    publicId: '65000000-0000-4000-8000-000000000003',
    status: 'approved',
    submittedAt: '2026-08-25T15:00:00.000Z',
    version: 2,
    withdrawnAt: null,
    workPublicId: '65000000-0000-4000-8000-000000000004',
  };
}
