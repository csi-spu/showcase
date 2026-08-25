import { z } from 'zod';

const changeRequestSchema = z.object({
  expectedRevisionVersion: z.coerce.number().int().positive(),
  feedback: z.string().trim().min(10).max(2_000),
  idempotencyKey: z.uuid(),
  reason: z.enum(['content', 'attribution', 'media', 'links_tags', 'policy', 'other']),
});

export function validateChangeRequest(formData: FormData) {
  const result = changeRequestSchema.safeParse({
    expectedRevisionVersion: formData.get('expectedRevisionVersion'),
    feedback: formData.get('feedback'),
    idempotencyKey: formData.get('idempotencyKey'),
    reason: formData.get('reason'),
  });
  return result.success ? result.data : null;
}
