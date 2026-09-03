# Sentry error monitoring

## Provisioning

1. Create Sentry projects `showcase-admin`, `showcase-student`, `showcase-visitor`, `showcase-core`, and `showcase-media` in the same organization.
2. Configure every project to avoid storing IP addresses and add server-side scrubbing for authentication data, cookies, headers, query strings, request bodies, Student IDs, names, email addresses, and tokens.
3. Store the organization slug as GitHub repository variable `SENTRY_ORG`.
4. Store Admin, Student, and Visitor public DSNs as repository variables `SENTRY_DSN_ADMIN`, `SENTRY_DSN_STUDENT`, and `SENTRY_DSN_VISITOR`.
5. Create a least-privilege organization token for release and source-map upload, then store it as repository secret `SENTRY_AUTH_TOKEN`.
6. Set the Core project public DSN as `SENTRY_DSN` on Core and every Core-image worker in Coolify. Set the Media project public DSN as `SENTRY_DSN` on Media.

Never paste the auth token into a DSN field, Docker build argument, Coolify runtime, issue, log, or source file.

## Verification

After an approved production deployment, trigger one controlled exception through an existing private operator workflow; do not add a permanent public failure route. Confirm:

- the event lands in the matching project;
- `service`, `runtime`, `environment`, `operation`, `errorCode`, and `showcase-<app>@<full-sha>` release tags are present where applicable;
- the stack resolves to the original TypeScript/TSX source;
- user, request body, cookies, headers, query/fragment, free-form exception text, names, tokens, and exact eight-digit Student IDs are absent;
- expected 4xx responses and transient retry attempts create no issue;
- disabling the DSN or blocking Sentry egress does not change health, readiness, requests, or worker completion.

## Rollback

Remove the affected DSN to stop new event delivery without redeployment. For code rollback, revert the introducing commit and deploy the resulting immutable images. Rotate `SENTRY_AUTH_TOKEN` immediately if it may have entered logs or build artifacts; deleting history is not a substitute for revocation.
