# Design System: Student Showcase

`DESIGN.md` is the visual source of truth for the Visitor, Student, and Admin
applications. It records settled design decisions before shared tokens and UI
primitives are extracted. Implementation details remain in the relevant issues.

## 1. Product Expression

Student Showcase uses one coherent visual language with two deliberately
different modes:

- **Visitor: Thai editorial portfolio.** Public discovery should feel like a
  contemporary student exhibition. Layouts give Posters and Work content clear
  visual priority, use generous whitespace, and avoid generic application-card
  compositions.
- **Student and Admin: restrained operational workspaces.** Authenticated
  surfaces retain the same typography, color, and component language while
  increasing information density and making workflow state, feedback, and
  available actions unambiguous.

The contrast between modes is functional, not a rebrand. A Person moving between
surfaces should still recognize one product.

## 2. Confirmed Color Direction

- **Phase 1 theme:** light only. Do not expose a theme switcher or imply dark-mode
  support in any Phase 1 surface.
- **Warm Canvas** (`#F7F7F5`) is the default page background. It gives public
  pages a quiet gallery character without tinting operational content heavily.
- **Clear Surface** (`#FFFFFF`) is the raised or contained content surface. Do not
  wrap every content group in a Surface; elevation must communicate structure.
- **Deep Ink** (`#161616`) is the default text and high-emphasis icon color. It has
  a WCAG contrast ratio of `16.87:1` on Warm Canvas and `18.10:1` on Clear Surface.
- **Muted Ink** (`#62605F`) is secondary text. It has a WCAG contrast ratio of
  `5.83:1` on Warm Canvas and `6.25:1` on Clear Surface.
- **Structural Border** (`#D8D5D2`) separates regions and repeated rows. It is not
  strong enough to be the sole visible boundary of an interactive control.
- **Control Border** (`#8A8582`) defines inputs and other controls when shape is
  the only non-text cue. It has a `3.65:1` contrast ratio on Clear Surface.
- **Subtle Surface** (`#EFEDEA`) groups low-emphasis content without elevation.
- **Disabled Surface** (`#E9E7E4`) with **Disabled Ink** (`#686462`) communicates
  unavailable controls while preserving readable text at `4.74:1` contrast.
- **Showcase Magenta** (`#91007B`) is the single brand Primary. Use it for the
  primary action, selected or active state, focus identity, and restrained brand
  emphasis.
- **Primary Foreground** (`#FFFFFF`) is the text and icon color on Showcase
  Magenta. The pair has a WCAG contrast ratio of `8.43:1` and passes AAA for
  normal text.
- **Primary Soft** (`#F8EDF6`) is the low-emphasis selected background. Showcase
  Magenta content on it has a `7.40:1` contrast ratio.
- Showcase Magenta is intentionally saturated. Do not use it as a large default
  page background and do not introduce a competing saturated accent.
- Status colors remain semantic. Success, warning, destructive, and informational
  states must not be replaced by Primary or communicated by color alone.
- **Success:** `#176B4D` foreground on `#EAF6F0` background.
- **Warning:** `#7A4A00` foreground on `#FFF4D6` background.
- **Destructive:** `#B42318` foreground on `#FDECEA` background.
- **Information:** `#1D4F91` foreground on `#EAF2FF` background.
- Semantic foreground and background pairs have at least `5.75:1` contrast. Pair
  them with text or an icon and text; never use hue as the only signal.
- Dark mode requires a separately approved product scope and a complete semantic
  token, component-state, accessibility, and visual-regression pass. Unverified
  dark tokens are not part of the design system.

## 3. Surface Profiles

### Visitor

- Lead with real Work imagery and content hierarchy.
- Favor editorial rhythm, asymmetric whitespace, and varied but systematic
  compositions over repeated equal cards.
- Keep discovery controls clear and stable even when the surrounding composition
  is expressive.

### Student

- Prioritize authoring flow, field clarity, progress, Review state, and actionable
  feedback.
- Visually distinguish the current draft, pending Revision, Change Request, and
  Published Revision without relying on color alone.

### Admin

- Prioritize scanability, comparison, queue state, audit context, and explicit
  decisions.
- Keep Admin edit and approve-and-publish visually and behaviorally separate.
- Recoverable archive, unpublish, and restore actions must not resemble permanent
  deletion.

## 4. Typography Direction

- **Primary typeface:** `IBM Plex Sans Thai` for Thai and Latin text across the
  Visitor, Student, and Admin applications.
- Load only weight `400` for body text, `500` for controls and labels, and `600`
  for headings and strong emphasis. Do not use or synthesize weight `700`.
- Use one type family to preserve product continuity. Create hierarchy through
  size, weight, spacing, and color instead of introducing an unrelated display
  face.
- Thai readability governs line height, wrapping, control height, and density.
  Latin-only specimens must not be used to approve typography decisions.
- Interfaces must not synthesize unavailable font weights. Load only the weights
  selected for the final type scale.
- Deliver the font through Next.js `IBM_Plex_Sans_Thai` with `thai` and `latin`
  subsets, the selected weights, `display: "swap"`, and one shared CSS variable.
  Do not add a runtime stylesheet request to a third-party font host.
- **Editorial display:** `clamp(40px, 6vw, 72px)` with `1.15` line height.
- **Page title:** `clamp(28px, 4vw, 40px)` with `1.25` line height.
- **Section title:** `24px` with `1.35` line height.
- **Body:** `16px` with `1.7` line height.
- **Dense UI and metadata:** `14px` with `1.6` line height.
- Do not render interface text below `14px`. Verify every role with representative
  Thai strings containing upper and lower marks before approving the final font
  metrics.

## 5. Anti-Slop Baseline

- Every visual treatment must support content hierarchy, workflow state, or
  interaction feedback.
- Do not default to equal-width card grids when hierarchy or comparison requires a
  stronger composition.
- Do not use neon glows, decorative gradients, arbitrary glass effects, or motion
  without product meaning.
- Do not let the expressive Visitor direction reduce form clarity, keyboard
  access, responsive behavior, or readable Thai text.

## 6. Shape Language

- **Controls:** `8px` radius for buttons, inputs, selects, and compact interactive
  elements.
- **Cards and grouped surfaces:** `12px` radius.
- **Large media and major containers:** up to `16px` radius.
- Pill shapes are reserved for Tags, statuses, and compact filter tokens whose
  shape communicates that they are atomic values. Do not turn ordinary buttons,
  inputs, navigation items, or cards into pills.
- Preserve the same radius role across all surfaces. Do not vary roundness merely
  to make Visitor feel more decorative.

## 7. Responsive Grid

- Use a shared responsive grid: `4` columns on mobile, `8` columns on tablet, and
  `12` columns on desktop.
- Contain primary page layouts at a maximum width of `1440px` and center the
  container when the viewport is wider.
- Use fluid inline gutters of `clamp(16px, 4vw, 48px)`.
- Use CSS Grid for page composition. Do not simulate columns with percentage
  arithmetic or absolute positioning.
- A grid defines alignment, not mandatory visual density. Forms and sequential
  workflows should use the columns they need rather than stretching to fill the
  container.
- Mobile layouts must not introduce horizontal page scrolling. Data-heavy content
  must use a deliberately designed responsive representation or a bounded,
  labelled scroll region.

## 8. Motion and Reduced Motion

- Motion is restrained and functional. It should clarify cause and effect,
  hierarchy changes, or spatial continuity rather than decorate idle UI.
- Use durations between `150ms` and `240ms`: faster for direct control feedback,
  slower for panels and meaningful state transitions.
- Animate only compositor-friendly `transform` and `opacity` properties. Do not
  animate layout dimensions or positions such as `width`, `height`, `top`, or
  `left`.
- Do not add perpetual decorative animation, bouncing prompts, or staggered
  reveals that delay access to functional lists.
- Under `prefers-reduced-motion: reduce`, remove non-essential movement and make
  state changes immediate without hiding information or feedback.

## 9. Elevation

- The default hierarchy is nearly flat. Use spacing, alignment, borders, and
  surface contrast before adding shadow.
- Default cards, buttons, inputs, and page sections do not float and must not use
  decorative shadows.
- Use shadow only when an element physically overlays another layer, such as a
  popover, dialog, menu, or sticky element passing over scrolling content.
- Sticky regions should prefer a separating border; introduce shadow only while
  content actually moves beneath them.
- Shadows must remain neutral and diffused. No colored, glowing, or high-contrast
  drop shadows.

## 10. Spacing

- Use a `4px` base unit and the shared spacing scale `4`, `8`, `12`, `16`, `24`,
  `32`, `48`, `64`, and `96px`.
- Select spacing by relationship: tighter values bind a label to its control or
  metadata to its subject; larger values separate groups, sections, and changes
  in narrative rhythm.
- Do not introduce arbitrary spacing values. An exception requires a documented
  optical-alignment or platform constraint and must not become a second scale.
- Responsive spacing may interpolate between values on this scale. It must not
  grow without an upper bound.

## 11. Iconography

- Use `lucide-react` as the single interface icon family across Visitor, Student,
  and Admin.
- Use `16px` for compact controls and metadata, `20px` for standard controls, and
  `24px` for prominent navigation or communication. Use the standard `2px`
  stroke unless optical correction is required for one glyph.
- Do not mix icon families or substitute emoji, text glyphs, or arbitrary SVGs for
  interface icons.
- Familiar decorative icons are hidden from assistive technology when adjacent
  text already supplies the name. Every icon-only control requires an accessible
  name; a tooltip may reinforce that name but cannot replace it.
- Prefer a text label for consequential or unfamiliar actions. Never rely on icon
  shape or color alone for Review, publication, archive, unpublish, or restore.

## 12. Component Interaction States

- Interactive targets are at least `44px` by `44px` on touch layouts. Admin may
  use `36px` compact controls on pointer-based desktop layouts, but the touch and
  mobile representation returns to at least `44px`.
- Use a `2px` Showcase Magenta focus-visible ring with a `2px` offset. Focus must
  remain visible against Canvas, Surface, Primary, and semantic backgrounds.
- Use at most one Primary action in an action group. Secondary actions use an
  outline treatment, tertiary actions use a restrained ghost treatment, and
  destructive actions use the Destructive semantic treatment.
- Form labels sit above their controls. Optional helper text follows the label or
  control, and validation errors appear directly below the affected control. Do
  not use floating labels or placeholder text as a label replacement.
- Every interactive component defines default, hover, active, focus-visible,
  disabled, and loading states. Touch behavior must not depend on hover.
- Loading state prevents duplicate submission, retains the control's accessible
  name, and preserves its dimensions so surrounding layout does not shift.

## 13. Surface Navigation and Density

- **Visitor:** use content-first top navigation without a sidebar. Present Public
  Catalog filters inline on desktop and in an accessible modal sheet on mobile.
- **Student:** use a balanced workspace with a `224px` desktop sidebar and a
  labelled navigation drawer on mobile. Keep primary form content to approximately
  `720px` so long Thai labels, help, and errors remain readable.
- **Admin:** use a dense workspace with a `256px` desktop sidebar, breadcrumb, and
  utility bar. Compact controls and tables are desktop-only density choices and
  must reflow for touch layouts.
- Do not use mobile bottom navigation in Phase 1. The workflows and their Thai
  labels need room to grow without collapsing into icon-only navigation.
- Navigation always uses explicit Thai labels. Icons support scanning but never
  replace the label.

## 14. Loading, Empty, Success, and Error States

- List and card loading states use skeletons that match the dimensions and rhythm
  of the eventual content. Do not replace a structured page with one generic
  spinner.
- Uploads, Roster Batch imports, and other measurable work show determinate
  progress. Use an indeterminate indicator only when progress cannot be measured.
- Empty states distinguish first use, zero search results, and unavailable or
  unauthorized content. First use teaches the next valid action; zero results
  offers a way to revise or clear filters; unavailable content explains the safe
  next step without leaking private data.
- Validation errors appear directly below the affected field. After submission,
  provide an accessible error summary that links or moves focus to invalid fields.
- Preserve valid input after recoverable errors. Error copy states what happened
  in user language and gives an actionable next step; do not use generic messages
  such as "Something went wrong".
- Reflect successful state durably in the page. A toast may reinforce a completed
  action but must not be the only confirmation or the only place to find its
  result.

## 15. Generated Imagery

- **Primary image language:** art-directed 3D editorial illustration. Phase 1
  does not use photorealistic AI-generated Student imagery.
- Use realistic human proportions, matte tactile materials, soft natural light,
  warm-neutral environments, and restrained Showcase Magenta details. The result
  should feel like a composed editorial still rather than a mascot render.
- Avoid oversized cartoon eyes, exaggerated childlike proportions, glossy plastic
  skin, toy-like staging, or overly cute expressions.
- Real Work Posters and Gallery images provide documentary authenticity. The 3D
  image layer supports product narrative without pretending to document real
  People, Works, or events.
- AI-generated raster imagery may support the editorial identity when a section
  has a real communication purpose for it. Generate project-bound assets through
  the built-in GPT image-generation workflow and save approved outputs in the
  repository.
- Generated imagery is art-directed content, not default filler. Each image needs
  a defined role, composition, crop, subject, lighting, palette, and avoid list.
  Do not add an image merely to occupy empty space.
- Generated people must be clearly university-age adults presented as fictional
  Students in varied, respectful academic and creative contexts. Avoid children,
  stereotypes, celebrity likenesses, institutional logos, generated UI text, and
  watermarks.
- Generated imagery must never replace or impersonate real product data: Public
  Profile photos, Work Posters, Gallery images, upload previews, Review evidence,
  roster records, and attribution remain user-provided or system-owned content.
- Good uses include a public landing-page composition, onboarding guidance, a
  campaign-like editorial break, or a genuinely helpful empty-state illustration.
- Provide meaningful alternative text when an image communicates content and an
  empty alternative when it is purely decorative. Crops must remain intentional
  across responsive layouts.
- Do not mix unrelated generated aesthetics across pages. One image language must
  be selected and encoded in a reusable prompt specification before producing the
  final asset set.

### Reusable GPT image prompt

```text
Use case: stylized-concept
Asset type: [hero / onboarding / editorial break / empty state]
Primary request: fictional university-age Thai Students [specific action]
Scene/backdrop: [purpose-specific academic or creative environment]
Style/medium: premium 3D editorial illustration, matte tactile materials,
realistic human proportions, restrained detail
Composition/framing: [required crop], intentional negative space only where UI needs it
Lighting/mood: soft natural daylight, calm, curious, capable
Color palette: #F7F7F5 and warm neutrals, #91007B as a small accent
Constraints: diverse respectful adult Students, natural poses and hands,
no text, no logos, no watermark, no real-person likeness
Avoid: children, oversized eyes, childlike proportions, glossy plastic skin,
toy staging, stereotypes, fake UI, neon colors, decorative clutter
```

After the first image is approved, use it as the style-reference anchor for later
assets. Label its role explicitly in each generation request, preserve the settled
style constraints, and vary one intentional scene or composition variable at a
time.
