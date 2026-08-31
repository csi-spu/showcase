# Issue 56 Student workspace cutover

Use this runbook for the forward-only Student workspace and direct Contributor rollout. Do not combine the database cutover with a normal rolling replacement of legacy Core containers.

## Phase A: additive compatibility

1. Apply `20260828130010_issue_56_student_workspace_phase_a.sql` only. Existing invitation tables, constraints, sessions, and credentials remain usable.
2. Keep the pre-cutover application release serving while the migration settles.
3. Run the bounded backfill repeatedly from an authorized database session. Each call commits at most 500 source rows and reports no row identity:

   ```sql
   select * from private.backfill_work_draft_contributors(500);
   ```

4. Stop only when `remaining_count = 0`. Compare the sum of batch outcomes with the source-state counts. Investigate every `missing_draft`, `invalid_source`, and `over_limit` outcome before cutover.
5. Re-run one batch and verify it reports `remaining_count = 0` and no new outcome. Verify representative Published Work responses and immutable Revision snapshots against the pre-migration capture.

## Phase B: controlled cutover

1. Apply `20260828145612_issue_56_student_workspace_cutover.sql`. This only installs cutover machinery. It does not invalidate a credential or block a legacy write.
2. Start the cutover-capable Core and all new frontends without routing public traffic to them. Direct Contributor lookup and mutations must return `CONTRIBUTOR_CUTOVER_UNAVAILABLE` until the database cutover commits.
3. Confirm the new Core can read backfilled Draft Contributors for submission, then stop routing new requests to every legacy Core instance and drain their in-flight requests.
4. Run the bounded backfill again until `remaining_count = 0`, covering invitations written during the compatibility window. Cutover also refuses `missing_draft`, `invalid_source`, or `over_limit` outcomes. Correct the source data, remove only that failed private outcome in the same authorized remediation change, and rerun the batch; do not waive or discard an eligible Contributor.
5. Execute the one-way cutover from an authorized database session:

   ```sql
   select * from private.execute_issue_56_contributor_cutover();
   ```

   The transaction serializes with the batch worker, locks legacy write tables, and rechecks that every source row has a successful or terminal outcome. It then invalidates every invitation/recovery hash, removes every legacy invitation session, installs read-only audit triggers, and finally marks direct Contributor runtime available.

6. Replay the function and verify it returns the same completion time and counts. Verify all credential hashes are null, session count is zero, legacy mutations fail, and direct Contributor lookup/add/remove succeeds through Core.
7. Switch traffic to the new Core and frontends. Monitor explicit Draft-save failure/conflict rate, exact-lookup rate limits, removal queue age, and cache invalidation lag.

## Rollback

- Before executing the cutover function, route traffic back to the pre-cutover application release. Leave both additive migrations installed.
- After executing the cutover function, never return to a Core that reads only invitation state. Use the cutover-capable Core as the rollback floor and preserve every direct Contributor write.
- Stabilize public removal at the server boundary if required. Do not restore invitation credentials, drop new tables, hard-delete history, or rewrite Published Revisions.
