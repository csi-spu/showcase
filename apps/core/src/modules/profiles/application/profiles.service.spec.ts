import type {
  PrivatePublicProfile,
  ProfileMutationResult,
  ProfilesRepository,
  PublicProfileView,
} from './profiles.ports';
import { ProfileError, ProfilesService } from './profiles.service';

const NOW = new Date('2026-08-25T08:00:00.000Z');
const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const PUBLIC_ID = '20000000-0000-4000-8000-000000000002';
const IDEMPOTENCY_KEY = '30000000-0000-4000-8000-000000000003';

class FakeProfilesRepository implements ProfilesRepository {
  profile: PrivatePublicProfile | null = null;
  publicProfile: PublicProfileView | null = null;
  updateResult: ProfileMutationResult = { outcome: 'updated' };
  grantResult: ProfileMutationResult = { outcome: 'updated' };
  withdrawResult: ProfileMutationResult = { outcome: 'updated' };
  lastUpdate: Parameters<ProfilesRepository['updateProfile']>[0] | undefined;

  findPrivateProfile(): Promise<PrivatePublicProfile | null> {
    return Promise.resolve(this.profile);
  }

  findPublicProfile(): Promise<PublicProfileView | null> {
    return Promise.resolve(this.publicProfile);
  }

  updateProfile(
    input: Parameters<ProfilesRepository['updateProfile']>[0],
  ): Promise<ProfileMutationResult> {
    this.lastUpdate = input;
    return Promise.resolve(this.updateResult);
  }

  grantConsent(): Promise<ProfileMutationResult> {
    return Promise.resolve(this.grantResult);
  }

  withdrawConsent(): Promise<ProfileMutationResult> {
    return Promise.resolve(this.withdrawResult);
  }
}

describe('ProfilesService', () => {
  let repository: FakeProfilesRepository;
  let service: ProfilesService;

  beforeEach(() => {
    repository = new FakeProfilesRepository();
    service = new ProfilesService(repository, { now: () => NOW });
  });

  it('creates or updates a bounded private Public Profile for an active Student', async () => {
    await expect(
      service.updateProfile({
        actorAccountId: ACCOUNT_ID,
        bio: '  สนใจระบบเว็บ  ',
        canEditProfile: true,
        displayName: '  ณัฐดนัย สุขใจ  ',
        expectedVersion: 0,
        idempotencyKey: IDEMPOTENCY_KEY,
        links: [{ label: ' เว็บไซต์ ', url: 'https://example.com' }],
        photoId: null,
      }),
    ).resolves.toEqual({ outcome: 'updated' });

    expect(repository.lastUpdate).toEqual({
      actorAccountId: ACCOUNT_ID,
      expectedVersion: 0,
      idempotencyKey: IDEMPOTENCY_KEY,
      now: NOW,
      profile: {
        bio: 'สนใจระบบเว็บ',
        displayName: 'ณัฐดนัย สุขใจ',
        links: [{ label: 'เว็บไซต์', url: 'https://example.com/' }],
        photoId: null,
      },
    });
  });

  it('denies Public Profile content editing to an Alumnus', async () => {
    await expect(
      service.updateProfile({
        actorAccountId: ACCOUNT_ID,
        bio: null,
        canEditProfile: false,
        displayName: 'ณัฐดนัย',
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
        links: [],
        photoId: null,
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_EDIT_FORBIDDEN', status: 403 });
  });

  it('requires a complete current profile before an active Student or Alumnus grants consent', async () => {
    await expect(
      service.grantConsent({
        actorAccountId: ACCOUNT_ID,
        consentTextVersion: 'phase-1-v1',
        expectedVersion: 0,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_INCOMPLETE', status: 422 });

    repository.profile = privateProfile();
    await expect(
      service.grantConsent({
        actorAccountId: ACCOUNT_ID,
        consentTextVersion: 'phase-1-v1',
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toEqual({ outcome: 'updated' });
  });

  it('retains the profile while withdrawing consent and maps optimistic conflicts', async () => {
    repository.withdrawResult = { outcome: 'version_conflict' };
    await expect(
      service.withdrawConsent({
        actorAccountId: ACCOUNT_ID,
        expectedVersion: 1,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).rejects.toMatchObject({ code: 'PROFILE_VERSION_CONFLICT', status: 409 });
  });

  it('returns only a consent-eligible public projection or uniform not found', async () => {
    await expect(service.getPublicProfile(PUBLIC_ID)).rejects.toBeInstanceOf(ProfileError);
    await expect(service.getPublicProfile(PUBLIC_ID)).rejects.toMatchObject({
      code: 'PUBLIC_PROFILE_NOT_FOUND',
      status: 404,
    });

    repository.publicProfile = {
      bio: null,
      displayName: 'ณัฐดนัย',
      entryYear: 2569,
      links: [],
      photo: null,
      publicId: PUBLIC_ID,
    };
    await expect(service.getPublicProfile(PUBLIC_ID)).resolves.toEqual(repository.publicProfile);
  });
});

function privateProfile(): PrivatePublicProfile {
  return {
    bio: null,
    consent: null,
    displayName: 'ณัฐดนัย',
    entryYear: 2569,
    links: [],
    photo: null,
    photoId: null,
    publicId: PUBLIC_ID,
    version: 1,
  };
}
