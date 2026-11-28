export type VaultCategory = 'api_key' | 'connection_string' | 'credential' | 'other';
export type VaultEnvironment = 'development' | 'staging' | 'production' | 'other';

export type VaultSecretInput = {
  label: string;
  category: VaultCategory;
  environment: VaultEnvironment;
  value?: string;
};

export type VaultSecretMetadata = {
  id: string;
  label: string;
  category: VaultCategory;
  environment: VaultEnvironment;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  createdByName: string;
  updatedByName: string | null;
  ownedByMe: boolean;
  /** Populated only for secrets owned by the current user. */
  sharedUserIds: string[];
};

export type VaultAuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'otp_requested'
  | 'revealed'
  | 'reveal_failed'
  | 'access_granted'
  | 'access_revoked';

export type VaultAuditEntry = {
  id: string;
  action: VaultAuditAction;
  secretLabel: string | null;
  actorName: string;
  createdAt: Date;
};
