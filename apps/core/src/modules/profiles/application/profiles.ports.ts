import type { PublicProfileDraftInput } from '../domain/public-profile-policy';

export const PROFILES_CLOCK = Symbol('PROFILES_CLOCK');
export const PROFILES_REPOSITORY = Symbol('PROFILES_REPOSITORY');

export interface ProfilesClock {
  now(): Date;
}

export interface ProfileConsentView {
  consentTextVersion: string;
  grantedAt: string;
}

export interface ProfilePhotoView {
  height: number;
  url: string;
  width: number;
}

export interface PrivatePublicProfile {
  bio: string | null;
  consent: ProfileConsentView | null;
  displayName: string;
  entryYear: number;
  links: PublicProfileDraftInput['links'];
  photo: ProfilePhotoView | null;
  photoId: string | null;
  publicId: string;
  version: number;
}

export interface PublicProfileView {
  bio: string | null;
  displayName: string;
  entryYear: number;
  links: PublicProfileDraftInput['links'];
  photo: ProfilePhotoView | null;
  publicId: string;
}

export type ProfileMutationResult =
  | { outcome: 'idempotency_conflict' | 'not_found' | 'version_conflict' }
  | { outcome: 'replayed' | 'unchanged' | 'updated' };

export interface ProfilesRepository {
  findPrivateProfile(accountId: string): Promise<PrivatePublicProfile | null>;
  findPublicProfile(publicId: string): Promise<PublicProfileView | null>;
  grantConsent(input: {
    actorAccountId: string;
    consentTextVersion: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<ProfileMutationResult>;
  updateProfile(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
    profile: PublicProfileDraftInput;
  }): Promise<ProfileMutationResult>;
  withdrawConsent(input: {
    actorAccountId: string;
    expectedVersion: number;
    idempotencyKey: string;
    now: Date;
  }): Promise<ProfileMutationResult>;
}
