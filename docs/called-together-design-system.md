# Called Together visual standards

Scope: `apps/called-together`. Source of truth: `app/design-tokens.ts` and
`app/theme.ts`. Shared UI remains presentational and consumes each app's theme;
keep routes, copy, metadata, and structured data in the application.

## Color and surfaces

| Role                 | Token   |
| -------------------- | ------- |
| Page                 | #FAF9F6 |
| Surface              | #FFFFFF |
| Primary text         | #202B33 |
| Secondary text       | #52616B |
| Brand / focus        | #235D59 |
| Brand hover          | #194642 |
| Subtle brand surface | #EDF4F1 |
| Decorative border    | #DDE3DF |

Use semantic theme success, warning, and error colors. Borders are decorative,
never the only indicator of a control or state. White text on brand buttons;
brand, primary, and secondary text on the light surfaces. Check contrast when
introducing new combinations. Cards use 12px corners, controls 8px; reserve shadows
for menus and dialogs. Primary actions are filled; secondary actions outlined or
text. Prose links are underlined. Keep visible focus and 44px minimum touch targets.

## Typography

System sans-serif only. Body and controls: 1rem / 1.6; metadata: 0.875rem / 1.5.
Article body uses the exported `tokens.article`: 1.125rem / 1.75, maximum 68ch.
Headings use weight 600 and line height 1.2. H1: 2.25rem mobile / 3rem desktop;
H2: 1.75rem / 2.25rem; H3: 1.375rem / 1.625rem. Desktop type starts at md.
Choose heading elements by document hierarchy, independently of visual variants.
The homepage's supporting sentence uses 1.375rem for introductory emphasis.

## Layout and spacing

Use MUI's unchanged breakpoints (sm 600, md 900, lg 1200px) and 8px spacing base.
Preferred spacing: 4, 8, 12, 16, 24, 32, 48, 64, 80, 96px.
Semantic layout tokens: inline 8, related 16, stack 24, group 32px;
section padding 48px mobile / 80px from md; card padding 16px / 24px from sm;
grid gap 16px / 24px from sm / 32px from md.

All page regions use the theme's MUI Container: centered, 75rem (1200px) maximum
including gutters; gutters are 16px below sm, 24px from sm, 32px from lg.
Place future reading columns inside this container with `tokens.article`.
Start grids with one column; the homepage uses three from md. Avoid fixed content
heights and truncation. Header stays in normal flow, minimum 64px mobile / 80px
from md (48/64px inner height plus 8px top and bottom padding). It grows for long
labels. The app's flex shell keeps the footer at the bottom of short pages.
Shared header/footer use neutral spacing defaults and inherit branded container,
colors, and typography from the consumer. Preserve their existing props.

## Accessibility and provisional content

Retain the skip link, semantic landmarks, meaningful server-rendered navigation,
keyboard focus trapping/restoration in menus, and existing working anchors.
Preview copy and navigation are provisional; do not invent routes, claims, or
structured data. Keep long labels wrapping, including Spanish-length labels.
Verify widths 320, 390, 768, and 1440px, 200% text size, and keyboard navigation.
Use transitions around 150�200ms and respect reduced motion (the theme provides
a global reduction rule). No horizontal scrolling at 320px.

## Reference examples

### Admin workspace

The private workspace uses a 200px desktop navigation column from `md`; below
`md`, navigation moves to a labelled MUI drawer with keyboard dismissal and focus
restoration. This fixed column is a deliberate exception for short navigation
labels; content always uses `minmax(0, 1fr)`. Preserve the 75rem theme container,
gutters, typography and colors.

Use a compact wrapping context/account/action bar, breadcrumbs, then one H1 and
description/primary action. Spacing is 16/24px around the shell, 24/32px between
columns, 24px between panels, and 16/24px within 12px-radius outlined panels.
Forms use one column on mobile and 44px touch targets. Wrap names/addresses rather
than adding a horizontally scrolling account table. Counts describe current
states; no decorative charts. Existing controls stay inline without dead detail
links. Storybook **Called Together / Admin workspace** defines review states.

### Public pages

The homepage hero uses a wider introduction (3:2 columns from md), 32px gap
below md / 64px from md, and 24px panel padding / 32px from md. Its introduction
uses the requested 18px article size. The panel consumes `palette.secondary.light`
(the subtle brand surface). Shared hero spacing uses theme spacing units and its
surface radius is 1.5 times the theme's 8px control radius (12px).

Storybook's **Called Together / Design system** contains tokens, typography,
spacing, container rules, controls, surfaces, and the composed homepage.
Generic shared component stories remain brand-neutral. Reuse the tokens instead
of introducing page-specific spacing constants; document justified exceptions here.
