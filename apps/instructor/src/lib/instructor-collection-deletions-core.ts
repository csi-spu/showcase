import 'server-only';
import { CoreClient } from '@showcase/core-client';
import {
  deletionLogPageSchema,
  deletionPreviewSchema,
  deletionResultSchema,
  type CollectionDeletionKind,
  type CollectionDeletionLogPage,
  type CollectionDeletionPreview,
} from './instructor-collection-deletions-contract';

const BASE = '/v1/internal/instructor/collection';

const KIND_PATHS: Record<CollectionDeletionKind, string> = {
  form: 'forms',
  group: 'groups',
  round: 'rounds',
};

interface InstructorCollectionDeletionsCoreConfig {
  coreUrl: string;
  instructorBffSecret: string;
}

export class InstructorCollectionDeletionsCoreClient {
  private readonly client: CoreClient;

  constructor(config: InstructorCollectionDeletionsCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-instructor-bff-secret', value: config.instructorBffSecret },
      fetchImpl,
    });
  }

  /** What deleting the item would remove, and whether it may be deleted now. */
  previewDeletion(
    sessionToken: string,
    kind: CollectionDeletionKind,
    id: string,
  ): Promise<CollectionDeletionPreview> {
    return this.client.request({
      method: 'GET',
      path: `${BASE}/${KIND_PATHS[kind]}/${id}/deletion-preview`,
      responseSchema: deletionPreviewSchema,
      sessionToken,
    });
  }

  deleteItem(
    sessionToken: string,
    kind: CollectionDeletionKind,
    id: string,
    input: { confirmationName: string },
  ): Promise<{ deletionId: string }> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `${BASE}/${KIND_PATHS[kind]}/${id}/delete`,
      responseSchema: deletionResultSchema,
      sessionToken,
    });
  }

  listDeletions(sessionToken: string, cursor: string | null): Promise<CollectionDeletionLogPage> {
    const query = cursor === null ? '' : `?${new URLSearchParams({ cursor })}`;
    return this.client.request({
      method: 'GET',
      path: `${BASE}/deletions${query}`,
      responseSchema: deletionLogPageSchema,
      sessionToken,
    });
  }

  restoreDeletion(
    sessionToken: string,
    deletionId: string,
    input: { reason: string },
  ): Promise<{ deletionId: string }> {
    return this.client.request({
      body: input,
      method: 'POST',
      path: `${BASE}/deletions/${deletionId}/restore`,
      responseSchema: deletionResultSchema,
      sessionToken,
    });
  }
}
