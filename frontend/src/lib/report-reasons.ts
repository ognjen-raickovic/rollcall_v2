export const REPORT_REASONS = ['inappropriate', 'spam', 'harassment', 'unsafe', 'other'] as const
export function hasReportControls(value: string, multiline: boolean) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return (code < 32 && !(multiline && [9, 10, 13].includes(code))) || code === 127
  })
}
export const REPORT_REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  inappropriate: 'Inappropriate or abusive content',
  spam: 'Spam or misleading information',
  harassment: 'Harassment or discrimination',
  unsafe: 'Unsafe or suspicious event',
  other: 'Other',
}
