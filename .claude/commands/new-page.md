---
description: New page with a route, all states and a visual check
argument-hint: <page description>
---

Build a page: $ARGUMENTS

1. Read frontend/DESIGN.md, frontend/src/app/router.tsx, the existing routes in frontend/src/app/routes/ and the features in frontend/src/features/
2. If it is unclear what the page should contain, ask me first (one question at a time)
3. Write a short plan and wait for my approval
4. The page is a file in frontend/src/app/routes/ that only combines feature components and layout; data and components live in frontend/src/features/<name>/ (if the feature does not exist, suggest `/new-feature`)
5. Use components from frontend/src/components/ui, and add new ones with `pnpm dlx shadcn@latest add` inside frontend/
6. Add loading, empty and error states
7. Register the route in frontend/src/app/router.tsx and add a link to the navigation (frontend/src/components/layout/app-layout.tsx) if it makes sense
8. Run `pnpm typecheck` and `pnpm lint` from the repo root
9. Open the page with Playwright MCP, take screenshots at 375 px and 1440 px, compare them with DESIGN.md and fix what is off
