import { NodeIdentityProtector, NodeTokenGenerator } from './node-auth-crypto';

describe('NodeIdentityProtector', () => {
  it('derives domain-separated opaque values without exposing Student ID', () => {
    const protector = new NodeIdentityProtector('test-secret-with-at-least-32-characters');
    const studentId = '69000001';

    expect(protector.hashStudentId(studentId)).toMatch(/^[a-f0-9]{64}$/);
    expect(protector.hashStudentId(studentId)).not.toBe(protector.hashSessionToken(studentId));
    expect(protector.toSyntheticIdentity(studentId)).toMatch(/^[a-f0-9]{64}@auth\.invalid$/);
    expect(protector.toSyntheticIdentity(studentId)).not.toContain(studentId);
  });

  it('domain-separates private Admin login derivation from every other identity', () => {
    const protector = new NodeIdentityProtector('test-secret-with-at-least-32-characters');
    const adminLogin = 'operations';

    expect(protector.hashAdminLogin(adminLogin)).toMatch(/^[a-f0-9]{64}$/);
    expect(protector.hashAdminLogin(adminLogin)).not.toBe(protector.hashSessionToken(adminLogin));
    expect(protector.toAdminSyntheticIdentity(adminLogin)).toMatch(
      /^[a-f0-9]{64}@admin\.auth\.invalid$/,
    );
    expect(protector.toAdminSyntheticIdentity(adminLogin)).not.toContain(adminLogin);
  });
});

describe('NodeTokenGenerator', () => {
  it('creates an opaque base64url token with the requested entropy', () => {
    const token = new NodeTokenGenerator().generate(32);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });
});
