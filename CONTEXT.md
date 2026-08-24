# Student Showcase

The Student Showcase preserves and publishes work from สาขาวิทยาการคอมพิวเตอร์และนวัตกรรมการพัฒนาซอฟต์แวร์ while keeping access credentials separate from long-lived academic profiles and attribution.

## Language

**Person**:
A human represented in the showcase. A Person may hold one or more roles over time.
_Avoid_: User, account

**Account**:
A credential that lets a Person authenticate. Removing an Account does not remove the Person's public profile or attributed work.
_Avoid_: Profile, identity

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

**Alumnus**:
A former Student whose submission access has ended while their public profile and attributed work remain available read-only.
_Avoid_: Expired student, deleted student

**Student Roster**:
The university-provided list that establishes who is eligible to activate a Student Account.
_Avoid_: User import, account list

**Roster Batch**:
A Student Roster file imported for one Entry Year. Importing the same rows again leaves existing records unchanged and reports the outcome.
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
The eight academic years beginning with a Student's Entry Year during which they may use Student capabilities. An Admin may extend this period for an individual; after it ends, the Student becomes an Alumnus.
_Avoid_: Account age, graduation date

**Public Profile**:
A Student-approved public representation containing their Display Name, optional photo, bio and external links, Entry Year, and Published Works. It never exposes their Student ID or Account data.
_Avoid_: Student record, account profile

**Profile Consent**:
A Student's explicit choice to make their Public Profile visible. Importing a Student Roster never grants this consent.
_Avoid_: Account activation, publication approval

**Study Year**:
A Student's academic level when they contributed to a Work. It is historical attribution, not the Student's current profile state.
_Avoid_: Current year, grade

**Academic Period**:
The Buddhist academic year and Semester (`1`, `2`, or `Summer`) in which a Work was completed or first submitted for publication.
_Avoid_: Entry Year, creation timestamp

## Work Publication

**Work**:
An enduring portfolio item attributed to one or more People. A Work may be revised without immediately changing what Visitors see.
_Avoid_: Project, post, submission

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
A proposed representation of a Work containing its content at a particular point in the review process.
_Avoid_: Edit, update

**Published Revision**:
The most recently approved Revision shown to Visitors. It remains public while a newer Revision is being reviewed or corrected.
_Avoid_: Current draft, live edit

**Submitter**:
The single Student responsible for preparing and sending a Work's Revisions for review.
_Avoid_: Owner, creator

**Contributor**:
A Person credited for a Work after accepting its attribution. A Contributor does not gain revision rights.
_Avoid_: Collaborator, editor, member

**Attribution Invitation**:
A request for a Person to accept or reject being credited as a Contributor to a Work.
_Avoid_: Account link, member link

**Review**:
An Admin's evaluation of a Revision that ends in approval or a Change Request.
_Avoid_: Moderation, verification

**Change Request**:
A Review decision that withholds publication and gives the Submitter a required reason and actionable feedback.
_Avoid_: Rejection, failure

**Archived Work**:
A retained but inactive Work that is not publicly visible. Archival is reversible and is not deletion.
_Avoid_: Deleted work, hidden revision

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
The Published Works and consented Public Profiles available to Visitors through browsing, search, and filters.
_Avoid_: Gallery, database

**Tag**:
A normalized discovery label attached to a Work, with at most five Tags per Work. Its popularity is the number of Published Works using it.
_Avoid_: Category, keyword

**Provisional Tag**:
A newly entered Tag that has not yet appeared on an approved Work. It becomes publicly discoverable when a Work using it is approved.
_Avoid_: Draft tag, pending category

**Star**:
An External Member's saved association with a Work. A Member may Star a Work at most once.
_Avoid_: Like, favorite

**Comment**:
An External Member's moderated discussion entry attached to a Work and retained across its Revisions.
_Avoid_: Review feedback, annotation
