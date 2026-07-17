/** Mask emails and phone numbers in free text before it reaches the LLM or the KB. */
export function maskPII(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]{2,}/g, '[email]')
    .replace(/(?:\+?\d[\d\s\-()]{8,}\d)/g, '[τηλέφωνο]')
}
