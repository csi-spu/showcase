import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReviewRevision } from '@/lib/admin-reviews-core';
import { RevisionSnapshot } from './revision-snapshot';

describe('Admin Revision snapshot', () => {
  afterEach(cleanup);

  it('renders immutable content, links, Tags, Video Links, media, and attribution', () => {
    render(<RevisionSnapshot labels={labels()} revision={revision()} />);

    expect(screen.getByText('รายละเอียดฉบับเต็ม')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'เว็บไซต์ผลงาน' }).getAttribute('href')).toBe(
      'https://example.com/work',
    );
    expect(screen.getByText('React')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'YouTube' }).getAttribute('href')).toBe(
      'https://youtube.com/watch?v=example',
    );
    expect(screen.getByText('โปสเตอร์ 1,200×1,800')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'โปสเตอร์' }).getAttribute('src')).toContain(
      'signed-preview',
    );
    expect(screen.getByText('ชื่อผู้ส่ง')).toBeTruthy();
  });

  describe('media retry', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('retries one failed media request and then shows a text fallback', async () => {
      render(<RevisionSnapshot labels={labels()} revision={revision()} />);

      const posterImage = screen.getByRole('img', { name: 'โปสเตอร์' });
      expect(posterImage.getAttribute('src')).not.toContain('retry=1');

      fireEvent.error(posterImage);
      await act(async () => vi.advanceTimersByTimeAsync(500));
      const retriedImage = screen.getByRole('img', { name: 'โปสเตอร์' });
      expect(retriedImage.getAttribute('src')).toContain('retry=1');

      fireEvent.error(retriedImage);
      expect(screen.queryByRole('img', { name: 'โปสเตอร์' })).toBeNull();
      expect(screen.getByText('โปสเตอร์', { selector: 'div' })).toBeTruthy();
    });
  });
});

function labels(): React.ComponentProps<typeof RevisionSnapshot>['labels'] {
  return {
    academicPeriod: 'ปีการศึกษา 2569 ภาค 1',
    attributions: 'การแสดงชื่อ',
    category: 'ประเภท ผลงานรายวิชา',
    categoryValue: 'ผลงานรายวิชา',
    content: 'เนื้อหา Revision',
    gallery: 'แกลเลอรี',
    links: 'ลิงก์',
    media: 'สื่อ',
    poster: 'โปสเตอร์',
    tags: 'แท็ก',
    videos: 'วิดีโอ',
  };
}

function revision(): AdminReviewRevision {
  return {
    authorKind: 'student_submission',
    attributions: [
      {
        affiliation: null,
        attributionName: 'ชื่อผู้ส่ง',
        contributionRole: null,
        hasPhoto: false,
        kind: 'submitter',
        profilePublicId: null,
        studyYear: 2,
      },
    ],
    content: {
      academicPeriod: { semester: '1', year: 2569 },
      category: 'course_work',
      description: 'รายละเอียดฉบับเต็ม',
      links: [{ label: 'เว็บไซต์ผลงาน', url: 'https://example.com/work' }],
      summary: 'สรุปผลงาน',
      tags: [{ displayLabel: 'React', normalizedIdentity: 'react' }],
      title: 'ชื่อผลงาน',
      videoLinks: [
        {
          provider: 'youtube',
          providerVideoId: 'example',
          url: 'https://youtube.com/watch?v=example',
        },
      ],
    },
    media: [
      {
        assetId: '79000000-0000-4000-8000-000000000001',
        dominantColor: '#285078',
        height: 1_800,
        kind: 'poster',
        position: 1,
        preview: {
          expiresAt: '2026-08-25T15:10:00.000Z',
          url: 'https://r2.example.test/signed-preview',
        },
        variants: [{ height: 720, width: 480 }],
        width: 1_200,
      },
    ],
    number: 1,
    publicId: '79000000-0000-4000-8000-000000000002',
    status: 'pending_review',
    submittedAt: '2026-08-25T15:00:00.000Z',
    version: 1,
    withdrawnAt: null,
    workPublicId: '79000000-0000-4000-8000-000000000003',
  };
}
