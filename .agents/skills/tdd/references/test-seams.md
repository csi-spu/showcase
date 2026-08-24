# Showcase test seams

Choose the highest seam that remains fast and deterministic.

| Behavior                                          | Preferred seam                             | Escalate when                                                 |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Status transition or eligibility rule             | Domain policy/value object                 | Persistence constraints affect the result                     |
| Use case orchestration                            | Application service with explicit adapters | Transport guards or serialization are part of the requirement |
| Authentication, authorization, DTO, HTTP contract | Focused Nest E2E                           | A browser-owned cookie or redirect must be proven             |
| Query, migration, uniqueness, or transaction      | Supabase/Postgres integration              | User-visible behavior spans additional services               |
| Server-rendered page behavior                     | Server Component or route                  | Hydration and interaction matter                              |
| Form interaction                                  | Small Client Component                     | The journey depends on real navigation or browser APIs        |
| Critical multi-app journey                        | Browser E2E                                | Never escalate further; diagnose the seam                     |

Do not query the database as a side channel to verify a use case when its public result or repository interface can prove the behavior. Persistence integration tests may inspect persistence because persistence is their public subject.
