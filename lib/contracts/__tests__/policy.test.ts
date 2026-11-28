import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canCheckProjectContract, canUploadProjectContract, type ContractActor } from '../policy'

const owner: ContractActor = { id: 'owner', role: 'member', userType: 'employee' }
const project = { ownerId: 'owner', members: [{ userId: 'member' }] }

test('only the actual employee project owner can upload a contract', () => {
  assert.equal(canUploadProjectContract(owner, project.ownerId), true)
  assert.equal(canUploadProjectContract({ ...owner, id: 'other', role: 'admin' }, project.ownerId), false)
  assert.equal(canUploadProjectContract({ ...owner, userType: 'customer' }, project.ownerId), false)
  assert.equal(canUploadProjectContract(null, project.ownerId), false)
})

test('project editors can check coverage but members, viewers, customers and outsiders cannot', () => {
  assert.equal(canCheckProjectContract(owner, project), true)
  assert.equal(canCheckProjectContract({ ...owner, id: 'admin', role: 'admin' }, project), true)
  assert.equal(canCheckProjectContract({ ...owner, id: 'manager', role: 'manager' }, project), true)
  assert.equal(canCheckProjectContract({ ...owner, id: 'member' }, project), false)
  assert.equal(canCheckProjectContract({ ...owner, role: 'viewer' }, project), false)
  assert.equal(canCheckProjectContract({ ...owner, userType: 'customer' }, project), false)
  assert.equal(canCheckProjectContract({ ...owner, id: 'outsider' }, project), false)
  assert.equal(canCheckProjectContract(undefined, project), false)
})
