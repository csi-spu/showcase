# Deploy affected images directly to production

## Status

Accepted.

## Decision

After a successful `main` CI run, GitHub Actions uses the Turborepo dependency graph to create a versioned plan containing only affected deployable applications. The production workflow consumes that exact CI artifact, builds immutable SHA-tagged images only for the selected applications, waits for protected Environment approval, and deploys only their Coolify resources. Core selection also rolls its cache and media workers because they share the Core image.

Staging is not operated during the current bootstrap phase. Manual production deployment requires a full `main` SHA plus the exact application list and verifies those existing images before deployment.

## Rejected alternatives

Building every image for every merge wastes CI time and registry storage. Recomputing affected applications in the later deployment workflow loses the original multi-commit push base. Keeping an unprovisioned staging workflow creates a misleading gate that can report success without testing an application.

## Consequences

Production is the first deployed environment, so focused tests, protected approval, readiness checks, immutable tags, and rapid Git reverts remain mandatory. The CI deployment-plan artifact becomes part of the delivery contract. Adding staging later requires an isolated environment and a new promotion decision.

## Supersedes

This supersedes ADR 0002's staging-promotion sequence. Its immutable image and prebuilt Coolify boundaries remain in force.
