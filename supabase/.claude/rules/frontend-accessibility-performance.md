---
paths:
  - "app/**/*.tsx"
  - "components/**"
  - "**/*.css"
  - "public/**"
---

# Frontend, accessibility, and performance rules

## Accessibility baseline

- Klimr targets WCAG 2.2 Level AA for complete supported user journeys, not isolated components.
- Prefer semantic native HTML. ARIA changes semantics only; it does not add keyboard behavior or functionality.
- Every interactive control has an accessible name, correct role/state/value, visible focus, and complete keyboard interaction.
- Use real buttons for actions and links for navigation. Do not make `div`/`span` clickable unless an exceptional reviewed widget implements the complete pattern.
- Keep DOM and visual focus order logical. Manage focus for dialogs, menus, route changes, errors, and dynamic additions without trapping or losing it.
- Form controls have persistent programmatic labels, instructions, autocomplete/input purpose where applicable, and errors linked to the relevant field. Do not rely on placeholder, color, or toast alone.
- Announce important async status/errors without excessive interruption. Authentication must offer accessible alternatives where applicable.
- Provide text alternatives for meaningful images and captions/transcripts for relevant media. Decorative content is hidden from assistive technology.
- Preserve 200% zoom, 400% reflow, orientation, text spacing, and usable responsive layouts without loss of content/function.
- Meet WCAG contrast requirements in every state. Never encode meaning by color alone.
- WCAG's AA target-size minimum is 24 by 24 CSS pixels or a valid exception. Klimr's stricter design target is at least 44 by 44 CSS pixels for primary touch controls and adequate spacing elsewhere.
- Motion, animation, auto-play, and time limits need pause/reduce/extend controls as applicable; honor `prefers-reduced-motion`.

## Accessibility verification

- Run automated accessibility checks, but do not claim conformance from automation alone.
- Manually test keyboard-only use, focus visibility/order, screen reader names/states, zoom/reflow, touch targets, contrast, errors, loading, and modal behavior.
- Test complete journeys at supported mobile/desktop breakpoints with real content extremes and localization expansion where relevant.
- When implementing a composite widget, follow the WAI-ARIA Authoring Practices keyboard model and test it; bad ARIA is worse than native semantics.

## Performance and user experience

- Use Server Components by default and minimize the client JavaScript boundary.
- Avoid request waterfalls; fetch independent data in parallel while preserving authorization and rate/cost bounds.
- Paginate/virtualize large lists and bound search/feed results. Never ship an unbounded dataset to the browser for filtering.
- Optimize images with correct dimensions, responsive sources, lazy loading below the fold, and priority only for the actual LCP element. Prevent layout shifts.
- Limit third-party scripts, fonts, trackers, and embeds. Every addition needs purpose, performance/privacy/security review, and failure behavior.
- Provide streaming/loading boundaries deliberately; avoid flashes that expose private state or mutate during render.
- Measure field Core Web Vitals separately for mobile and desktop at the 75th percentile. Klimr's minimum "good" targets are LCP <= 2.5 seconds, INP <= 200 milliseconds, and CLS <= 0.1.
- Set route/page bundle budgets and user-centered journey budgets in CI and field monitoring. Averages alone are insufficient.
- Treat slow networks, low-end devices, offline/reconnect, stale data, double submission, and navigation interruption as normal failure cases.

## Safe UI behavior

- Disable or debounce UI only for usability; the server still enforces replay, rate, and concurrency safety.
- Confirm destructive/high-impact actions and show scope. Provide recovery/undo where the product policy allows it.
- Do not render success before durable acceptance. If work is asynchronous, label it pending and provide observable reconciliation.
- Error messages must help recovery without leaking security-sensitive facts.
- Test empty, partial, stale, permission-denied, unavailable, and long-content states, not only seeded happy paths.
