/**
 * Ανθρώπινη διάρκεια στα Ελληνικά: οι δύο μεγαλύτερες μη μηδενικές μονάδες
 * (π.χ. «2 ημέρες 4 ώρες», «3 ώρες 20 λεπτά», «45 λεπτά»). Ελάχιστο «1 λεπτό».
 */
export function formatDurationGr(from: Date, to: Date): string {
  const totalMins = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 60000))
  const days = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const minutes = totalMins % 60

  const parts: string[] = []
  if (days) parts.push(`${days} ${days === 1 ? 'ημέρα' : 'ημέρες'}`)
  if (hours) parts.push(`${hours} ${hours === 1 ? 'ώρα' : 'ώρες'}`)
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'λεπτό' : 'λεπτά'}`)
  return parts.slice(0, 2).join(' ') || '1 λεπτό'
}
