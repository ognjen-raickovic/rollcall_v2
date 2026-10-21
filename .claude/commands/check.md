---
description: All checks before a commit
---

1. Run `pnpm typecheck`, `pnpm lint` and `pnpm build` from the repo root and fix the errors
2. For every page changed on this branch: open it with Playwright MCP, take screenshots at 375 px and 1440 px, check the console
3. Give me a short report: what passes, what you fixed, what I should look at myself
