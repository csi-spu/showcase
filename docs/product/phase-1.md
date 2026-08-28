# Phase 1

## Goal

Publish reviewed Student Works and consented Public Profiles through a Thai-first experience, with long-lived attribution separated from temporary Account access.

## Included

- Annual CSV Student Roster import with additive idempotency, row-level errors, conflict reporting, and downloadable error CSV.
- Student ID/password login through Core and Supabase Auth.
- Forced password change on first login and after Admin reset.
- Eight-academic-year Student Access Period with individual Admin extension.
- Public Profile opt-in consent.
- Work drafts, one Submitter, Contributor attribution invitations, immutable Revisions, Review, Change Requests, publication, archive, removal request, unpublish, and restore.
- Course Work, Competition Entry, and Academic Article categories using one generic Work field set.
- Academic Period with Buddhist year and semester `1`, `2`, or `summer`.
- Required portrait Poster, up to three Gallery images, up to three YouTube/TikTok links, generic labeled links, and at most five Tags.
- Public search, filtering, sorting, stable URLs, and in-app notifications.

## Excluded follow-ups

- External Member registration or login.
- Stars and Comments, including database tables and placeholder UI.
- English UI content. Translation structure exists, but Phase 1 ships Thai messages only.
- Per-language Work fields. User-entered content is one Thai, English, or mixed value chosen by the author.
- Course catalog or category-specific field schemas.

## Student Roster constraints

- A Roster Batch is a UTF-8 CSV of at most 5 MB and 10,000 data rows. Its header is exactly `student_id`, `first_name_th`, and `last_name_th`; missing or unknown columns reject the file before processing.
- Student ID is exactly eight ASCII digits. Its first two digits must match the last two digits of the selected Buddhist Entry Year.
- Thai first and last names are required, trimmed, and Unicode-normalized for comparison. Every occurrence of a duplicated Student ID within one file is a row error so processing does not depend on row order.
- The Admin selects one Entry Year for the Roster Batch. Core derives each row's Entry Year from its Student ID and rejects a row when the derived year does not match the selected year.
- Processing an accepted row idempotently creates or retains its Person, Student, Account, and private synthetic Supabase Auth identity. First login never provisions an Account.
- Core persists the Roster Batch before processing it asynchronously in bounded, retry-safe chunks. Its visible lifecycle is `pending`, `processing`, `completed`, or `completed_with_errors`.
- Reaching a completed state creates one idempotent in-app notification for the Admin who uploaded the Roster Batch; notification presentation remains part of the notification specification.
- A row whose Student ID matches the same normalized Thai first and last names is idempotently unchanged. Different names create a Roster Conflict without changing the existing Person or Account.
- An Admin resolves a Roster Conflict through an audited `keep_existing` or `accept_incoming_name` action. Accepting the incoming name requires a reason and changes only the Person's private Thai first and last names.
- Conflict resolution never reassigns a Student ID, Account, Public Profile, or Work history to another Person.
- Valid rows succeed independently of invalid rows. Retryable Supabase failures remain retryable until bounded retries are exhausted; exhausted rows receive a stable provider error and do not report success until both persistence and Auth identity provisioning converge.
- The authorized error CSV contains row number, Student ID, stable error code, and Thai error message. Raw uploads and row-level error details are private, never logged, and deleted 30 days after completion; non-sensitive batch counts and audit records are retained.
- Phase 1 does not collect email addresses or phone numbers from the Student Roster.

## Authentication and session constraints

- Core maps Student ID to a private synthetic Supabase Auth identity. Student ID, credentials, provider tokens, and session secrets never enter URLs, public responses, logs, analytics, or client-readable storage.
- Accepted Roster rows receive the Phase 1 initial password equal to Student ID. Admin Accounts are provisioned only through an audited operational flow with a random temporary password; Phase 1 has no public Account signup.
- Initial and reset credentials create only a restricted session whose sole mutation is changing the password. A successful change rotates the session and enables capabilities allowed by current role and Student Access Period.
- A chosen password contains 12 to 128 characters, differs from Student ID and the current or temporary password, and is not trimmed or Unicode-normalized. Phase 1 imposes no composition rule that would reject passphrases.
- Student and Admin use separate audience-bound Authentication Sessions even when one Person has both roles. Core stores provider credentials and authoritative session state server-side; the browser receives only an opaque session identifier through the matching frontend BFF.
- Each authenticated frontend owns a separate host-only cookie on its own hostname with `Secure`, `HttpOnly`, and `SameSite=Lax` in shared environments. Cookies are never scoped to Core or the parent domain, and provider credentials never leave Core.
- Student sessions expire after 24 hours of inactivity or 7 days absolute. Admin sessions expire after 30 minutes of inactivity or 8 hours absolute. Provider token refresh rotates behind Core without extending the absolute limit.
- Authenticated reads use React Server Components and mutations use Server Actions on the matching frontend. The browser never calls Core authentication endpoints directly. Next.js validates Server Action Origin against Host, and each Server Action validates untrusted form input before forwarding it to Core.
- Internal Core authentication endpoints require the matching frontend BFF secret and an opaque bearer session token where applicable. These credentials are server-only, never exposed through `NEXT_PUBLIC_` variables, browser responses, logs, or client bundles.
- Login and recovery failures are generic to the browser and rate-limited by both source and Account-safe key. Authorization reads current server-owned Account, role, audience, forced-change, and access state on every request.
- Logout revokes the current audience session. Password change and Admin password reset revoke every older session for the affected Account; reset returns a random temporary password to the authorized Admin once and never sends or logs it.
- Admin multi-factor authentication and self-service password recovery are explicit follow-ups, not Phase 1 behavior.

## Student Access Period constraints

- Core owns one audited Current Academic Year value, advanced by an authorized Admin according to the university's published academic calendar. A missing value makes Core unready and denies Student mutations.
- The default Student Access Period includes Entry Year through `Entry Year + 7`. Student capabilities are available only when Current Academic Year is inside that inclusive range.
- An Admin may move an individual ending Academic Year later, never earlier, through an audited action with a required reason. Repeating the same extension is idempotent.
- Outside the effective Student Access Period, the Person is an Alumnus. Their Account may still authenticate for read-only access and Profile Consent management, but every Student mutation is denied server-side.
- Extending the ending Academic Year re-enables Student capabilities on the next authorized request without recreating Person, Account, Public Profile, or attribution data.

## Public Profile and Profile Consent constraints

- Roster processing creates no Public Profile and grants no Profile Consent. An authenticated Student creates a private Public Profile draft with a required Display Name, optional photo, optional bio, and at most five labeled external links; Entry Year and Published Works are derived, read-only fields.
- Display Name is 1 to 100 characters after trimming; bio is at most 500 characters; link labels are 1 to 50 characters and URLs are absolute HTTPS URLs of at most 2,048 characters.
- The optional photo is a server-inspected JPEG, PNG, or WebP of at most 2 MB, square, and between 512 and 4,096 pixels per side. It uses the same authorize-presign-finalize boundary as other private uploads.
- Granting Profile Consent requires a complete valid draft and records the consent-text version and UTC grant time. The Public Profile becomes visible through its stable random public identifier only after that transaction commits.
- Editing a consented Public Profile updates public reads and invalidates affected caches after the edit commits; Profile changes do not enter the Work Review lifecycle.
- Withdrawing Profile Consent records the UTC withdrawal time, immediately removes the profile from authoritative public queries, dispatches cache invalidation within the documented propagation bounds, and makes its public endpoint return not found. It retains the Public Profile, stable identifier, consent history, and attribution history.
- An Alumnus cannot edit Public Profile content but may withdraw or grant Profile Consent for the retained profile. Regranting exposes the current retained profile without changing its stable public identifier.
- Profile Consent alone never publishes or unpublishes a Work. Accepted Attribution Snapshots remain on a Published Revision when Profile Consent is absent or withdrawn; only the Public Profile link disappears.

## Work authoring constraints

- Work is the stable aggregate. It owns an immutable random public identifier, one immutable Submitter relationship, an activity state of `active` or `archived`, a publication state of `never_published`, `published`, or `unpublished`, and an optional Published Revision pointer.
- An active Work has at most one private mutable Work Draft and one pending Revision. Only the Submitter may edit or submit the Work Draft; Submitter transfer and collaborative editing are outside Phase 1.
- A Work Draft uses optimistic versioning and records the Published Revision it is based on. Advancing that pointer makes the Draft stale; its content is retained but it must be explicitly rebased before submission.
- Every Work Category uses the same fields: Title, Summary, plain-text Description, Work Category, Academic Period, generic labeled links, Tags, Poster, ordered Gallery, Video Links, and Attribution Snapshots. Phase 1 has no category-specific fields or rich HTML.
- Title is 1–150 characters, Summary 1–300, and Description 1–10,000 after trimming. User-entered values may be Thai, English, or mixed.
- Academic Period year is a Buddhist year from the Submitter's Entry Year through Current Academic Year; Semester is `1`, `2`, or `summer`.
- A Work has at most five unique generic links. Labels are 1–50 characters and URLs are absolute HTTPS URLs of at most 2,048 characters.
- A Work has at most five optional Tags of 1–50 characters. Core normalizes identity using Unicode NFKC, trimming, collapsed whitespace, and Unicode case folding while retaining a display label. A new Tag remains provisional until an approved Revision publishes it.
- The random public identifier exists from Work creation but no Draft, pending Revision, Change Request, or private metadata enters public queries. Public slug and catalog URL behavior belong to the Public Catalog specification.
- The authenticated Student workspace lists the Submitter's Works through a cursor-paginated private query. It shows activity, authoring or Review, and publication state separately; only an eligible Student receives edit or management actions.

## Contributor and attribution constraints

- Contributor identity is either an existing Person with an Account or an External Contributor without one. An Account-backed Contributor may be a Student, Alumnus, or Admin; neither mode grants Work edit or submission rights.
- Account-backed Student and Alumnus invitations use exact private Student ID lookup in a request body, rate limiting, and a generic sender response. Student ID and roster identity are not returned to the Submitter. A recipient reached through an external link who authenticates with an existing Account is attached to that existing Person instead of creating a duplicate External Contributor.
- An External Contributor invitation records a proposed Attribution Name, contribution role, and optional affiliation, then issues a high-entropy link for out-of-band delivery. It creates no Account or External Member.
- External invitation tokens are stored only as hashes, expire after 14 days, never enter logs or analytics, use a no-referrer page, and are exchanged once for a short-lived HttpOnly invitation session.
- Attribution Invitation states are `pending`, `accepted`, `rejected`, `revoked`, or `expired`, with at most one pending invitation per Person and Work. All pending invitations must resolve before submission.
- A Work has at most 20 accepted or pending Contributors, excluding its Submitter. Rejected, revoked, expired, and withdrawn invitations do not consume an active Contributor slot; retained invitation history remains cursor-paginated.
- Acceptance requires the Person to confirm Attribution Name and public-attribution consent. Account-backed Students and Alumni also confirm Study Year from `1` through `8`; the system may suggest but never silently derive it. External Contributors instead confirm contribution role and optional affiliation.
- Submitter confirms their own Attribution Name and Study Year at submission. Student Roster names never become public attribution automatically.
- Attribution Snapshots remain public on a Published Revision independently of Profile Consent. A consented Public Profile adds a link; absence or withdrawal removes only that link.
- Pending invitations may be revoked and accepted Contributors may withdraw before submission. Adding or removing attribution after publication requires a new Revision and Review.
- On acceptance, an External Contributor receives a recovery code displayed once and stored only as a hash. It establishes a short-lived invitation session for a later Attribution Removal Request; an Admin handles lost-code recovery. The verified request leads to an audited correction Revision.
- External People are not automatically deduplicated by name. Claiming or merging an External Contributor, self-service attribution disputes, and External Member capabilities are follow-ups.

## Revision, Review, and publication constraints

- Submission requires a complete valid Work Draft, finalized required media, resolved invitations, current Student access, an expected Draft version, and an idempotency key. Equivalent retries cannot create duplicate pending Revisions.
- Revisions receive monotonic numbers within a Work and immutable content snapshots. Their lifecycle is `pending_review`, `changes_requested`, `approved`, or `withdrawn`; public visibility is determined by the Work's Published Revision pointer and publication state.
- A Submitter may withdraw a pending Revision before a Review decision. The snapshot remains retained and seeds a new Work Draft.
- The cursor-paginated Review queue has no claim or assignment in Phase 1. Any authorized Admin may decide a pending Revision; optimistic concurrency makes the first valid decision win and later attempts fail as stale.
- A Change Request requires a reason code of `content`, `attribution`, `media`, `links_tags`, `policy`, or `other`, plus 10–2,000 characters of actionable feedback. It never changes public content and seeds a new Work Draft without modifying the reviewed Revision.
- Approval and publication are one atomic `approve_and_publish` action that records the approved Review, advances the Published Revision pointer, activates provisional Tags, sets publication state to `published`, and emits cache-invalidation and notification events.
- The current Published Revision remains public while a newer Revision is drafted, pending, or changes-requested. Replacing any published field, attribution, or media requires a newer Revision.
- Significant transitions use expected versions and idempotency keys. Revisions, Reviews, invitation outcomes, Attribution Snapshots, requests, and audit records are retained and returned only through bounded queries.

## Work media processing constraints

- Poster is required at submission; Gallery has zero to three ordered images. Accepted uploads are JPEG, PNG, or WebP up to 5 MB, 320–8,192 pixels per side, and at most 40 megapixels. Animated WebP and APNG are rejected.
- Poster is portrait with ratio 2:3 through 4:5. Width below the recommended 1,200 pixels produces a warning, not rejection. Gallery permits either orientation.
- Raw uploads go directly to a private quarantine prefix through a Core-authorized presigned operation. Optional client compression improves upload UX but never replaces authoritative server processing.
- Media lifecycle is `pending_upload`, `uploaded`, `processing`, `ready`, or `rejected`. Only `ready` media may attach to a Work Draft.
- An isolated, resource-bounded processor verifies decoded content, applies orientation, rejects invalid dimensions or animation, strips metadata, converts to sRGB, and rewrites every accepted image before permanent storage.
- Successful processing stores a sanitized WebP master without upscaling, limited to 2,560 pixels on its longest side. Opaque images use visually high-quality lossy encoding; images with transparency use lossless WebP. The raw quarantine object is then deleted.
- Poster variants have widths 480, 768, and 1,200 pixels. Gallery variants have widths 640, 1,280, and 1,920 pixels. Variants larger than the master are omitted; metadata records dimensions, bytes, format, and content hash.
- Object keys are immutable random identifiers containing no original filename, Student ID, or user-entered value. Phase 1 performs no cross-upload global deduplication.
- Pending quarantine objects expire after 24 hours and processed media not attached to a Draft expires after seven days through application cleanup with R2 lifecycle rules as a backstop. Media attached to a Draft or Revision is retained.
- Revision snapshots reference immutable processed media. Controlled public delivery exposes only variants referenced by the Published Revision of an active, published Work; archive, unpublish, or pointer changes revoke old public eligibility and emit cache invalidation.
- Video Links accept at most three unique HTTPS YouTube or TikTok URLs, normalize them to provider and video ID, and never store upload bytes or arbitrary embed HTML.

## Admin correction and recovery constraints

- An Admin correction requires a reason and meaningful diff audit metadata and creates a new immutable pending Revision based on the latest Published Revision. Saving never publishes; a separate `approve_and_publish` action is required and may be performed by the same Admin.
- Admin correction is blocked while another Revision is pending. A private Student Work Draft does not block it, but publication of the correction makes that Draft stale and requires rebase.
- A Submitter may create one pending Removal Request for the current Published Revision with a reason and may cancel it. Admin approval changes publication state to `unpublished`; decline requires a reason. The request itself never changes visibility.
- Unpublishing retains an active Work and its Published Revision pointer while excluding it from public queries. Review may continue, and a later `approve_and_publish` explicitly republishes a corrected Revision.
- An Admin may restore the unchanged retained Published Revision through an audited action. Content changes require a new Revision and Review.
- Archiving requires an Admin reason, sets Work activity to `archived` and publication state to `unpublished`, removes it from public queries, and blocks authoring, submission, and Review decisions while retaining Drafts, the Published Revision pointer, and pending Revisions.
- Restoring an Archived Work makes it active and private. Restoring publication is always a separate explicit action.
- Visibility transactions exclude content from authoritative public queries immediately and emit idempotent cache-purge events. Cache propagation follows the Public cache constraints below.
- Normal API and UI flows provide no hard delete. Bulk moderation, permanent deletion, and automated attribution-dispute resolution are follow-ups.

## Public Catalog constraints

- The Public Catalog exposes separate Work and People collections. Work detail uses `/works/{workPublicId}`, Public Profile detail uses `/people/{profilePublicId}`, and Tag discovery uses `/tags/{tagPublicId}`. Every identifier is random and stable; title, Display Name, and Tag label changes never change these URLs.
- A Work enters public reads only while it is active and published. Every listing, search result, detail response, cache entry, sitemap entry, and media response uses only its current Published Revision.
- A Public Profile enters People search and detail only while Profile Consent is granted, including when it has no Published Works. Withdrawing consent, archiving or unpublishing a Work, and unknown identifiers all produce the same not-found behavior without revealing retained private state.
- Work search covers Title with the highest relevance weight, then Summary, Tags, Attribution Names, and plain-text Description. It never searches Draft content, link URLs, provider video IDs, Student IDs, or Account data. People search covers Display Name only.
- Search input is trimmed, Unicode NFKC-normalized, whitespace-collapsed, and Unicode case-folded. A non-empty query contains 2–100 characters. Phase 1 supports indexed normalized partial matching without synonym expansion, stemming, typo correction, or language-specific word segmentation.
- With a Work query, results sort by relevance, then the current Published Revision publication time and Work public identifier. Without a query, Work sorting is `recent`, `academic_period`, or `title`; `recent` is the default. People results sort by relevance when searching and otherwise by Display Name, with stable public identifiers as the final tie-breaker.
- Work filters are Work Category, Academic Period year, Semester, and up to five Tags. Multiple Categories use OR, multiple Tags use AND, and year and Semester each accept at most one value. People filtering accepts one Entry Year. Duplicate filter values collapse; unknown fields, invalid values, or conflicting cursor state return a stable validation error.
- Catalog pagination uses an integrity-protected opaque cursor bound to the normalized collection, query, filters, and sort. Page size defaults to 24 and is at most 48. Responses provide `hasNextPage` and no exact total count; cursors do not expire but remain subject to normal keyset movement as public data changes.
- Work cards contain Poster, Title, Summary, Work Category, Academic Period, Attribution Names, and Tags. People cards contain Display Name, optional photo, Entry Year, and current Published Work count. Public responses never expose private identifiers or distinguish why an entity is unavailable.
- Query, filter, and sort state uses normalized query parameters with defaults and duplicates omitted. Base Catalog, active Work, consented Public Profile, and active Tag pages may be indexed; free-text search, filtered variants, and cursor pages are `noindex,follow` to prevent duplicate and unbounded crawl space.
- Public queries use bounded indexed Postgres capabilities and stable timeouts. Dependency or query timeout returns a stable unavailable error and never falls back to an unindexed scan. A separate search service requires measured query-plan or latency evidence and is outside Phase 1.

## Tag discovery constraints

- Tag identity follows the Work authoring normalization rule. The display label in the first Revision that publishes a Provisional Tag becomes its canonical Phase 1 label; automated aliases, synonyms, merges, and display-label administration are follow-ups.
- A Provisional Tag is visible only to its relevant Submitter and to Admin during Review. It activates atomically with `approve_and_publish` and cannot enter public autocomplete, filters, counts, URLs, or caches before that transaction.
- Tag popularity is the exact count of distinct active, published Works whose current Published Revision contains the Tag. Drafts, pending or historical Revisions, unpublished or archived Works, and duplicate references never contribute.
- An activated Tag whose popularity becomes zero remains retained but disappears from public discovery until a current Published Revision uses it again. Popular Tag results contain at most 20 entries sorted by count descending, canonical display label, and stable public identifier.
- Core owns idempotent Tag-count projections and reconciliation. Publication, pointer change, unpublish, archive, and publication restore update affected counts and emit invalidation without making historical Revision content mutable.

## Public cache constraints

- Core applies publication and Profile Consent eligibility before any response becomes cacheable. Public responses do not vary by Authentication Session or cookie; authenticated and private endpoints never share their cache namespace.
- Work, Public Profile, and active Tag detail, base Catalog pages, and first-page Catalog requests without free text or multiple Tags may use shared caching. Free-text search, multiple-Tag combinations, cursor pages, Notifications, and unread counts use `no-store` to prevent cache-key explosion or private-data exposure.
- Cacheable HTML and API responses use browser revalidation with `max-age=0`, CDN `s-maxage=60, stale-while-revalidate=60`, and validators such as ETag. Controlled public media permits at most five minutes of shared caching, supports revalidation, and does not use `stale-if-error`.
- Publication, Published Revision change, unpublish, archive, publication restore, Public Profile edit, Profile Consent grant or withdrawal, and Tag-count change invalidate affected entity pages, Catalog collections, Tags, sitemap entries, and media eligibility.
- The authoritative Core projection changes in the visibility transaction. Cache purge targets completion within 30 seconds; the maximum documented edge staleness is two minutes for HTML/API and five minutes for media. Product copy must not claim atomic CDN removal.
- Core records invalidation intent durably with the domain transition. Provider failure never rolls back the authoritative transition; idempotent dispatch retries until success, exposes observable lag, and alerts when the propagation target is missed.

## Homepage and Catalog image performance constraints

- The Visitor Homepage initially returns at most 12 recent Work cards and only their Poster media. It never includes Gallery assets or preloads hidden carousel content. More Works require cursor navigation or an explicit load-more action that does not begin before user intent.
- Visitor renders Work grids as Server Components by default and does not require client JavaScript merely to display cards or images. Interactive continuation stays at the smallest boundary and preserves an accessible link-based path.
- Every Poster reserves its intrinsic portrait ratio before loading and exposes its processed dimensions, available variant widths, and a small dominant-color placeholder. Image load or failure must not shift surrounding content.
- Visitor uses `next/image` with an accurate breakpoint-specific `sizes` value and a project loader that maps the requested width to the smallest sufficient pre-generated Poster variant. The controlled media origin serves the existing WebP variants; Visitor does not perform duplicate per-request resizing or re-encoding.
- At most one measured LCP Poster per rendered layout may load eagerly or with high fetch priority and must be discoverable in server-rendered HTML. Every other Poster uses native lazy loading. Preload and high priority are never applied to an entire grid.
- When media uses a separate controlled origin, Visitor may preconnect to that origin only when measurement shows material LCP connection delay. R2 objects remain private behind the controlled origin and existing eligibility, CDN caching, and invalidation rules.
- Homepage field performance targets at the 75th percentile, measured separately for mobile and desktop, are LCP at most 2.5 seconds, CLS at most 0.1, and INP at most 200 milliseconds. Browser verification checks selected variant widths, initial request count, lazy-loading behavior, reserved layout, and absence of Gallery downloads.

## Notification constraints

- A Notification belongs to one Account-backed Person and one audience, `student` or `admin`. A Person with both roles has separate audience-bound inboxes. Student-surface notifications remain available to an Alumnus with a valid read-only Account session.
- Notification delivery is event-driven and idempotent. A durable event, recipient, audience, and type combination creates at most one Notification; normal delivery targets 60 seconds. Workflow state remains authoritative when delivery is delayed or unavailable.
- Roster Batch completion notifies the uploading Admin. Extending a Student Access Period notifies the affected Student or Alumnus. An Account-backed Attribution Invitation or revocation notifies its recipient; acceptance, rejection, expiry, or pre-submission withdrawal notifies the Submitter.
- A Change Request and creation of an Admin correction notify the Submitter. Publication or republication notifies the Submitter and accepted Account-backed Contributors. Removal Request decisions notify the Submitter; archive or unpublish also notifies accepted Account-backed Contributors. Restore to active/private notifies only the Submitter, while restored publication notifies the same recipients as publication.
- Revision submission or withdrawal, Profile Consent changes, and other actions already confirmed to their actor create no self-notification. New Review, Removal Request, and Attribution Removal Request work enters bounded Admin queues instead of notifying every Admin.
- External Contributors receive no in-app Notification because they have no Account or application capability. Invitation and recovery sessions expose only their authorized current status. Password reset remains an audited credential-handoff flow rather than a Notification.
- A Notification stores a stable type, safe structured parameters, an internal authorized target, creation time, and nullable read time. Thai copy renders from translation keys. It never embeds Student ID, credentials, bearer tokens, full Review feedback, sensitive Roster data, or an arbitrary URL.
- New Notifications are unread. Mark-one and mark-all-existing operations are actor-authorized and idempotent; mark-all uses a server cutoff so concurrent arrivals remain unread. Phase 1 does not support marking unread again, dismissing, deleting, preferences, or category filters.
- Inbox pagination is newest first with an opaque cursor, defaults to 20, and is at most 50. It supports `all` and `unread` views and an exact retained unread count. An inaccessible target leaves the Notification visible with an unavailable state and never bypasses current authorization.
- Notifications expire 180 days after creation regardless of read state. Expiration does not delete the originating domain event or audit record. Notification APIs and unread counts are private, audience-authorized, and `no-store`.
- Core creates Notification delivery intent through a durable outbox. Consumers are retry-safe and horizontally safe, uniqueness prevents duplicates, and reconciliation detects missed or drifted projections.

## Publication invariants

- First Revision is not public before approval.
- Last Published Revision remains public while another Revision is pending.
- Change Request always contains reason and actionable feedback.
- Admin edits are audited and require a separate explicit publication action.
- Roster import never publishes a profile.
- Student ID never appears in public responses or URLs.
- Normal UI has no hard delete.

## Media constraints

| Media   | Requirement                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------- |
| Poster  | required, portrait ratio 2:3 through 4:5, JPEG/PNG/WebP, max 5 MB, recommended minimum 1200 px, no crop |
| Gallery | max 3 images, JPEG/PNG/WebP, max 5 MB each                                                              |
| Video   | max 3 provider URLs, YouTube or TikTok only                                                             |
| Tags    | max 5 normalized Tags per Work                                                                          |

Replacing published media creates a Revision and requires Review.
