'use server'

import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin(): Promise<string> {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== 'admin') {
    throw new Error('Μόνο διαχειριστές.')
  }
  return session.user.id
}

const CODE_RE = /^[A-Z0-9_-]{2,32}$/

/**
 * Create a ticket source. Returns the plaintext secret EXACTLY ONCE —
 * only the bcrypt hash is stored.
 */
export async function createTicketSource(input: {
  code: string
  name: string
  originUrls: string[]
  defaultProjectId: string | null
}) {
  await requireAdmin()
  const code = input.code.trim().toUpperCase()
  if (!CODE_RE.test(code)) {
    return { ok: false as const, error: 'Ο κωδικός πρέπει να είναι 2-32 λατινικοί χαρακτήρες/αριθμοί (A-Z, 0-9, -, _).' }
  }
  const name = input.name.trim()
  if (name.length < 2) return { ok: false as const, error: 'Το όνομα είναι πολύ σύντομο.' }
  const exists = await prisma.ticketSource.findUnique({ where: { code } })
  if (exists) return { ok: false as const, error: 'Υπάρχει ήδη πηγή με αυτόν τον κωδικό.' }

  const secret = randomBytes(24).toString('base64url')
  await prisma.ticketSource.create({
    data: {
      code,
      name,
      secretHash: await bcrypt.hash(secret, 10),
      originUrls: JSON.stringify(input.originUrls.map((u) => u.trim()).filter(Boolean)),
      defaultProjectId: input.defaultProjectId || null,
    },
  })
  revalidatePath('/admin/ticket-sources')
  return { ok: true as const, code, secret }
}

export async function updateTicketSource(input: {
  id: string
  name: string
  originUrls: string[]
  defaultProjectId: string | null
  active: boolean
}) {
  await requireAdmin()
  await prisma.ticketSource.update({
    where: { id: input.id },
    data: {
      name: input.name.trim(),
      originUrls: JSON.stringify(input.originUrls.map((u) => u.trim()).filter(Boolean)),
      defaultProjectId: input.defaultProjectId || null,
      active: input.active,
    },
  })
  revalidatePath('/admin/ticket-sources')
  return { ok: true as const }
}

/** Rotate the API secret — returned once, stored hashed. */
export async function rotateTicketSourceSecret(id: string) {
  await requireAdmin()
  const secret = randomBytes(24).toString('base64url')
  await prisma.ticketSource.update({
    where: { id },
    data: { secretHash: await bcrypt.hash(secret, 10) },
  })
  revalidatePath('/admin/ticket-sources')
  return { ok: true as const, secret }
}
