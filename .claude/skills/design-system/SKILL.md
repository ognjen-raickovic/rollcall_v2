---
name: design-system
description: This project's design rules. Use when creating or changing any UI component, page or style, and when the user asks for something to "look better".
---

# Design system

1. Read frontend/DESIGN.md before any UI change. If it is empty, suggest filling it in together first.
2. Colors, fonts and radius come only from tokens in `frontend/src/index.css`. If a new value is needed, add a token, not a hex value in code.
3. Hierarchy: one clear main element per screen (a heading or an action), everything else is secondary to it.
4. Typography: at most two heading sizes per screen; body text 14–16 px; lines up to ~70 characters.
5. Spacing: large gaps between sections (`py-12` or more), small gaps inside groups (`gap-2` to `gap-4`).
6. Restraint: no gradients, shadows or animations without a reason; icons only from `lucide-react`, never emoji.
7. When the user asks for a new screen or a redesign, offer 2–3 different variants on temporary routes (`/v1`, `/v2`, `/v3`) with a screenshot of each, then delete the ones they do not pick.
8. Always finish with screenshots at 375 px and 1440 px via Playwright MCP.
