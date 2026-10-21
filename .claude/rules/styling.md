---
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/index.css"
---

# Styling

- Only Tailwind classes and tokens from `src/index.css` (`bg-primary`, `text-muted-foreground`), no hex or rgb values
- Spacing on the scale: 1, 2, 3, 4, 6, 8, 12, 16 (Tailwind units)
- Mobile-first: base classes are for phones, `md:` and `lg:` for larger screens
- Every image has `alt`, every input has a `label` or `aria-label`
- Focus must be visible (`focus-visible:`), text contrast at least 4.5:1
- Add a new token to `src/index.css` first and describe it in DESIGN.md
