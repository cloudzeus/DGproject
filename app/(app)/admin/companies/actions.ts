'use server'

import { revalidatePath } from 'next/cache'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { normalizeAfm, isValidAfm, hasValidChecksum } from '@/lib/companies/afm'
import { aadeLookup, AadeLookupError } from '@/lib/companies/aade'
import { importCompaniesFromSoftOne } from '@/lib/companies/softone-import'
import type { ProjectCompanyRole } from '@prisma/client'

async function requireAdmin(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Μόνο διαχειριστές.')
  }
  return session.user.id
}

const t = (v: string | null | undefined) => (v ?? '').trim() || null

export type CompanyInput = {
  NAME: string
  AFM?: string | null
  IRSDATA?: string | null
  JOBTYPETRD?: string | null
  ADDRESS?: string | null
  ZIP?: string | null
  DISTRICT?: string | null
  CITY?: string | null
  PHONE01?: string | null
  PHONE02?: string | null
  EMAIL?: string | null
  WEBPAGE?: string | null
  appNotes?: string | null
  appLegalForm?: string | null
}

/**
 * Αναζήτηση στην ΑΑΔΕ.
 *
 * `found:false` σημαίνει «το ΑΦΜ δεν υπάρχει στο μητρώο», ΟΧΙ σφάλμα — ο χρήστης
 * συνεχίζει χειροκίνητα. Οι υπάρχουσες εγγραφές με το ίδιο ΑΦΜ επιστρέφονται ως
 * προειδοποίηση αλλά ΔΕΝ μπλοκάρουν: στο ζωντανό SoftOne 56 ΑΦΜ έχουν πάνω από
 * μία καρτέλα (υποκαταστήματα, ιστορικές εγγραφές), οπότε είναι νόμιμη κατάσταση.
 */
export async function lookupByAfm(afmInput: string) {
  await requireAdmin()
  const afm = normalizeAfm(afmInput)
  if (!isValidAfm(afm)) {
    return { ok: false as const, error: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.' }
  }

  const duplicates = await prisma.company.findMany({
    where: { AFM: afm },
    select: { id: true, NAME: true, CODE: true },
    take: 5,
  })

  try {
    const mapped = await aadeLookup(afm)
    return {
      ok: true as const,
      afm,
      found: mapped !== null,
      checksumOk: hasValidChecksum(afm),
      duplicates,
      draft: mapped
        ? {
            ...mapped.company,
            foundingDate: mapped.company.foundingDate?.toISOString() ?? null,
            doyDescr: mapped.doyDescr,
            aadeIsActive: mapped.isActive,
            activities: mapped.activities,
          }
        : null,
    }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof AadeLookupError ? err.message : 'Σφάλμα αναζήτησης ΑΦΜ.',
    }
  }
}

export type CreateCompanyInput = CompanyInput & {
  doyCode?: string | null
  foundingDate?: string | null
  aadeStatus?: string | null
  aadeFirmKind?: string | null
  activities?: { code: string | null; description: string | null; kind: string; order: number }[]
}

export async function createCompany(input: CreateCompanyInput) {
  await requireAdmin()
  const NAME = input.NAME.trim()
  if (NAME.length < 2) return { ok: false as const, error: 'Η επωνυμία είναι πολύ σύντομη.' }
  const AFM = input.AFM ? normalizeAfm(input.AFM) || null : null
  const cameFromAade = Boolean(input.aadeStatus || input.activities?.length)

  const company = await prisma.company.create({
    data: {
      NAME,
      AFM,
      SODTYPE: 13,
      IRSDATA: t(input.IRSDATA),
      JOBTYPETRD: t(input.JOBTYPETRD),
      ADDRESS: t(input.ADDRESS),
      ZIP: t(input.ZIP),
      DISTRICT: t(input.DISTRICT),
      CITY: t(input.CITY),
      PHONE01: t(input.PHONE01),
      PHONE02: t(input.PHONE02),
      EMAIL: t(input.EMAIL),
      WEBPAGE: t(input.WEBPAGE),
      appNotes: t(input.appNotes),
      appLegalForm: t(input.appLegalForm),
      doyCode: t(input.doyCode),
      foundingDate: input.foundingDate ? new Date(input.foundingDate) : null,
      aadeStatus: t(input.aadeStatus),
      aadeFirmKind: t(input.aadeFirmKind),
      aadeSyncedAt: cameFromAade ? new Date() : null,
      activities: input.activities?.length
        ? {
            create: input.activities.map((a) => ({
              code: a.code,
              description: a.description,
              kind: a.kind,
              order: a.order,
            })),
          }
        : undefined,
    },
  })
  revalidatePath('/admin/companies')
  return { ok: true as const, id: company.id }
}

export async function updateCompany(id: string, input: CompanyInput) {
  await requireAdmin()
  const NAME = input.NAME.trim()
  if (NAME.length < 2) return { ok: false as const, error: 'Η επωνυμία είναι πολύ σύντομη.' }
  await prisma.company.update({
    where: { id },
    data: {
      NAME,
      AFM: input.AFM ? normalizeAfm(input.AFM) || null : null,
      IRSDATA: t(input.IRSDATA),
      JOBTYPETRD: t(input.JOBTYPETRD),
      ADDRESS: t(input.ADDRESS),
      ZIP: t(input.ZIP),
      DISTRICT: t(input.DISTRICT),
      CITY: t(input.CITY),
      PHONE01: t(input.PHONE01),
      PHONE02: t(input.PHONE02),
      EMAIL: t(input.EMAIL),
      WEBPAGE: t(input.WEBPAGE),
      appNotes: t(input.appNotes),
    },
  })
  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${id}`)
  return { ok: true as const }
}

export async function setCompanyActive(id: string, active: boolean) {
  await requireAdmin()
  await prisma.company.update({ where: { id }, data: { ISACTIVE: active ? 1 : 0 } })
  revalidatePath('/admin/companies')
  revalidatePath(`/admin/companies/${id}`)
  return { ok: true as const }
}

/** Ξαναδιαβάζει από ΑΑΔΕ και αντικαθιστά τις δραστηριότητες. */
export async function refreshFromAade(id: string) {
  await requireAdmin()
  const company = await prisma.company.findUnique({ where: { id }, select: { AFM: true } })
  if (!company?.AFM) return { ok: false as const, error: 'Η εταιρία δεν έχει ΑΦΜ.' }

  try {
    const mapped = await aadeLookup(company.AFM)
    if (!mapped) return { ok: false as const, error: 'Το ΑΦΜ δεν βρέθηκε στο μητρώο της ΑΑΔΕ.' }

    await prisma.$transaction(async (tx) => {
      await tx.companyActivity.deleteMany({ where: { companyId: id } })
      await tx.company.update({
        where: { id },
        data: {
          ...mapped.company,
          aadeSyncedAt: new Date(),
          activities: {
            create: mapped.activities.map((a) => ({
              code: a.code,
              description: a.description,
              kind: a.kind,
              order: a.order,
            })),
          },
        },
      })
    })
    revalidatePath(`/admin/companies/${id}`)
    return { ok: true as const }
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof AadeLookupError ? err.message : 'Σφάλμα ΑΑΔΕ.',
    }
  }
}

/** Μαζική εισαγωγή από SoftOne. ~5s για 3924 πελάτες χάρη στο batched upsert. */
export async function runSoftOneImport() {
  await requireAdmin()
  try {
    const res = await importCompaniesFromSoftOne()
    revalidatePath('/admin/companies')
    return { ok: true as const, ...res }
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : 'Σφάλμα εισαγωγής.' }
  }
}

export type ContactInput = {
  name: string
  position?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  isPrimary?: boolean
  notes?: string | null
}

export async function createContact(companyId: string, input: ContactInput) {
  await requireAdmin()
  if (!input.name.trim()) return { ok: false as const, error: 'Το όνομα είναι υποχρεωτικό.' }
  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({ where: { companyId }, data: { isPrimary: false } })
    }
    await tx.contact.create({
      data: {
        companyId,
        name: input.name.trim(),
        position: t(input.position),
        email: t(input.email),
        phone: t(input.phone),
        mobile: t(input.mobile),
        isPrimary: Boolean(input.isPrimary),
        notes: t(input.notes),
      },
    })
  })
  revalidatePath(`/admin/companies/${companyId}`)
  return { ok: true as const }
}

export async function updateContact(id: string, input: ContactInput) {
  await requireAdmin()
  if (!input.name.trim()) return { ok: false as const, error: 'Το όνομα είναι υποχρεωτικό.' }
  const contact = await prisma.contact.findUnique({ where: { id }, select: { companyId: true } })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  await prisma.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.contact.updateMany({
        where: { companyId: contact.companyId, id: { not: id } },
        data: { isPrimary: false },
      })
    }
    await tx.contact.update({
      where: { id },
      data: {
        name: input.name.trim(),
        position: t(input.position),
        email: t(input.email),
        phone: t(input.phone),
        mobile: t(input.mobile),
        isPrimary: Boolean(input.isPrimary),
        notes: t(input.notes),
      },
    })
  })
  revalidatePath(`/admin/companies/${contact.companyId}`)
  return { ok: true as const }
}

export async function deleteContact(id: string) {
  await requireAdmin()
  const contact = await prisma.contact.findUnique({ where: { id }, select: { companyId: true } })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  await prisma.contact.delete({ where: { id } })
  revalidatePath(`/admin/companies/${contact.companyId}`)
  return { ok: true as const }
}

/**
 * Δίνει λογαριασμό portal σε μια επαφή, μέσω της υπάρχουσας ροής προσωρινού
 * κωδικού (mustChangePassword). Ο κωδικός επιστρέφεται ΜΙΑ φορά και δεν
 * αποθηκεύεται σε καθαρή μορφή πουθενά.
 */
export async function promoteContactToUser(contactId: string) {
  await requireAdmin()
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { company: { select: { id: true, NAME: true, AFM: true, TRDR: true } } },
  })
  if (!contact) return { ok: false as const, error: 'Δεν βρέθηκε η επαφή.' }
  if (contact.userId) return { ok: false as const, error: 'Η επαφή έχει ήδη λογαριασμό.' }

  const email = contact.email?.trim().toLowerCase()
  if (!email) return { ok: false as const, error: 'Η επαφή χρειάζεται email για να αποκτήσει λογαριασμό.' }
  if (await prisma.user.findUnique({ where: { email } })) {
    return { ok: false as const, error: 'Υπάρχει ήδη χρήστης με αυτό το email.' }
  }

  // Το softoneCustomerId του User είναι @unique — αν το TRDR χρησιμοποιείται ήδη
  // από άλλον χρήστη, το αφήνουμε κενό αντί να σκάσει το insert.
  const trdrTaken = contact.company.TRDR
    ? Boolean(await prisma.user.findFirst({
        where: { softoneCustomerId: contact.company.TRDR },
        select: { id: true },
      }))
    : true

  const tempPassword = randomBytes(9).toString('base64url')
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: contact.name,
        password: passwordHash,
        mustChangePassword: true,
        role: 'viewer',
        userType: 'customer',
        companyId: contact.company.id,
        // Denormalized αντίγραφα, διατηρούνται για μία έκδοση.
        companyName: contact.company.NAME,
        companyAfm: contact.company.AFM,
        softoneCustomerId: trdrTaken ? null : contact.company.TRDR,
      },
    })
    await tx.contact.update({ where: { id: contactId }, data: { userId: user.id } })
  })

  revalidatePath(`/admin/companies/${contact.company.id}`)
  revalidatePath('/admin/users')
  return { ok: true as const, email, tempPassword }
}

/** Λίστα ενεργών εταιριών για pickers. Τοπική αναζήτηση, δεν αγγίζει SoftOne. */
export async function searchCompanies(q: string) {
  await requireAdmin()
  const needle = q.trim()
  return prisma.company.findMany({
    where: {
      ISACTIVE: 1,
      ...(needle ? { OR: [{ NAME: { contains: needle } }, { AFM: { contains: needle } }] } : {}),
    },
    select: { id: true, NAME: true, AFM: true },
    orderBy: { NAME: 'asc' },
    take: 50,
  })
}

/** Ορίζει τον πελάτη ενός έργου. `null` καθαρίζει τη σύνδεση. */
export async function setProjectPrimaryCompany(projectId: string, companyId: string | null) {
  await requireAdmin()
  if (companyId) {
    // Ο πελάτης δεν διπλοεγγράφεται ως ProjectCompany.
    await prisma.projectCompany.deleteMany({ where: { projectId, companyId } })
  }
  await prisma.project.update({ where: { id: projectId }, data: { primaryCompanyId: companyId } })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function addProjectCompany(
  projectId: string,
  companyId: string,
  role: ProjectCompanyRole,
) {
  await requireAdmin()
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { primaryCompanyId: true },
  })
  if (project?.primaryCompanyId === companyId) {
    return { ok: false as const, error: 'Η εταιρία είναι ήδη ο πελάτης του έργου.' }
  }
  const exists = await prisma.projectCompany.findUnique({
    where: { projectId_companyId: { projectId, companyId } },
  })
  if (exists) return { ok: false as const, error: 'Η εταιρία είναι ήδη συνδεδεμένη.' }

  await prisma.projectCompany.create({ data: { projectId, companyId, role } })
  revalidatePath(`/projects/${projectId}`)
  return { ok: true as const }
}

export async function removeProjectCompany(id: string) {
  await requireAdmin()
  const row = await prisma.projectCompany.findUnique({ where: { id }, select: { projectId: true } })
  if (!row) return { ok: false as const, error: 'Δεν βρέθηκε η σύνδεση.' }
  await prisma.projectCompany.delete({ where: { id } })
  revalidatePath(`/projects/${row.projectId}`)
  return { ok: true as const }
}
