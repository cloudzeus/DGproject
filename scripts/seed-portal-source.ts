/**
 * Δημιουργεί το TicketSource με code `PORTAL`.
 *
 * Τα tickets που υποβάλλονται από το portal δένονται σε δικό τους source, ώστε
 * το triage, το dedupe και το rate limiting να δουλεύουν αμετάβλητα — αλλάζει
 * μόνο ο τρόπος αυθεντικοποίησης (session αντί για API key).
 *
 * Τρέξε μία φορά: npx tsx --env-file=.env scripts/seed-portal-source.ts
 * Είναι ασφαλές να ξανατρέξει.
 */
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

async function main() {
  const existing = await prisma.ticketSource.findUnique({ where: { code: 'PORTAL' } })
  if (existing) {
    console.log(`Το PORTAL source υπάρχει ήδη (${existing.id}), active=${existing.active}`)
    return
  }

  // Το secret δεν χρησιμοποιείται ποτέ — η αυθεντικοποίηση γίνεται με session —
  // αλλά το πεδίο είναι NOT NULL, οπότε βάζουμε τυχαία τιμή που δεν εκτυπώνεται.
  const created = await prisma.ticketSource.create({
    data: {
      code: 'PORTAL',
      name: 'Portal πελατών',
      secretHash: await bcrypt.hash(randomBytes(24).toString('base64url'), 10),
      originUrls: JSON.stringify([]),
      active: true,
    },
  })
  console.log('Δημιουργήθηκε PORTAL source:', created.id)
}

main()
  .catch((e) => {
    console.error('ERROR:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
