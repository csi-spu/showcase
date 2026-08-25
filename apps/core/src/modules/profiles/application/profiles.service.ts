import { Inject, Injectable } from '@nestjs/common';
import {
  evaluatePublicProfile,
  type PublicProfileDraftInput,
} from '../domain/public-profile-policy';
import {
  PROFILES_CLOCK,
  PROFILES_REPOSITORY,
  type ProfileMutationResult,
  type ProfilesClock,
  type ProfilesRepository,
  type PublicProfileView,
} from './profiles.ports';

type ProfileErrorCode =
  | 'INVALID_PROFILE'
  | 'PROFILE_EDIT_FORBIDDEN'
  | 'PROFILE_IDEMPOTENCY_CONFLICT'
  | 'PROFILE_INCOMPLETE'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_VERSION_CONFLICT'
  | 'PUBLIC_PROFILE_NOT_FOUND';

export class ProfileError extends Error {
  constructor(
    readonly code: ProfileErrorCode,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ProfileError';
  }
}

interface UpdateProfileInput extends PublicProfileDraftInput {
  actorAccountId: string;
  canEditProfile: boolean;
  expectedVersion: number;
  idempotencyKey: string;
}

interface ConsentMutationInput {
  actorAccountId: string;
  expectedVersion: number;
  idempotencyKey: string;
}

@Injectable()
export class ProfilesService {
  constructor(
    @Inject(PROFILES_REPOSITORY) private readonly repository: ProfilesRepository,
    @Inject(PROFILES_CLOCK) private readonly clock: ProfilesClock,
  ) {}

  async getPrivateProfile(accountId: string) {
    return this.repository.findPrivateProfile(accountId);
  }

  async getPublicProfile(publicId: string): Promise<PublicProfileView> {
    const profile = await this.repository.findPublicProfile(publicId);
    if (profile === null) {
      throw new ProfileError('PUBLIC_PROFILE_NOT_FOUND', 404);
    }
    return profile;
  }

  async updateProfile(input: UpdateProfileInput): Promise<ProfileMutationResult> {
    if (!input.canEditProfile) {
      throw new ProfileError('PROFILE_EDIT_FORBIDDEN', 403);
    }
    const evaluation = evaluatePublicProfile(input);
    if (!evaluation.isValid) {
      throw new ProfileError('INVALID_PROFILE', 422);
    }
    const result = await this.repository.updateProfile({
      actorAccountId: input.actorAccountId,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      now: this.clock.now(),
      profile: evaluation.profile,
    });
    return this.requireSuccessfulMutation(result);
  }

  async grantConsent(
    input: ConsentMutationInput & { consentTextVersion: string },
  ): Promise<ProfileMutationResult> {
    const profile = await this.repository.findPrivateProfile(input.actorAccountId);
    if (profile === null) {
      throw new ProfileError('PROFILE_INCOMPLETE', 422);
    }
    const evaluation = evaluatePublicProfile({
      bio: profile.bio,
      displayName: profile.displayName,
      links: profile.links,
      photoId: null,
    });
    if (!evaluation.isValid) {
      throw new ProfileError('PROFILE_INCOMPLETE', 422);
    }
    const result = await this.repository.grantConsent({
      ...input,
      now: this.clock.now(),
    });
    return this.requireSuccessfulMutation(result);
  }

  async withdrawConsent(input: ConsentMutationInput): Promise<ProfileMutationResult> {
    const result = await this.repository.withdrawConsent({
      ...input,
      now: this.clock.now(),
    });
    return this.requireSuccessfulMutation(result);
  }

  private requireSuccessfulMutation(result: ProfileMutationResult): ProfileMutationResult {
    if (result.outcome === 'idempotency_conflict') {
      throw new ProfileError('PROFILE_IDEMPOTENCY_CONFLICT', 409);
    }
    if (result.outcome === 'not_found') {
      throw new ProfileError('PROFILE_NOT_FOUND', 404);
    }
    if (result.outcome === 'version_conflict') {
      throw new ProfileError('PROFILE_VERSION_CONFLICT', 409);
    }
    return result;
  }
}
