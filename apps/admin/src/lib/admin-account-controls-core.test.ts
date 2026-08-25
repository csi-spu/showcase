import { describe, expect, it, vi } from 'vitest';
import { AdminAccountControlsCoreClient } from './admin-account-controls-core';

const config = {
  adminBffSecret: 'server-only-admin-secret',
  coreUrl: 'https://core.example.test',
};

describe('AdminAccountControlsCoreClient', () => {
  it('keeps Student ID in a private POST body and validates a safe response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        accessEndsAcademicYear: 2576,
        accountId: '20000000-0000-4000-8000-000000000001',
        canUseStudentCapabilities: false,
        currentAcademicYear: 2577,
        entryYear: 2569,
        firstNameTh: 'สมชาย',
        lastNameTh: 'ใจดี',
        state: 'alumnus',
        version: 2,
      }),
    );

    await new AdminAccountControlsCoreClient(config, fetchMock).findStudent(
      'opaque-admin-session',
      '69000001',
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/internal/admin/account-controls/students/lookup',
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('69000001');
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ studentId: '69000001' }));
  });

  it('sends optimistic and idempotent mutation contracts and accepts temporary password once', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          currentAcademicYear: 2570,
          updatedAt: '2026-08-25T06:00:00.000Z',
          version: 3,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          student: {
            accessEndsAcademicYear: 2576,
            accountId: '20000000-0000-4000-8000-000000000001',
            canUseStudentCapabilities: true,
            currentAcademicYear: 2570,
            entryYear: 2569,
            firstNameTh: 'สมชาย',
            lastNameTh: 'ใจดี',
            state: 'student',
            version: 3,
          },
          temporaryPassword: 'one-time-random-password',
        }),
      );
    const client = new AdminAccountControlsCoreClient(config, fetchMock);

    await client.updateAcademicYear('opaque-admin-session', {
      currentAcademicYear: 2570,
      expectedVersion: 2,
      idempotencyKey: '30000000-0000-4000-8000-000000000001',
    });
    await expect(
      client.resetStudentPassword('opaque-admin-session', '20000000-0000-4000-8000-000000000001', {
        expectedVersion: 2,
        idempotencyKey: '30000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toMatchObject({ temporaryPassword: 'one-time-random-password' });

    expect(
      fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)) as unknown),
    ).toEqual([
      {
        currentAcademicYear: 2570,
        expectedVersion: 2,
        idempotencyKey: '30000000-0000-4000-8000-000000000001',
      },
      {
        expectedVersion: 2,
        idempotencyKey: '30000000-0000-4000-8000-000000000002',
      },
    ]);
  });
});
