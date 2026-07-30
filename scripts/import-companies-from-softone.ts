/**
 * Μαζική εισαγωγή πελατών από το SoftOne στο Company model.
 *
 * Τρέξε: npx tsx --env-file=.env scripts/import-companies-from-softone.ts
 *
 * Είναι ασφαλές να ξανατρέξει: το upsert γίνεται με κλειδί το TRDR και η
 * ενημέρωση δεν αντικαθιστά ποτέ υπάρχουσα τιμή με κενή.
 */
import { importCompaniesFromSoftOne } from '@/lib/companies/softone-import'
import { prisma } from '@/lib/prisma'

async function main() {
  console.log('Ανάκτηση πελατών από SoftOne…')
  let lastPct = -1
  const res = await importCompaniesFromSoftOne((done, total) => {
    const pct = Math.floor((done / total) * 100)
    if (pct >= lastPct + 10) {
      lastPct = pct
      console.log(`  ${String(pct).padStart(3)}%  (${done}/${total})`)
    }
  })

  console.log('\nΟλοκληρώθηκε:')
  console.log(`  στρατηγική    : ${res.strategy}`)
  console.log(`  ανακτήθηκαν   : ${res.fetched}`)
  console.log(`  νέες          : ${res.created}`)
  console.log(`  ενημερώθηκαν  : ${res.updated}`)
  console.log(`  παραλείφθηκαν : ${res.skipped}`)

  const total = await prisma.company.count()
  console.log(`\nΣύνολο εταιριών στη βάση: ${total}`)
}

main()
  .catch((e) => {
    console.error('ERROR:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
