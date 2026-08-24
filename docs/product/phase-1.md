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
- Academic Period with Buddhist year and semester `1`, `2`, or `Summer`.
- Required portrait Poster, up to three Gallery images, up to three YouTube/TikTok links, generic labeled links, and at most five Tags.
- Public search, filtering, sorting, stable URLs, and in-app notifications.

## Excluded follow-ups

- External Member registration or login.
- Stars and Comments, including database tables and placeholder UI.
- English UI content. Translation structure exists, but Phase 1 ships Thai messages only.
- Per-language Work fields. User-entered content is one Thai, English, or mixed value chosen by the author.
- Course catalog or category-specific field schemas.

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
