# Student Showcase

The Student Showcase preserves and publishes work from สาขาวิทยาการคอมพิวเตอร์และนวัตกรรมการพัฒนาซอฟต์แวร์ while keeping access credentials separate from long-lived academic profiles and attribution.

## Language

**Person**:
A human represented in the showcase. A Person may hold one or more roles over time.
_Avoid_: User, account

**Account**:
A credential that lets a Person authenticate. Removing an Account does not remove the Person's public profile or attributed work.
_Avoid_: Profile, identity

**Authentication Session**:
A Core-owned, server-side session bound to either the Student or Admin surface. A Person who uses both surfaces has separate sessions, and authorization is resolved from current server-owned role and Account state on every request.
_Avoid_: Supabase token, shared browser session

**Student**:
A Person currently entitled to submit and revise work.
_Avoid_: Learner, student account

**Admin**:
A Person entitled to review submissions and manage showcase content.
_Avoid_: Teacher, staff account

**Visitor**:
An unauthenticated Person viewing public profiles and work. Visitor is an access state, not a role.
_Avoid_: Guest role, public user

**External Member**:
An authenticated non-Student Person who may Star or Comment on a Work when those follow-up capabilities are introduced.
_Avoid_: Visitor, guest account

**External Contributor**:
A Person without an Account who accepts a private invitation to receive public attribution on a Work. An External Contributor is not an External Member and receives no authenticated application capabilities.
_Avoid_: Guest account, External Member

**Alumnus**:
A former Student whose submission access has ended while their public profile and attributed work remain available read-only.
_Avoid_: Expired student, deleted student

**Student Roster**:
The university-provided list that establishes who is eligible to activate a Student Account.
_Avoid_: User import, account list

**Roster Batch**:
A Student Roster file imported for one Entry Year and processed asynchronously in bounded, retry-safe chunks. Importing the same rows again leaves existing records unchanged and reports the outcome.
_Avoid_: Account batch, CSV upload

**Roster Conflict**:
A Roster Batch row whose Student ID matches an existing Student but whose identity data disagrees and therefore requires Admin resolution.
_Avoid_: Duplicate, overwrite

**Student ID**:
The institutional identifier assigned to a Student. Its leading digits encode the Entry Year under the university's numbering convention.
_Avoid_: Account ID, profile ID

**Entry Year**:
The Buddhist academic year in which a Student began studying, derived from their Student ID when the Student Roster is imported. It identifies a cohort, not the Student's current Study Year.
_Avoid_: Current year, graduation year

**Student Access Period**:
The eight inclusive academic years beginning with a Student's Entry Year during which they may use Student capabilities. An Admin may extend the ending Academic Year for an individual; outside the period, the Student becomes an Alumnus while their Account remains available for read-only access and Profile Consent management.
_Avoid_: Account age, graduation date

**Current Academic Year**:
The Admin-controlled Buddhist academic year used to evaluate Student Access Periods. It follows the university's published academic calendar rather than a hard-coded calendar date.
_Avoid_: Current year, server year

**Public Profile**:
A Student-approved public representation containing their Display Name, optional photo, bio and external links, Entry Year, and Published Works. It has a stable random public identifier, remains private until Profile Consent is granted, and never exposes Student ID or Account data.
_Avoid_: Student record, account profile

**Profile Consent**:
A Person's explicit, versioned choice to make their Public Profile visible. Importing a Student Roster and activating an Account never grant this consent; the Person may withdraw it even after becoming an Alumnus.
_Avoid_: Account activation, publication approval

**Study Year**:
A Student's academic level when they contributed to a Work. It is historical attribution, not the Student's current profile state.
_Avoid_: Current year, grade

**Academic Period**:
The Buddhist academic year and Semester (`1`, `2`, or `summer`) in which a Work was completed or first submitted for publication.
_Avoid_: Entry Year, creation timestamp

## Work Publication

**Work**:
An enduring portfolio item attributed to one or more People. A Work may be revised without immediately changing what Visitors see.
_Avoid_: Project, post, submission

**Work Draft**:
The single private, mutable representation of an active Work that its Submitter is preparing for Review. A Work Draft references the Published Revision it is based on and must be rebased when that pointer changes.
_Avoid_: Revision, pending publication

**Poster**:
The required portrait image representing a Work in public listings and its detail page.
_Avoid_: Thumbnail, cover

**Gallery**:
Up to three supplemental images shown with a Work in addition to its Poster.
_Avoid_: Attachments, media library

**Video Link**:
A YouTube or TikTok URL associated with a Work. Videos remain hosted by their provider.
_Avoid_: Video upload, embed code

**Revision**:
A numbered, immutable snapshot created from a complete Work Draft and submitted for Review. A corrected or withdrawn Revision is never edited; later content creates a new Revision.
_Avoid_: Edit, update

**Published Revision**:
The most recently approved Revision shown to Visitors. It remains public while a newer Revision is being reviewed or corrected.
_Avoid_: Current draft, live edit

**Submitter**:
The single Student responsible for preparing and sending a Work's Revisions for review.
_Avoid_: Owner, creator

**Contributor**:
A Person, with or without an Account, credited for a Work after explicitly accepting its public attribution. A Contributor does not gain revision rights.
_Avoid_: Collaborator, editor, member

**Attribution Invitation**:
A request for a Person to accept or reject being publicly credited as a Contributor to a Work. A Person with an Account responds through their session; an External Contributor responds through a private token exchange without creating an Account.
_Avoid_: Account link, member link

**Attribution Snapshot**:
The immutable public Attribution Name, contribution role, optional affiliation, and applicable Study Year captured for the Submitter and accepted Contributors in a Revision. It remains public with an approved Work independently of Public Profile visibility.
_Avoid_: Public Profile, roster name

**Attribution Removal Request**:
An External Contributor's request to remove their attribution from a Published Revision. It retains the existing publication until an audited Admin correction is reviewed and published.
_Avoid_: Profile withdrawal, Work Removal Request

**Review**:
An Admin's evaluation of a Revision that ends in approval or a Change Request.
_Avoid_: Moderation, verification

**Change Request**:
A Review decision that withholds publication and gives the Submitter a required reason and actionable feedback.
_Avoid_: Rejection, failure

**Archived Work**:
A retained but inactive Work that is not publicly visible. Archival is reversible and is not deletion.
_Avoid_: Deleted work, hidden revision

**Unpublished Work**:
An active Work whose approved Published Revision pointer is retained but suspended from public visibility. It remains editable and may be restored or replaced through explicit Admin actions.
_Avoid_: Archived Work, deleted Work

**Removal Request**:
A Submitter's request for an Admin to remove a Published Revision from public view without deleting its history.
_Avoid_: Delete request, archive

## Work Categories

**Work Category**:
The primary academic setting in which a Work originated: Course Work, Competition Entry, or Academic Article.
_Avoid_: Work type, tag

**Course Work**:
A Work produced as part of a taught course.
_Avoid_: Class project, assignment

**Competition Entry**:
A Work entered into a competitive event, whether or not it received an award.
_Avoid_: Award, contest project

**Academic Article**:
A scholarly article produced by one or more Students, whether or not it has been formally published.
_Avoid_: Research project, publication

## Discovery

**Public Catalog**:
The active Published Works and consented Public Profiles available to Visitors through separate Work and People collections, browsing, search, and bounded filters. It never includes private Work Drafts, pending Revisions, unpublished or archived Works, or withdrawn Public Profiles.
_Avoid_: Gallery, database

**Tag**:
A normalized discovery label with a stable random public identifier attached to a Work, with at most five Tags per Work. Its canonical display label comes from its first publication, and its popularity is the number of active Published Works whose current Published Revision uses it.
_Avoid_: Category, keyword

**Provisional Tag**:
A newly entered Tag that has not yet appeared on an approved Work. It remains private to the relevant Submitter and Review until `approve_and_publish` activates it; an activated Tag with no current Published Works is retained but hidden from discovery.
_Avoid_: Draft tag, pending category

## Notifications

**Notification**:
A private, audience-bound in-app record derived from a durable domain event for an Account-backed Person. It contains a structured type, safe parameters, an authorized target, creation time, and optional read time; it expires after 180 days and is not an audit record.
_Avoid_: Activity log, audit event, email

**Star**:
An External Member's saved association with a Work. A Member may Star a Work at most once.
_Avoid_: Like, favorite

**Comment**:
An External Member's moderated discussion entry attached to a Work and retained across its Revisions.
_Avoid_: Review feedback, annotation
