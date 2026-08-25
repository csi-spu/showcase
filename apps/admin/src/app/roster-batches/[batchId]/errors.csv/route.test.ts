import { describe, expect, it, vi } from 'vitest';
import { downloadRosterErrorCsv } from './route';

const BATCH_ID = '20000000-0000-4000-8000-000000000001';

describe('GET Roster Batch error CSV', () => {
  it('returns exact private CSV bytes with download and no-store headers', async () => {
    const download = vi
      .fn()
      .mockResolvedValue('\uFEFFrow_number,student_id,error_code,error_message_th\r\n');
    const response = await downloadRosterErrorCsv(
      new Request(`https://admin.example.test/roster-batches/${BATCH_ID}/errors.csv`),
      BATCH_ID,
      {
        clearSession: vi.fn(),
        download,
        readSession: vi.fn().mockResolvedValue('opaque-session'),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toContain(`${BATCH_ID}-errors.csv`);
    expect([...new Uint8Array(await response.arrayBuffer()).slice(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
    expect(download).toHaveBeenCalledWith('opaque-session', BATCH_ID);
  });

  it('redirects without calling Core when no Admin session exists', async () => {
    const download = vi.fn();
    const response = await downloadRosterErrorCsv(
      new Request(`https://admin.example.test/roster-batches/${BATCH_ID}/errors.csv`),
      BATCH_ID,
      {
        clearSession: vi.fn(),
        download,
        readSession: vi.fn().mockResolvedValue(null),
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://admin.example.test/?expired=1');
    expect(download).not.toHaveBeenCalled();
  });
});
