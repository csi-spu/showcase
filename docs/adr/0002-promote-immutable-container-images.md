# Promote immutable container images through environments

Superseded in part by [ADR 0015](0015-deploy-affected-images-directly-to-production.md). The immutable image and prebuilt Coolify boundaries remain active; the staging-promotion sequence does not.

GitHub Actions builds each deployable surface once for a merged commit, publishes it to GHCR under `sha-<full-commit-sha>`, deploys that exact tag to staging, and later promotes the same image to production through a protected manual workflow; Coolify is configured as a prebuilt-image consumer and CI pins its image tag through the API before deployment. We chose immutable artifact promotion over rebuilding per environment or letting Coolify build from Git so production runs the artifact already tested in staging and rollback targets remain unambiguous, accepting that runtime configuration must not depend on environment-specific client-side build values and that GHCR availability is part of deployment.
