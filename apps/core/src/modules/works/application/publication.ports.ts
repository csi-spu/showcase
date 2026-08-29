import type { NormalizedWorkDraft } from '../domain/work-draft-policy';

export const PUBLICATION_REPOSITORY = Symbol('PUBLICATION_REPOSITORY');

export interface PublicationView {
  publishedAt: string;
  revisionPublicId: string;
  revisionVersion: number;
  workPublicId: string;
}

export interface PublicWorkAttributionView {
  affiliation: string | null;
  attributionPublicId: string;
  attributionName: string;
  canRequestRemoval: boolean;
  contributionRole: string | null;
  profilePublicId: string | null;
  studyYear: number | null;
}

export interface PublicWorkMediaView {
  assetId: string;
  dominantColor: string;
  height: number;
  kind: 'gallery' | 'poster';
  position: number;
  variants: Array<{ height: number; width: number }>;
  width: number;
}

export interface PublicWorkView {
  academicPeriod: NormalizedWorkDraft['academicPeriod'];
  attributions: PublicWorkAttributionView[];
  category: NormalizedWorkDraft['category'];
  description: string;
  links: NormalizedWorkDraft['links'];
  media: PublicWorkMediaView[];
  publishedAt: string;
  revisionNumber: number;
  summary: string;
  tags: Array<{ displayLabel: string; publicId: string }>;
  title: string;
  videoLinks: NormalizedWorkDraft['videoLinks'];
  workPublicId: string;
}

export type PublicationFailureOutcome =
  | 'idempotency_conflict'
  | 'revision_not_found'
  | 'revision_state_conflict'
  | 'revision_version_conflict'
  | 'work_state_conflict';

export type PublicationResult =
  | { outcome: 'published' | 'replayed'; publication: PublicationView }
  | { outcome: PublicationFailureOutcome };

export interface PublicationRepository {
  approveAndPublish(input: {
    actorAccountId: string;
    expectedRevisionVersion: number;
    idempotencyKey: string;
    now: Date;
    revisionPublicId: string;
  }): Promise<PublicationResult>;
  findPublicMediaObjectKey(
    workPublicId: string,
    assetId: string,
    width: number,
  ): Promise<string | null>;
  findPublicWork(workPublicId: string): Promise<PublicWorkView | null>;
}
