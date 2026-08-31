# Dispatch derived effects through a durable outbox

Core records cache-invalidation intent durably with the authoritative domain transition, then dispatches that derived effect asynchronously through an idempotent consumer with reconciliation and observable lag; we rejected inline CDN calls because an external failure must not create a partial or rolled-back publication, consent, or Review transition, accepting eventual cache propagation and the operational cost of outbox storage, workers, retries, and monitoring.
