// Optional comma-separated allowlist for Microsoft identities within the
// configured tenant. An empty value preserves the previous all-domains behavior.
export function getMicrosoftTenantDomains(): string[] {
  const configured = process.env.MICROSOFT_TENANT_DOMAINS ?? '';
  return [...new Set(
    configured
      .split(',')
      .map((domain) => domain.trim().toLowerCase().replace(/^@+/, ''))
      .filter(Boolean),
  )];
}

export function isMicrosoftDomainIncluded(domain: string): boolean {
  const allowed = getMicrosoftTenantDomains();
  if (allowed.length === 0) return true;
  return allowed.includes(domain.trim().toLowerCase().replace(/^@+/, ''));
}

export function isMicrosoftEmailIncluded(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return false;
  return isMicrosoftDomainIncluded(normalized.slice(at + 1));
}
