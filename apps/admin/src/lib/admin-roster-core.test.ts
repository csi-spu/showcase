import { describe, expect, it, vi } from 'vitest';
import { AdminRosterCoreClient } from './admin-roster-core';

const config = {
  adminBffSecret: 'server-only-admin-secret',
  coreUrl: 'https://core.example.test',
};

describe('AdminRosterCoreClient', () => {
  it('uploads private CSV bytes with an opaque Admin session', async () => {
    const response = {
      batchId: '20000000-0000-4000-8000-000000000001',
      createdCount: 0,
      entryYears: [2566, 2570],
      failedCount: 0,
      processedRowCount: 0,
      status: 'pending',
      totalRowCount: 1,
      unchangedCount: 0,
      uploadedAt: '2026-08-25T06:00:00.000Z',
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const client = new AdminRosterCoreClient(config, fetchMock);
    const content = new Uint8Array([115, 116, 117, 100, 101, 110, 116]);

    await expect(client.createBatch('opaque-session', content)).resolves.toEqual(response);
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.body).toBe(content);
    const headers = new Headers(request?.headers);
    expect(headers.get('authorization')).toBe('Bearer opaque-session');
    expect(headers.get('content-type')).toBe('text/csv');
    expect(headers.has('x-entry-year')).toBe(false);
  });

  it('validates the bounded safe Batch status response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        batchId: '20000000-0000-4000-8000-000000000001',
        createdCount: 1,
        entryYears: [2569],
        failedCount: 0,
        processedRowCount: 1,
        rawRows: ['private'],
        status: 'completed',
        totalRowCount: 1,
        unchangedCount: 0,
        uploadedAt: '2026-08-25T06:00:00.000Z',
      }),
    );

    await expect(
      new AdminRosterCoreClient(config, fetchMock).getBatch(
        'opaque-session',
        '20000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toMatchObject({ code: 'AUTH_SERVICE_UNAVAILABLE' });
  });

  it('downloads a private error CSV and restores its spreadsheet UTF-8 marker', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('row_number,student_id,error_code,error_message_th\r\n', {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      }),
    );
    const client = new AdminRosterCoreClient(config, fetchMock);

    await expect(
      client.downloadErrorCsv('opaque-session', '20000000-0000-4000-8000-000000000001'),
    ).resolves.toBe('\uFEFFrow_number,student_id,error_code,error_message_th\r\n');
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      'https://core.example.test/v1/internal/admin/roster-batches/20000000-0000-4000-8000-000000000001/errors.csv',
    );
    expect(new Headers(request?.headers).get('authorization')).toBe('Bearer opaque-session');
  });

  it('validates conflict pages and submits an optimistic idempotent resolution', async () => {
    const conflict = {
      batchId: '20000000-0000-4000-8000-000000000001',
      conflictId: '30000000-0000-4000-8000-000000000001',
      existingFirstNameTh: 'สมชาย',
      existingLastNameTh: 'ใจดี',
      incomingFirstNameTh: 'สมหญิง',
      incomingLastNameTh: 'มั่นคง',
      reason: null,
      resolution: null,
      resolvedAt: null,
      rowNumber: 2,
      status: 'pending',
      version: 1,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ conflicts: [conflict], nextAfterRowNumber: null }))
      .mockResolvedValueOnce(
        Response.json({
          ...conflict,
          reason: 'ตรวจสอบแล้ว',
          resolution: 'accept_incoming_name',
          resolvedAt: '2026-08-25T06:00:00.000Z',
          status: 'resolved',
          version: 2,
        }),
      );
    const client = new AdminRosterCoreClient(config, fetchMock);

    await expect(
      client.listConflicts('opaque-session', '20000000-0000-4000-8000-000000000001'),
    ).resolves.toEqual({ conflicts: [conflict], nextAfterRowNumber: null });
    await expect(
      client.resolveConflict('opaque-session', '30000000-0000-4000-8000-000000000001', {
        expectedVersion: 1,
        idempotencyKey: '40000000-0000-4000-8000-000000000001',
        reason: 'ตรวจสอบแล้ว',
        resolution: 'accept_incoming_name',
      }),
    ).resolves.toMatchObject({ status: 'resolved', version: 2 });
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(
      JSON.stringify({
        expectedVersion: 1,
        idempotencyKey: '40000000-0000-4000-8000-000000000001',
        reason: 'ตรวจสอบแล้ว',
        resolution: 'accept_incoming_name',
      }),
    );
  });
});
