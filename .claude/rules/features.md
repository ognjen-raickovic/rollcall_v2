---
paths:
  - "frontend/src/features/**"
---

# Features

- A feature `src/features/<name>/` has only the subfolders it needs: `api/`, `components/`, `hooks/`, `types.ts`
- A feature does not import from another feature (neither via `@/features/...` nor via a relative path)
- A feature does not import from `src/app`; routes use features, never the other way around
- It may import from `src/components`, `src/lib` and its own folder (relatively, e.g. `../api/use-listings`)
- If two features need the same code, move it to `src/lib` or `src/components` and combine the features in a route in `src/app/routes`
- No barrel `index.ts` files: import the file you need directly
- `pnpm lint` checks these boundaries
