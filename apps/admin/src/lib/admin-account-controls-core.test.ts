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
        status: 'active',
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
            status: 'active',
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

  it('sends a Roster Name correction only to the private Admin endpoint', async () => {
    const response = {
      accessEndsAcademicYear: 2576,
      accountId: '20000000-0000-4000-8000-000000000001',
      canUseStudentCapabilities: true,
      currentAcademicYear: 2570,
      entryYear: 2569,
      firstNameTh: 'สมหญิง',
      lastNameTh: 'มั่นใจ',
      state: 'student',
      status: 'active',
      version: 3,
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(response));
    const client = new AdminAccountControlsCoreClient(config, fetchMock);
    const input = {
      expectedVersion: 2,
      firstNameTh: 'สมหญิง',
      idempotencyKey: '30000000-0000-4000-8000-000000000003',
      lastNameTh: 'มั่นใจ',
      reason: 'แก้ไขตามหลักฐานทะเบียน',
    };

    await expect(
      client.correctStudentName('opaque-admin-session', response.accountId, input),
    ).resolves.toEqual(response);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/internal/admin/account-controls/students/${response.accountId}/name`,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input);
  });

  it('lists Students and Admins with an opaque cursor and no Student ID in the query', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              accessEndsAcademicYear: 2576,
              accountId: '20000000-0000-4000-8000-000000000001',
              canUseStudentCapabilities: true,
              currentAcademicYear: 2570,
              entryYear: 2569,
              firstNameTh: 'สมชาย',
              lastNameTh: 'ใจดี',
              state: 'student',
              status: 'active',
              version: 1,
            },
          ],
          nextCursor: 'opaque-cursor-value',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              accountId: '20000000-0000-4000-8000-000000000009',
              createdAt: '2026-08-25T06:00:00.000Z',
              firstNameTh: 'ผู้ดูแล',
              lastNameTh: 'ระบบ',
              status: 'active',
              version: 1,
            },
          ],
          nextCursor: null,
        }),
      );
    const client = new AdminAccountControlsCoreClient(config, fetchMock);

    await expect(
      client.listStudents('opaque-admin-session', { cursor: null, search: 'สมชาย' }),
    ).resolves.toMatchObject({ nextCursor: 'opaque-cursor-value' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/internal/admin/account-controls/students?search=%E0%B8%AA%E0%B8%A1%E0%B8%8A%E0%B8%B2%E0%B8%A2',
    );

    await expect(
      client.listAdmins('opaque-admin-session', { cursor: 'opaque-cursor-value', search: null }),
    ).resolves.toMatchObject({ nextCursor: null });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://core.example.test/v1/internal/admin/account-controls/admins?cursor=opaque-cursor-value',
    );
  });

  it('creates an Admin and returns the one-time password without echoing it back on future calls', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        admin: { adminLogin: 'ops' },
        temporaryPassword: 'one-time-random-password',
      }),
    );
    const client = new AdminAccountControlsCoreClient(config, fetchMock);
    const input = { adminLogin: 'ops', firstNameTh: 'สมชาย', lastNameTh: 'ใจดี' };

    await expect(client.createAdmin('opaque-admin-session', input)).resolves.toEqual({
      admin: { adminLogin: 'ops' },
      temporaryPassword: 'one-time-random-password',
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://core.example.test/v1/internal/admin/account-controls/admins',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input);
  });

  it('suspends an Admin Account with an audited reason and optimistic version', async () => {
    const accountId = '20000000-0000-4000-8000-000000000009';
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        accountId,
        createdAt: '2026-08-25T06:00:00.000Z',
        firstNameTh: 'ผู้ดูแล',
        lastNameTh: 'ระบบ',
        status: 'suspended',
        version: 2,
      }),
    );
    const client = new AdminAccountControlsCoreClient(config, fetchMock);
    const input = {
      action: 'suspended' as const,
      expectedVersion: 1,
      idempotencyKey: '30000000-0000-4000-8000-000000000004',
      reason: 'ระงับชั่วคราวตามคำขอ',
    };

    await expect(
      client.setAdminStatus('opaque-admin-session', accountId, input),
    ).resolves.toMatchObject({ status: 'suspended' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `https://core.example.test/v1/internal/admin/account-controls/admins/${accountId}/status`,
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(input);
  });
});
