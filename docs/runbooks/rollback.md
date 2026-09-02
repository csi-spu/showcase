# Rollback

## Choose the path

| Failure                                | Preferred response                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| New container fails readiness          | let Coolify preserve old healthy container; inspect failed deployment          |
| Application regression                 | revert the offending commit and run the normal selective production flow       |
| Immediate production harm              | pin previous known-good SHA in Coolify, then create the Git revert immediately |
| Runtime configuration error            | restore prior Coolify value and restart affected app                           |
| Forward-only migration incompatibility | apply a corrective forward migration; do not blindly reverse destructive SQL   |

## Normal rollback

1. Identify the first bad full SHA and affected surfaces.
2. Confirm whether migrations or runtime configuration changed.
3. Revert through Git with a reviewed or emergency-authorized change.
4. Let CI build and deploy the affected revert images through the protected production workflow.
5. Verify readiness, error rate, login, and the affected user path.
6. Record incident timeline and follow-up issue.

## Emergency image rollback

Use only when waiting for rebuild would prolong active harm:

1. In Coolify production, select the last verified deployment for each affected app.
2. Redeploy its immutable `sha-<full-sha>` tag. Roll Core back before dependent frontends when compatibility requires it.
3. Verify health and the failing path.
4. Revert the source commit in Git immediately so the next automated deploy cannot restore the bad state.
5. If schema changed, confirm the prior app remains compatible with the current expanded schema.

Never use an unverified moving tag. Never delete the bad image during incident response; preserve evidence.

## Configuration rollback

Change only the incorrect key in Coolify, compare against the last known configuration, restart the minimum affected service, and verify. Secret values remain out of chat, tickets, and incident documents.

## Verification

- Coolify reports `finished` and exact expected SHA tag.
- Container health is green.
- Core liveness and readiness return 200.
- Visitor public read works without private data.
- A representative authenticated path works when auth is affected.
- Error and latency indicators return toward baseline.
