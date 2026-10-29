// Display labels only; API/database category identifiers never change.
export const GAME_CATEGORY_LABELS = {
  'trading-card': 'Trading Card Game',
  'role-playing': 'Role-Playing Game',
  'board-game': 'Board Game',
  'social-deduction': 'Social Deduction Game',
} as const

export function gameCategoryLabel(category: string): string {
  return Object.hasOwn(GAME_CATEGORY_LABELS, category)
    ? GAME_CATEGORY_LABELS[category as keyof typeof GAME_CATEGORY_LABELS]
    : 'Tabletop Game'
}
