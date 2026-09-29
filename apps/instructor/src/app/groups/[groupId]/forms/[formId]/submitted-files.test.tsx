import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstructorCollectionFile } from '@/lib/instructor-collection-forms-contract';
import { SubmittedFiles } from './submitted-files';

vi.mock('next-intl', () => ({
  useFormatter: () => ({ number: (value: number) => String(value) }),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values === undefined ? key : `${key} ${Object.values(values).map(String).join(' ')}`,
}));

function file(overrides: Partial<InstructorCollectionFile>): InstructorCollectionFile {
  return {
    byteSize: 2_048,
    createdAt: '2026-09-01T02:00:00.000Z',
    fieldId: 'poster',
    id: '60000000-0000-4000-8000-000000000001',
    inspectionErrorCode: null,
    isPreviewable: true,
    originalFilename: 'poster.png',
    status: 'ready',
    ...overrides,
  };
}

afterEach(cleanup);

describe('SubmittedFiles', () => {
  it('shows a ready image as a thumbnail from the preview route', () => {
    render(<SubmittedFiles files={[file({})]} />);

    const trigger = screen.getByRole('button', {
      name: 'responses.files.openPreview poster.png',
    });
    const src = trigger.querySelector('img')?.getAttribute('src') ?? '';
    expect(new URL(src, 'http://localhost').pathname).toBe(
      '/files/60000000-0000-4000-8000-000000000001/preview',
    );
    expect(
      screen.getByText('PNG · responses.files.kilobytes 2 · responses.files.status.ready'),
    ).toBeTruthy();
  });

  it('falls back to the download link when the preview cannot be loaded', () => {
    render(<SubmittedFiles files={[file({})]} />);
    const image = screen
      .getByRole('button', { name: 'responses.files.openPreview poster.png' })
      .querySelector('img');

    fireEvent.error(image!);

    expect(screen.queryByRole('button', { name: /openPreview/u })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('responses.files.previewFailed');
    expect(
      screen.getByRole('link', { name: 'review.downloadLabel poster.png' }).getAttribute('href'),
    ).toBe('/files/60000000-0000-4000-8000-000000000001/download');
  });

  it('offers no preview for other types, and no download before inspection passes', () => {
    render(
      <SubmittedFiles
        files={[
          file({ isPreviewable: false, originalFilename: 'report.pdf' }),
          file({
            byteSize: 3 * 1_024 * 1_024,
            id: '60000000-0000-4000-8000-000000000002',
            isPreviewable: false,
            originalFilename: 'scan.png',
            status: 'inspecting',
          }),
        ]}
      />,
    );

    expect(screen.queryByRole('button', { name: /openPreview/u })).toBeNull();
    expect(screen.getByRole('link', { name: 'review.downloadLabel report.pdf' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'review.downloadLabel scan.png' })).toBeNull();
    expect(screen.getByText('review.fileNotReady')).toBeTruthy();
    expect(
      screen.getByText('PNG · responses.files.megabytes 3 · responses.files.status.inspecting'),
    ).toBeTruthy();
  });

  it('says there is no answer when nothing was uploaded', () => {
    render(<SubmittedFiles files={[]} />);

    expect(screen.getByText('review.noAnswer')).toBeTruthy();
  });
});
