# Core-specific rules

- Read root `AGENTS.md`, `CONTEXT.md`, and relevant ADRs first.
- Add code under `src/modules/<feature>`; do not create global controller/service/repository layer folders.
- Controllers parse transport input and map output. Application services own use-case orchestration and domain decisions.
- Persistence, Supabase, and R2 adapters sit behind explicit injected ports. Never import an SDK into domain logic.
- Every mutation identifies its actor from the authenticated session, records required audit data, and is retry-safe where clients may repeat it.
- Public queries enforce publication and consent in the repository/query boundary, not through response redaction alone.
- New environment variables belong in the Zod environment schema, `.env.example`, secrets documentation, and deployment configuration in one change.
- Add unit tests for domain transitions and integration tests for each external adapter contract.
