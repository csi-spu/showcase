# Architecture decision records

ADRs record decisions that constrain multiple applications, infrastructure, security, or the domain model.

| ADR                                                                          | Decision                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [0001](0001-route-data-and-authentication-through-core.md)                   | Route domain data and authentication through Core            |
| [0002](0002-promote-immutable-container-images.md)                           | Promote immutable container images through environments      |
| [0003](0003-bind-authentication-sessions-to-a-surface.md)                    | Bind authentication sessions to one browser surface          |
| [0004](0004-store-sanitized-image-masters-and-variants.md)                   | Store sanitized image masters and generated variants         |
| [0005](0005-dispatch-derived-effects-through-a-durable-outbox.md)            | Dispatch derived effects through a durable outbox            |
| [0006](0006-reveal-minimal-identity-for-exact-contributor-lookup.md)         | Reveal minimal identity for exact Contributor lookup         |
| [0007](0007-assign-contributors-without-attribution-invitations.md)          | Assign Contributors without Attribution Invitations          |
| [0008](0008-accept-unverified-attribution-removal-requests.md)               | Accept unverified Attribution Removal Requests               |
| [0009](0009-publish-roster-names-for-account-contributors.md)                | Publish Roster names for Account-backed Contributors         |
| [0010](0010-search-roster-names-for-contributor-candidates.md)               | Search Roster names for Contributor Candidates               |
| [0011](0011-use-roster-name-as-the-only-account-backed-person-name.md)       | Use Roster Name as the only Account-backed Person name       |
| [0012](0012-enrich-contributor-candidates-with-consented-profile-summary.md) | Enrich Contributor Candidates with profile context           |
| [0013](0013-search-contributor-candidates-by-student-id-prefix.md)           | Search Contributor Candidates by Student ID prefix           |
| [0014](0014-self-hosted-stateful-infrastructure.md)                          | Self-host Postgres, authentication, and media                |
| [0015](0015-deploy-affected-images-directly-to-production.md)                | Deploy affected images directly to production                |
| [0016](0016-use-sentry-cloud-for-error-monitoring.md)                        | Use Sentry Cloud for bounded error monitoring                |
| [0017](0017-separate-collection-frontends-with-shared-core.md)               | Separate collection frontends while sharing Core             |
| [0018](0018-identify-students-by-roster-name-in-instructor-follow-up.md)     | Identify Students by Roster name in Instructor follow-up     |
| [0019](0019-let-instructors-browse-eligible-students-for-group-selection.md) | Let Instructors browse eligible Students for group selection |

Write one decision per file. State the chosen boundary, rejected alternative, primary reason, and accepted cost. Do not use ADRs as implementation logs.
