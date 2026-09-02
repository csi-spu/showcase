# Add a deployable service

Adding a service increases operational surface. Confirm it cannot be a feature module or shared package first.

## Repository

1. Create `apps/<service>` with `@showcase/<service>` package name.
2. Extend strict TypeScript configuration and add `dev`, `lint`, `typecheck`, `test:ci`, and `build` scripts.
3. Add app-level `AGENTS.md`, README, `.env.example`, health endpoint, and focused health test.
4. Add a multi-stage non-root Dockerfile with pinned Node base, runtime port, health check, and `GIT_SHA` build arg.
5. Add the workspace to architecture and monorepo documentation.

## CI and image

1. Add the service to `tools/ci/create-deployment-plan.mjs` and its contract tests.
2. Use image name `ghcr.io/csi-spu/showcase-<service>` and immutable SHA tags.
3. Add its selective build, manual image verification, and production deployment jobs.
4. Add deployment after every service it depends on.
5. Add its production Coolify UUID variable.

## Coolify

Create one production Docker Image application. Configure registry read access, container port, health path, domain, runtime environment, resource limits, and auto-deploy disabled. Store runtime secrets only in Coolify.

## Acceptance

- Focused lint, typecheck, test, and build pass.
- Container runs locally as non-root and health becomes ready.
- PR affected selection includes the new workspace.
- Production image has SBOM/provenance and exact SHA tag.
- Protected Environment approval gates the first production deployment.
- Rollback path and owner are documented.
