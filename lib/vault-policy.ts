export type VaultActor = {
  id: string;
  role: 'admin' | 'manager' | 'member' | 'viewer';
  userType: 'employee' | 'customer' | 'supplier';
};

export function canManageVaultSecret(actor: VaultActor, secretOwnerId: string): boolean {
  return actor.id === secretOwnerId;
}

export function canRevealVaultValue(
  actor: VaultActor,
  secretOwnerId: string,
  hasSecretShare: boolean,
): boolean {
  return canManageVaultSecret(actor, secretOwnerId) || hasSecretShare;
}

export function requiresVaultOtp(actor: VaultActor, secretOwnerId: string): boolean {
  return !canManageVaultSecret(actor, secretOwnerId);
}
