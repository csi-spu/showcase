import { NextIntlClientProvider } from 'next-intl';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/th.json';
import { SubmissionConfirmation } from './submission-confirmation';

const motionPreference = vi.hoisted(() => ({ isReduced: false }));

vi.mock('motion/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('motion/react')>()),
  useReducedMotion: () => motionPreference.isReduced,
}));

/* The entrance motion needs a layout engine jsdom does not have. */
vi.mock('@/components/ui/blur-fade', () => ({
  BlurFade: ({ children }: { children: ReactNode }) => children,
}));

const SUBMITTED_AT = '2026-09-28T03:15:00.000Z';

function renderConfirmation() {
  return render(
    <NextIntlClientProvider locale="th" messages={messages}>
      <SubmissionConfirmation statusLabel="รอผู้สอนตรวจ" submittedAt={SUBMITTED_AT}>
        <p>submitted answers</p>
      </SubmissionConfirmation>
    </NextIntlClientProvider>,
  );
}

describe('SubmissionConfirmation', () => {
  afterEach(() => {
    cleanup();
    motionPreference.isReduced = false;
  });

  it('states the result with Core time in Asia/Bangkok and focuses its heading', async () => {
    renderConfirmation();

    const heading = screen.getByRole('heading', { name: 'ส่งคำตอบเรียบร้อยแล้ว' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.getByText('สถานะ: รอผู้สอนตรวจ')).toBeTruthy();
    const time = new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(SUBMITTED_AT));
    expect(screen.getByText(`ส่งเมื่อ ${time}`)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'กลับหน้าหลัก' }).getAttribute('href')).toBe('/');
  });

  it('reveals the submitted answers from a button that reports its expanded state', () => {
    renderConfirmation();

    const reveal = screen.getByRole('button', { name: 'ดูคำตอบที่ส่ง' });
    expect(reveal.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('submitted answers')).toBeNull();

    fireEvent.click(reveal);

    expect(reveal.getAttribute('aria-expanded')).toBe('true');
    const answers = screen.getByText('submitted answers').parentElement;
    expect(answers?.id).toBe(reveal.getAttribute('aria-controls'));
    expect(answers?.hidden).toBe(false);
  });

  it('draws the check mark with motion by default', () => {
    const { container } = renderConfirmation();

    expect(container.querySelector('svg path')?.getAttribute('stroke-dasharray')).not.toBeNull();
  });

  it('shows a still check mark under reduced motion', () => {
    motionPreference.isReduced = true;
    const { container } = renderConfirmation();

    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('stroke-dasharray')).toBeNull();
    expect(path?.getAttribute('style')).toBeNull();
  });
});
