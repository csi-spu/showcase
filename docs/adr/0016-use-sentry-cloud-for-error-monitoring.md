# Use Sentry Cloud for privacy-bounded error monitoring

## Status

Accepted.

## Decision

Showcase uses Sentry Cloud with one project for each deployable application: Admin, Student, Visitor, Core, and Media. Phase 1 sends error events and source maps only. It does not send traces, replays, profiles, browser session health, Sentry client reports, Sentry logs, metrics, user context, request bodies, headers, cookies, query parameters, stack locals, or free-form exception messages.

The three browser DSNs use `NEXT_PUBLIC_SENTRY_DSN` because a Sentry DSN is a public routing key, not an authentication secret, and the browser SDK must receive it at build time. Each immutable frontend image is therefore environment-specific at build time for this value. Core and Media receive their DSNs at runtime. A shared final scrubber enforces Showcase privacy rules for every application.

Production image builds upload source maps before deployment. GitHub supplies a least-privilege Sentry auth token through a BuildKit secret; it is never a Docker build argument, image environment value, layer, provenance value, application runtime secret, or log field. Release identifiers bind each application to the full Git SHA.

## Rejected alternatives

One shared project would mix ownership, releases, quotas, and alerts across five deployables. Self-hosting Sentry would add stateful operational burden before error volume justifies it. Runtime-only browser configuration cannot initialize client error reporting without either mutating immutable artifacts or adding a configuration endpoint. Omitting browser monitoring would leave client render failures invisible.

## Consequences

Frontend images cannot be promoted unchanged between environments when their public DSNs differ; the current production-only deployment path accepts that cost. Sentry becomes an external processor of aggressively redacted diagnostics, so project-side IP handling, data scrubbing, access, retention, and alert rules still require operator configuration. Removing a DSN disables delivery without affecting application boot or readiness. A Sentry outage must never change request, job, or media behavior.
