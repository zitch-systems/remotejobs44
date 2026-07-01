# RemoteJobs44 — Accessibility Audit

**Date:** 2026-07-01
**Scope:** Static source review of semantic HTML, ARIA usage, focus management, color contrast, and keyboard navigability across key pages and shared components.

## Executive Summary

The codebase has strong accessibility fundamentals: real focus-trapping in the modal system, consistent icon-button labeling, a working skip-to-content link, and `prefers-reduced-motion`/`prefers-color-scheme` support throughout. One raw finding from the initial audit pass claimed the skip-to-content link was missing — **this is incorrect and has been removed from this report**; it was verified directly against source (`app/layout.tsx:198`) and exists with correct `sr-only focus:not-sr-only` styling. Two real, low-effort gaps were found and one has already been fixed in this pass.

## Findings

**Good — verified:**
- **Skip-to-content link exists and works** (`app/layout.tsx:198`): `<a href="#main-content" className="sr-only focus:not-sr-only focus:fixed ...">`, targeting `<main id="main-content">` set by `MainShell`.
- **Modal focus management** (`components/ui/Modal.tsx`): focus moves into the dialog on open, is trapped within its focusable elements, `Escape` closes it, and focus is restored to the trigger on close. Uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, with an `sr-only` title fallback when no explicit label is given.
- **Icon-only buttons are labeled**: save/unsave (`aria-label="Save job"`/`"Unsave"`), theme toggle (`aria-label="Toggle theme"`), mobile menu (`aria-label="Toggle menu"` + `aria-expanded`).
- **Semantic landmarks**: stable `<main id="main-content">`, `<nav aria-label="Mobile navigation">` (BottomNav), `<nav aria-label="Member navigation">` (MemberShell), `<form role="search">`.
- **Motion & color-scheme preferences respected**: `@media (prefers-reduced-motion: reduce)` disables decorative animations across `app/globals.css` and `app/deep-ocean.css`; `prefers-color-scheme` drives theme selection.
- **Visible focus states**: `:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px }` applied consistently to inputs, buttons, and selects.

**Fixed in this pass:**
- **Filter-panel toggle had no `aria-expanded`/`aria-controls`** (`components/jobs/JobsFiltersBar.tsx`). *(Note: the raw finding described this as a `<details>` element — it's actually a plain `<button>` toggling a conditionally-rendered `<div>`, verified against source before fixing.)* Screen-reader users previously had no way to hear whether the panel was open. **Fixed**: the toggle button now carries `aria-expanded={showFilters}` and `aria-controls="advanced-filters-panel"`, and the panel `<div>` carries `id="advanced-filters-panel"`. Purely additive — no visual or behavioral change.

**Open — needs a design decision, not auto-fixed:**
- **Secondary-text color contrast** (`app/deep-ocean.css`): `--fg-4: #94a3b8` on `--bg-card: #ffffff` is roughly 2.8–3.1:1, which fails WCAG AA for normal text (needs 4.5:1). `--fg-3: #64748b` on white is roughly 4.0:1 — borderline: it fails strict AA for body text but passes for large text/UI components (3:1 threshold). These tokens are used widely (section subheadings, metadata labels, timestamps) in **both light and dark mode**, where they map to different values, so a fix isn't a simple find-and-replace — it needs to preserve the intended visual hierarchy in both themes. **This is a sitewide, visible design change**, so it's left as a recommendation rather than auto-applied. Suggested starting point: darken `--fg-4` toward the current `--fg-3` value and re-check both themes before shipping.
- **Disabled-button contrast margin**: disabled "Apply" buttons sit right at the AA threshold (~5.5:1 light, ~5.8:1 dark) with little safety margin. Low priority — passes today, just worth a small buffer if the palette is touched anyway.

## Recommendations (Prioritized)

1. **[Done]** Add `aria-expanded`/`aria-controls` to the job-filters toggle — shipped in PR #137.
2. **[Medium, needs sign-off]** Resolve the `--fg-4` contrast failure (and `--fg-3` borderline case) across both light and dark themes. Present as a proposed color change for review before applying — it's visible sitewide.
3. **[Low]** Add a small contrast safety margin to disabled-button text color if the palette is touched for #2 anyway.

No critical accessibility blockers were found; the codebase already implements the patterns (focus traps, aria-labels, reduced-motion, skip links) that are usually the hardest to retrofit.
