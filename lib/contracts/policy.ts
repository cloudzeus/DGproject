export type ContractActor = {
  id: string
  role: string
  userType: string
}

export type ContractProjectAccess = {
  ownerId: string
  members: Array<{ userId: string }>
}

/** Only the actual employee who owns the project may replace its contract. */
export function canUploadProjectContract(
  actor: ContractActor | null | undefined,
  projectOwnerId: string,
): boolean {
  return Boolean(actor && actor.userType === 'employee' && actor.id === projectOwnerId)
}

/** Contract analysis is internal and limited to users who can edit the project. */
export function canCheckProjectContract(
  actor: ContractActor | null | undefined,
  project: ContractProjectAccess,
): boolean {
  if (!actor || actor.userType !== 'employee' || actor.role === 'viewer') return false
  return actor.role === 'admin' || actor.role === 'manager' || project.ownerId === actor.id
}
