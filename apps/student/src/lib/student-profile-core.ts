import 'server-only';
import { CoreClient, CoreClientError } from '@showcase/core-client';
import { z } from 'zod';

const profileLinkSchema = z.object({ label: z.string(), url: z.url() }).strict();
const profilePhotoSchema = z
  .object({ height: z.number().int(), url: z.url(), width: z.number().int() })
  .strict();
const privateProfileSchema = z
  .object({
    bio: z.string().nullable(),
    consent: z
      .object({ consentTextVersion: z.string(), grantedAt: z.iso.datetime() })
      .strict()
      .nullable(),
    links: z.array(profileLinkSchema).max(5),
    photo: profilePhotoSchema.nullable(),
    photoId: z.uuid().nullable(),
    publicId: z.uuid(),
    version: z.number().int().positive(),
  })
  .strict();
const privatePersonSchema = z
  .object({
    entryYear: z.number().int(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
  })
  .strict();
const privateProfileResponseSchema = z
  .object({
    canEditProfile: z.boolean(),
    person: privatePersonSchema.nullable(),
    profile: privateProfileSchema.nullable(),
  })
  .strict();
const mutationResultSchema = z
  .object({ outcome: z.enum(['replayed', 'unchanged', 'updated']) })
  .strict();
const photoUploadSchema = z
  .object({
    expiresAt: z.iso.datetime(),
    headers: z.object({ 'content-type': z.string() }).strict(),
    uploadId: z.uuid(),
    uploadUrl: z.url(),
  })
  .strict();
const finalizedPhotoSchema = z.object({ photoId: z.uuid(), status: z.literal('ready') }).strict();

export type PrivatePublicProfile = z.infer<typeof privateProfileSchema>;
export type PrivatePerson = z.infer<typeof privatePersonSchema>;
export type PrivateProfileResponse = z.infer<typeof privateProfileResponseSchema>;
export type ProfileUpdateInput = {
  bio: string | null;
  expectedVersion: number;
  idempotencyKey: string;
  links: { label: string; url: string }[];
  photoId: string | null;
};

interface StudentProfileCoreConfig {
  coreUrl: string;
  studentBffSecret: string;
}

export class StudentProfileCoreClient {
  private readonly client: CoreClient;

  constructor(config: StudentProfileCoreConfig, fetchImpl: typeof fetch = fetch) {
    this.client = new CoreClient({
      baseUrl: config.coreUrl,
      credential: { headerName: 'x-student-bff-secret', value: config.studentBffSecret },
      fetchImpl,
    });
  }

  getProfile(sessionToken: string): Promise<PrivateProfileResponse> {
    return this.client.request({
      method: 'GET',
      path: '/v1/internal/student/profile',
      responseSchema: privateProfileResponseSchema,
      sessionToken,
    });
  }

  updateProfile(sessionToken: string, input: ProfileUpdateInput) {
    return this.client.request({
      body: input,
      method: 'PUT',
      path: '/v1/internal/student/profile',
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  grantConsent(
    sessionToken: string,
    input: { consentTextVersion: string; expectedVersion: number; idempotencyKey: string },
  ) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/student/profile/consent',
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  withdrawConsent(
    sessionToken: string,
    input: { expectedVersion: number; idempotencyKey: string },
  ) {
    return this.client.request({
      body: input,
      method: 'DELETE',
      path: '/v1/internal/student/profile/consent',
      responseSchema: mutationResultSchema,
      sessionToken,
    });
  }

  createPhotoUpload(sessionToken: string, input: { byteSize: number; contentType: string }) {
    return this.client.request({
      body: input,
      method: 'POST',
      path: '/v1/internal/student/profile/photo-uploads',
      responseSchema: photoUploadSchema,
      sessionToken,
    });
  }

  finalizePhotoUpload(sessionToken: string, uploadId: string) {
    return this.client.request({
      method: 'POST',
      path: `/v1/internal/student/profile/photo-uploads/${uploadId}/finalize`,
      responseSchema: finalizedPhotoSchema,
      sessionToken,
    });
  }
}

export { CoreClientError as StudentProfileCoreError };
