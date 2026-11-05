# Shared UI

`SiteHeader` and `SiteFooter` use the consuming application's MUI theme. They
provide no theme provider, routing, data fetching, or application policy. Export
them from `@repo/ui` or `@repo/ui/site-header` and `@repo/ui/site-footer`.

Both components and Called Together's site layout are Server Components by
default: they have no `"use client"` directive or React state hooks. The header
renders its links on the server and passes them as children into a small private
`HeaderNavigation` Client Component. Only that wrapper handles viewport matching,
the mobile toggle, keyboard events, and focus. The footer has no client wrapper
of its own. MUI and Next.js Link can still have their own client boundaries;
navigation links remain in the initial server-rendered HTML.

```tsx
import { SiteFooter, SiteHeader } from "@repo/ui";

<>
  <SiteHeader
    brand="Example Studio"
    brandHref="/"
    links={[{ label: "Overview", href: "/#overview", active: true }]}
  />
  <main id="main-content" tabIndex={-1}>
    <section id="overview">Page content</section>
  </main>
  <SiteFooter brand="Example Studio" copyright="© Example Studio" />
</>;
```

The header requires `brand` text and `brandHref`. Optional `logo` is decorative
content; do not put anchors or interactive controls inside it. `links` accepts
`SiteNavigationLink[]` (`label`, `href`, optional `active`). Active links receive
`aria-current="page"`; the application determines active state. Optional `actions`
is a slot for application-provided controls. `navigationLabel` defaults to
"Main navigation" and can distinguish navigation landmarks on the same page.
`menuLabels` optionally supplies `{ open, close }` accessible names for the icon
buttons, including localized names.

From the theme's md breakpoint, navigation links appear directly and wrap.
Below md, a three-line icon button opens a modal drawer. Enter/Space opens it,
Tab stays within the panel, and Escape, close, outside click or link activation
closes it and restores focus. Only the current presentation is rendered, so
hidden navigation does not add keyboard stops. Without links, controls are omitted.

The footer accepts optional `brand` text or custom React content, `description`,
`linkGroups` (`heading` and `links`), `copyright`, and `additionalContent`. Each
nonempty link group is a navigation landmark labeled by its heading. Group
headings should be distinct. Empty groups and absent optional content are omitted.
Copyright text, including any year, is supplied by the application.

Both components accept `LinkComponent` (typed as `SiteLinkRenderer`). It defaults
to `"a"`. A custom renderer must render **one anchor**, forward the anchor props
(including `href`, `children`, `className`, `aria-current`, and event handlers),
and support its anchor ref when used. Do not return a link wrapping another anchor.
For Next.js, pass `Link` directly from a Server Component:

```tsx
import NextLink from "next/link";
import { SiteHeader } from "@repo/ui";

export function Header() {
  return (
    <SiteHeader brand="Example Studio" brandHref="/" LinkComponent={NextLink} />
  );
}
```

The private `SiteAnchor` helper renders a custom renderer as an element inside a
styled span, preserving a single anchor. It avoids passing a server function as
MUI's client-side `component` prop. Footer brand content can similarly render
`<NextLink href="/">...</NextLink>` directly.

`SiteLinkRendererProps`, `SiteLinkRenderer`, and `SiteNavigationLink` are exported
as types from `@repo/ui`. Keep navigation definitions and slot content in the app.
For custom footer branding that links home, supply your own anchor/Link as `brand`;
the footer does not wrap it in another link.

The page layout owns the main landmark, skip link, and footer placement. Called
Together's `app/site-layout.tsx` demonstrates a focusable main target and a flex
column with `minHeight: "100dvh"` and a growing main area. Components never fix
the footer or header to the viewport. Shared stories demonstrate minimal and long
content, actions, active links, a small-screen menu, and optional footer groups.

Layouts start in one column and enhance at the consuming theme's `sm` / `md`
breakpoints. Navigation anchors, brand links, and the mobile toggle target at
least 44px in both dimensions; supplied action controls must also remain usable
and fit their available width. Links wrap, stay visibly underlined, and have an
explicit theme-colored keyboard focus outline. Open panels scroll vertically when navigation exceeds the available height.
Mobile320, Tablet, and Desktop stories exercise longer fictional Spanish content
at 320, 768, and 1280px. Text size must also be checked at 200%; do not clamp text,
hide overflow, or replace descriptive link text with hover-only interactions.

The header's mobile presentation is the server-rendered default. Meaningful
navigation anchors are rendered even when the panel is closed; they are
not fetched or created only after a click. Semantic landmarks and actual group
headings describe the content; typography is not a reason to add headings.
The application owns page metadata, canonical URLs, indexing directives, and
any justified structured data. Shared header/footer components add none of
these, and no JSON-LD is needed merely to label a header or footer. Do not invent
organization, author, credential, or social-account information.

Responsive stories cover mobile, tablet, and desktop layouts with longer Spanish
labels. Check them at normal and 200% text sizing, including keyboard focus,
panel scrolling, and 44px touch targets. Consumer themes and supplied slots need
their own accessibility checks.

## ResourceCard

Import from `@repo/ui` or `@repo/ui/resource-card`:

```tsx
<ResourceCard
  title="Sample resource"
  href="/resources/sample"
  headingLevel={3}
  resourceType="Article"
  description="A supplied description."
  author="Supplied author display text"
  language="English"
  supportingText="8 min read"
/>
```

Only title and href are required. Optional image accepts { src, alt }; provide
meaningful alternative text or an empty alt for a decorative image. Images use
16:9 cropping; select an appropriate source. The default heading is h2; choose
h2–h6 for the page hierarchy. LinkComponent follows the same single-anchor
contract as SiteHeader, including direct Next.js Link support. Links navigate
in the current tab, including external URLs, matching the existing convention.

The card displays supplied text without fetching data, checking permissions or
publication status, calculating reading time, formatting sizes, choosing routes,
or emitting page metadata/JSON-LD. Those responsibilities belong to the app.
There is one title link; images and metadata are not separate interactive targets.
Cards inherit the consumer theme, wrap text without truncation, and have natural
height. A containing grid can stretch cards to align rows. Fictional Storybook
examples demonstrate the component; the live homepage retains its topic cards.
