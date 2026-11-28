'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/mailgun';
import {
  decryptVaultValue,
  encryptVaultValue,
  generateVaultOtp,
  hashVaultOtp,
  vaultOtpMatches,
  VaultCryptoError,
} from '@/lib/vault-crypto';
import type { VaultSecretInput } from '@/lib/vault-types';
import { canManageVaultSecret, canRevealVaultValue, requiresVaultOtp } from '@/lib/vault-policy';

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 10;

const metadataSchema = z.object({
  label: z.string().trim().min(2).max(120).regex(/^[^\r\n\0]+$/, 'Invalid label'),
  category: z.enum(['api_key', 'connection_string', 'credential', 'other']),
  environment: z.enum(['development', 'staging', 'production', 'other']),
});

const createSchema = metadataSchema.extend({
  value: z.string().min(1).max(32_768),
});

const updateSchema = metadataSchema.extend({
  value: z.string().max(32_768).optional(),
});

type ActionResult = { ok: boolean; error?: string };

type RequestOtpResult = ActionResult & {
  challengeId?: string;
  expiresAt?: string;
  retryAfterSeconds?: number;
};

type RevealResult = ActionResult & { value?: string };

async function requireUser() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Η συνεδρία έληξε. Συνδέσου ξανά.');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, userType: true, isAIAgent: true },
  });
  if (!user || user.isAIAgent) throw new Error('Δεν έχεις πρόσβαση σε αυτή την ενέργεια.');
  return user;
}

async function requireParticipant(projectId: string) {
  const user = await requireUser();
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      members: { select: { userId: true } },
    },
  });
  if (!project) throw new Error('Το έργο δεν βρέθηκε.');

  const isMember = project.members.some((member) => member.userId === user.id);
  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  if (!isPrivileged && project.ownerId !== user.id && !isMember) {
    throw new Error('Δεν έχεις πρόσβαση στο Vault αυτού του έργου.');
  }

  return { user, project };
}

async function requireSecretContext(projectId: string, secretId: string) {
  const context = await requireParticipant(projectId);
  const secret = await prisma.vaultSecret.findUnique({
    where: { id: secretId },
    select: {
      id: true,
      projectId: true,
      label: true,
      createdById: true,
      shares: { where: { userId: context.user.id }, select: { id: true } },
    },
  });
  if (!secret || secret.projectId !== projectId) {
    throw new Error('Το μυστικό δεν βρέθηκε σε αυτό το έργο.');
  }
  return { ...context, secret };
}

async function requireOwnedSecret(projectId: string, secretId: string) {
  const context = await requireSecretContext(projectId, secretId);
  if (!canManageVaultSecret(context.user, context.secret.createdById ?? '')) {
    throw new Error('Μόνο ο δημιουργός του μυστικού μπορεί να αλλάξει τα στοιχεία ή την κοινοποίησή του.');
  }
  return context;
}

async function requireRevealAccess(projectId: string, secretId: string) {
  const context = await requireSecretContext(projectId, secretId);
  const hasShare = context.secret.shares.length > 0;
  if (!canRevealVaultValue(context.user, context.secret.createdById ?? '', hasShare)) {
    throw new Error('Αυτό το μυστικό δεν έχει κοινοποιηθεί σε εσένα.');
  }
  return context;
}

async function requireSharedRevealAccess(projectId: string, secretId: string) {
  const context = await requireRevealAccess(projectId, secretId);
  if (!requiresVaultOtp(context.user, context.secret.createdById ?? '')) {
    throw new Error('Τα προσωπικά μυστικά αποκαλύπτονται απευθείας, χωρίς OTP.');
  }
  return context;
}

function revalidateVault(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

function cryptoErrorMessage(error: unknown): string {
  return error instanceof VaultCryptoError
    ? 'Το κλειδί κρυπτογράφησης του Vault δεν είναι σωστά ρυθμισμένο.'
    : 'Η κρυπτογραφική ενέργεια απέτυχε.';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export async function createVaultSecret(
  projectId: string,
  input: VaultSecretInput,
): Promise<ActionResult> {
  const { user } = await requireParticipant(projectId);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Συμπλήρωσε έγκυρο τίτλο, τύπο, περιβάλλον και τιμή.' };

  const secretId = randomUUID();
  let encrypted;
  try {
    encrypted = encryptVaultValue(parsed.data.value, { projectId, secretId });
  } catch (error) {
    return { ok: false, error: cryptoErrorMessage(error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vaultSecret.create({
        data: {
          id: secretId,
          projectId,
          label: parsed.data.label,
          category: parsed.data.category,
          environment: parsed.data.environment,
          ...encrypted,
          createdById: user.id,
        },
      });
      await tx.vaultAuditLog.create({
        data: {
          projectId,
          secretId,
          actorId: user.id,
          action: 'created',
          metadata: { label: parsed.data.label },
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Υπάρχει ήδη μυστικό με αυτόν τον τίτλο στο δικό σου Vault για αυτό το περιβάλλον.' };
    }
    throw error;
  }

  revalidateVault(projectId);
  return { ok: true };
}

export async function updateVaultSecret(
  projectId: string,
  secretId: string,
  input: VaultSecretInput,
): Promise<ActionResult> {
  const { user } = await requireOwnedSecret(projectId, secretId);
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Συμπλήρωσε έγκυρα τα στοιχεία του μυστικού.' };

  let encrypted: ReturnType<typeof encryptVaultValue> | undefined;
  if (parsed.data.value) {
    try {
      encrypted = encryptVaultValue(parsed.data.value, { projectId, secretId });
    } catch (error) {
      return { ok: false, error: cryptoErrorMessage(error) };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vaultSecret.update({
        where: { id: secretId },
        data: {
          label: parsed.data.label,
          category: parsed.data.category,
          environment: parsed.data.environment,
          updatedById: user.id,
          ...(encrypted ? { ...encrypted, version: { increment: 1 } } : {}),
        },
      });
      await tx.vaultAuditLog.create({
        data: {
          projectId,
          secretId,
          actorId: user.id,
          action: 'updated',
          metadata: { label: parsed.data.label, valueChanged: Boolean(encrypted) },
        },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'Υπάρχει ήδη μυστικό με αυτόν τον τίτλο στο δικό σου Vault για αυτό το περιβάλλον.' };
    }
    throw error;
  }

  revalidateVault(projectId);
  return { ok: true };
}

export async function deleteVaultSecret(projectId: string, secretId: string): Promise<ActionResult> {
  const { user, secret } = await requireOwnedSecret(projectId, secretId);

  await prisma.$transaction(async (tx) => {
    await tx.vaultAuditLog.create({
      data: {
        projectId,
        secretId,
        actorId: user.id,
        action: 'deleted',
        metadata: { label: secret.label },
      },
    });
    await tx.vaultSecret.delete({ where: { id: secretId } });
  });

  revalidateVault(projectId);
  return { ok: true };
}

export async function updateVaultSecretShares(
  projectId: string,
  secretId: string,
  userIds: string[],
): Promise<ActionResult> {
  const { user, project } = await requireOwnedSecret(projectId, secretId);
  const targetIds = Array.from(new Set(userIds)).slice(0, 200);

  const [owner, members, currentShares] = await Promise.all([
    prisma.user.findUnique({
      where: { id: project.ownerId },
      select: { id: true, name: true, email: true, isAIAgent: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId },
      select: { userId: true, user: { select: { name: true, email: true, isAIAgent: true } } },
    }),
    prisma.vaultSecretShare.findMany({
      where: { secretId },
      select: { userId: true },
    }),
  ]);

  const eligible = new Map<string, { name: string }>();
  if (owner && !owner.isAIAgent && owner.id !== user.id) {
    eligible.set(owner.id, { name: owner.name ?? owner.email });
  }
  for (const member of members) {
    if (!member.user.isAIAgent && member.userId !== user.id) {
      eligible.set(member.userId, { name: member.user.name ?? member.user.email });
    }
  }

  if (targetIds.some((id) => !eligible.has(id))) {
    return { ok: false, error: 'Η κοινοποίηση επιτρέπεται μόνο προς άλλους συμμετέχοντες του έργου.' };
  }

  const currentIds = new Set(currentShares.map((share) => share.userId));
  const targetIdSet = new Set(targetIds);
  const toShare = targetIds.filter((id) => !currentIds.has(id));
  const toRevoke = [...currentIds].filter((id) => !targetIdSet.has(id));

  await prisma.$transaction(async (tx) => {
    if (toRevoke.length) {
      await tx.vaultSecretShare.deleteMany({ where: { secretId, userId: { in: toRevoke } } });
      await tx.vaultOtpChallenge.deleteMany({ where: { secretId, userId: { in: toRevoke } } });
    }
    if (toShare.length) {
      await tx.vaultSecretShare.createMany({
        data: toShare.map((userId) => ({ secretId, userId, sharedById: user.id })),
      });
    }
    const auditRows = [
      ...toShare.map((targetUserId) => ({
        projectId,
        secretId,
        actorId: user.id,
        action: 'access_granted' as const,
        metadata: { targetUserId, targetName: eligible.get(targetUserId)?.name },
      })),
      ...toRevoke.map((targetUserId) => ({
        projectId,
        secretId,
        actorId: user.id,
        action: 'access_revoked' as const,
        metadata: { targetUserId },
      })),
    ];
    if (auditRows.length) await tx.vaultAuditLog.createMany({ data: auditRows });
  });

  revalidateVault(projectId);
  return { ok: true };
}

export async function revealPersonalVaultSecret(
  projectId: string,
  secretId: string,
): Promise<RevealResult> {
  const { user, secret } = await requireOwnedSecret(projectId, secretId);
  const stored = await prisma.vaultSecret.findUnique({
    where: { id: secretId },
    select: {
      projectId: true,
      ciphertext: true,
      iv: true,
      authTag: true,
      keyVersion: true,
    },
  });
  if (!stored || stored.projectId !== projectId) {
    return { ok: false, error: 'Το μυστικό δεν βρέθηκε σε αυτό το έργο.' };
  }

  let value: string;
  try {
    value = decryptVaultValue(stored, { projectId, secretId });
  } catch (error) {
    return { ok: false, error: cryptoErrorMessage(error) };
  }

  await prisma.vaultAuditLog.create({
    data: {
      projectId,
      secretId,
      actorId: user.id,
      action: 'revealed',
      metadata: { label: secret.label, method: 'personal_direct' },
    },
  });

  revalidateVault(projectId);
  return { ok: true, value };
}

export async function requestVaultOtp(projectId: string, secretId: string): Promise<RequestOtpResult> {
  const { user, project, secret } = await requireSharedRevealAccess(projectId, secretId);
  const now = Date.now();
  const latest = await prisma.vaultOtpChallenge.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latest && now - latest.createdAt.getTime() < OTP_RESEND_MS) {
    const retryAfterSeconds = Math.ceil((OTP_RESEND_MS - (now - latest.createdAt.getTime())) / 1000);
    return {
      ok: false,
      error: `Περίμενε ${retryAfterSeconds} δευτερόλεπτα πριν ζητήσεις νέο OTP.`,
      retryAfterSeconds,
    };
  }

  const recentCount = await prisma.vaultOtpChallenge.count({
    where: { userId: user.id, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
  });
  if (recentCount >= OTP_MAX_PER_HOUR) {
    return { ok: false, error: 'Έφτασες το όριο αιτημάτων OTP. Δοκίμασε ξανά σε μία ώρα.' };
  }

  const code = generateVaultOtp();
  const challengeId = randomUUID();
  const expiresAt = new Date(now + OTP_TTL_MS);
  const codeHash = hashVaultOtp({ code, challengeId, secretId, userId: user.id });

  await prisma.$transaction(async (tx) => {
    await tx.vaultOtpChallenge.deleteMany({ where: { userId: user.id, secretId, consumedAt: null } });
    await tx.vaultOtpChallenge.create({
      data: { id: challengeId, userId: user.id, secretId, codeHash, expiresAt },
    });
    await tx.vaultAuditLog.create({
      data: {
        projectId,
        secretId,
        actorId: user.id,
        action: 'otp_requested',
        metadata: { label: secret.label },
      },
    });
  });

  try {
    await sendEmail({
      to: user.email,
      subject: `OTP Vault — ${project.name}`,
      text: `Ο κωδικός μιας χρήσης για το «${secret.label}» είναι ${code}. Ισχύει για 5 λεπτά.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#172b4d">
        <h2 style="margin:0 0 12px">Επιβεβαίωση αποκάλυψης μυστικού</h2>
        <p>Ζητήθηκε αποκάλυψη του <strong>${escapeHtml(secret.label)}</strong> στο έργο <strong>${escapeHtml(project.name)}</strong>.</p>
        <div style="font-size:32px;letter-spacing:8px;font-weight:700;padding:20px 0">${code}</div>
        <p>Ο κωδικός ισχύει για <strong>5 λεπτά</strong> και μπορεί να χρησιμοποιηθεί μία μόνο φορά.</p>
        <p style="font-size:13px;color:#5e6c84">Αν δεν έκανες εσύ το αίτημα, μην μοιραστείς τον κωδικό και ενημέρωσε τον διαχειριστή.</p>
      </div>`,
    });
  } catch {
    // Keep the undelivered challenge as a rate-limit marker. Deleting it would
    // allow unlimited immediate retries against the email provider.
    return { ok: false, error: 'Δεν ήταν δυνατή η αποστολή του OTP. Έλεγξε τις ρυθμίσεις email.' };
  }

  revalidateVault(projectId);
  return { ok: true, challengeId, expiresAt: expiresAt.toISOString() };
}

export async function revealVaultSecret(
  projectId: string,
  secretId: string,
  challengeId: string,
  code: string,
): Promise<RevealResult> {
  const { user } = await requireSharedRevealAccess(projectId, secretId);
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Το OTP αποτελείται από 6 ψηφία.' };

  const challenge = await prisma.vaultOtpChallenge.findFirst({
    where: { id: challengeId, secretId, userId: user.id, consumedAt: null },
    include: {
      secret: {
        select: {
          projectId: true,
          ciphertext: true,
          iv: true,
          authTag: true,
          keyVersion: true,
          label: true,
        },
      },
    },
  });

  if (!challenge || challenge.secret.projectId !== projectId) {
    return { ok: false, error: 'Το αίτημα OTP δεν είναι πλέον έγκυρο. Ζήτα νέο κωδικό.' };
  }
  if (challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'Το OTP έληξε ή εξαντλήθηκαν οι προσπάθειες. Ζήτα νέο κωδικό.' };
  }

  const actualHash = hashVaultOtp({ code, challengeId, secretId, userId: challenge.userId });
  if (!vaultOtpMatches(challenge.codeHash, actualHash)) {
    await prisma.vaultOtpChallenge.updateMany({
      where: { id: challengeId, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
    });
    await prisma.vaultAuditLog.create({
      data: {
        projectId,
        secretId,
        actorId: challenge.userId,
        action: 'reveal_failed',
        metadata: { reason: 'invalid_otp', attempt: challenge.attempts + 1 },
      },
    });
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - challenge.attempts - 1);
    return {
      ok: false,
      error: remaining > 0 ? `Λάθος OTP. Απομένουν ${remaining} προσπάθειες.` : 'Οι προσπάθειες εξαντλήθηκαν. Ζήτα νέο OTP.',
    };
  }

  let value: string;
  try {
    value = decryptVaultValue(
      {
        ciphertext: challenge.secret.ciphertext,
        iv: challenge.secret.iv,
        authTag: challenge.secret.authTag,
        keyVersion: challenge.secret.keyVersion,
      },
      { projectId, secretId },
    );
  } catch (error) {
    return { ok: false, error: cryptoErrorMessage(error) };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.vaultOtpChallenge.updateMany({
        where: {
          id: challengeId,
          userId: challenge.userId,
          secretId,
          codeHash: challenge.codeHash,
          consumedAt: null,
          expiresAt: { gt: new Date() },
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },
        data: { consumedAt: new Date(), lastAttemptAt: new Date() },
      });
      if (consumed.count !== 1) throw new Error('OTP_ALREADY_CONSUMED');
      await tx.vaultAuditLog.create({
        data: {
          projectId,
          secretId,
          actorId: challenge.userId,
          action: 'revealed',
          metadata: { label: challenge.secret.label },
        },
      });
    });
  } catch {
    return { ok: false, error: 'Το OTP έχει ήδη χρησιμοποιηθεί ή έληξε. Ζήτα νέο κωδικό.' };
  }

  revalidateVault(projectId);
  return { ok: true, value };
}
