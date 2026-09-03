# How should Showcase integrate Sentry error monitoring?

## Conclusion

Showcase should use Sentry JavaScript SDK 10.73.0 with one Sentry Cloud project per deployable application: Admin, Student, Visitor, Core, and Media. Phase 1 captures errors only. Every runtime must explicitly disable automatic user, cookie, HTTP header/body/query, local-variable, client-report, log, metric, trace, replay, and profile collection, and browser runtimes must remove automatic session health tracking, then apply a shared final `beforeSend` and `beforeBreadcrumb` scrubber. Next.js should use its native instrumentation hooks and Sentry build plugin; NestJS should initialize before Nest imports and report terminal errors that its custom filters consume; the standalone Media service should initialize before server imports. Production builds should upload source maps with a short-lived CI secret and fail if upload fails.

## Findings

- The current package versions are `@sentry/nextjs`, `@sentry/nestjs`, and `@sentry/node` 10.73.0, plus `@sentry/cli` 3.7.0. Their engine requirements accept Node 22; the Next.js peer range includes Next.js 16 and the NestJS peer range includes NestJS 11. These versions were verified from the npm registry on 2026-09-03.
- Sentry's current Next.js manual setup uses `instrumentation-client.ts`, runtime-specific server and edge config files, `instrumentation.ts` with `register()` and `onRequestError`, an App Router `global-error.tsx`, and `withSentryConfig`. Its SDK supports Next.js 16. [Sentry Next.js manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/), [official Next.js SDK package](https://github.com/getsentry/sentry-javascript/tree/develop/packages/nextjs)
- The dedicated NestJS SDK must initialize before Nest or other instrumented imports. `SentryModule.forRoot()` installs the Nest integration, while exceptions consumed by specific filters require explicit capture. `SentryGlobalFilter` covers otherwise unhandled application exceptions and intentionally excludes ordinary `HttpException` control flow by default. [Sentry NestJS setup](https://docs.sentry.io/platforms/javascript/guides/nestjs/), [Sentry JavaScript v8 changelog](https://github.com/getsentry/sentry-javascript/blob/develop/docs/changelog/v8.md)
- Since SDK 10.57.0, `dataCollection` defaults to broad automatic debugging context, including user identity, cookies, HTTP headers and bodies, URL query parameters, generative-AI content, and stack-frame variables. Data set explicitly through APIs is still sent regardless of that option. Sentry Logs and Metrics default to enabled in 10.73.0. [Sentry JavaScript configuration options](https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/)
- `beforeSend` runs after scope data is applied and is the final event mutation point; `beforeBreadcrumb` can modify or discard breadcrumbs. They remain necessary defense in depth after disabling automatic categories. [Sentry JavaScript configuration options](https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/), [Sentry breadcrumbs](https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/breadcrumbs/)
- Sentry CLI's current source-map flow generates maps, injects Debug IDs into deployed JavaScript and map files, then uploads that same artifact directory before deployment. A release value is optional but, when used, must match between SDK initialization and upload. [Sentry CLI source-map setup](https://docs.sentry.io/platforms/javascript/guides/node/sourcemaps/uploading/cli/)
- Sentry's Next.js build integration accepts `SENTRY_AUTH_TOKEN` for source-map upload. The token must stay out of source control and build output. [Sentry Next.js manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)

## Showcase implications

- Use five projects so ownership, alerting, quotas, releases, and regressions remain attributable to one deployable surface. Use stable slugs `showcase-admin`, `showcase-student`, `showcase-visitor`, `showcase-core`, and `showcase-media`.
- Configure error sampling at 100%, tracing at 0%, replay at 0%, profiling at 0%, and set `enableLogs` and `enableMetrics` to `false`. Do not call `setUser` or attach request bodies, form data, roster rows, Student IDs, account IDs, or free-form user content.
- A shared provider-independent scrubber must remove the request query and fragment, user data, request data, headers, cookies, console/input breadcrumbs, sensitive-key values, free-form error messages, and exact eight-digit ASCII sequences. Stack frames, exception types, stable `errorCode`, `operation`, service, runtime, environment, and release remain useful and bounded.
- Expected 4xx control-flow errors do not create Sentry events. Core's custom catch-all filters report only unexpected or operational 5xx branches. Retry loops report only terminal exhaustion, not every transient attempt. Media reports its terminal 500 path, not 403, 404, 405, or 413 responses.
- Initialize SDKs even when the DSN is absent, with sending disabled. A missing DSN or Sentry outage must not fail boot, requests, health, readiness, retry processing, or graceful shutdown.
- Build release names as `showcase-<app>@<full-git-sha>`. Inject and upload Core and Media maps with Sentry CLI. Let `withSentryConfig` handle Next.js maps. Supply the auth token only through a BuildKit secret during the production build; never use a Docker `ARG` or persist it in an image layer.

## Unknowns and verification plan

- The `csishowcase` organization now contains the five projects and their automatically provisioned public DSNs. Repository and Coolify configuration remain an operator action because this implementation does not assume authority to mutate deployment configuration.
- Source-map upload cannot be exercised locally without a least-privilege CI token. Verify production configuration with a controlled, non-public exception after deployment, then confirm the event's release, project, tags, redaction, and original TypeScript frame in Sentry.
- Sentry-side server scrubbing and IP-retention settings are additional controls that must be configured on all five projects after creation. Client-side redaction remains mandatory because server-side rules do not prevent transmission.

## Sources

- [Sentry Next.js manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)
- [Official Sentry SDK for Next.js](https://github.com/getsentry/sentry-javascript/tree/develop/packages/nextjs)
- [Sentry NestJS setup](https://docs.sentry.io/platforms/javascript/guides/nestjs/)
- [Sentry JavaScript configuration options](https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/)
- [Sentry breadcrumbs](https://docs.sentry.io/platforms/javascript/guides/node/enriching-events/breadcrumbs/)
- [Sentry CLI source-map setup](https://docs.sentry.io/platforms/javascript/guides/node/sourcemaps/uploading/cli/)
- [Sentry JavaScript v8 changelog](https://github.com/getsentry/sentry-javascript/blob/develop/docs/changelog/v8.md)
- [Sentry CLI](https://github.com/getsentry/sentry-cli)
