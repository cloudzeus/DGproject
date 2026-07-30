import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPortalUser } from '../scope'

test('isPortalUser δέχεται μόνο customer με companyId', () => {
  assert.equal(isPortalUser({ userType: 'customer', companyId: 'c1' }), true)
})

test('customer χωρίς εταιρία ΔΕΝ είναι portal user', () => {
  // Κρίσιμο: «χωρίς εταιρία» σημαίνει «δεν βλέπει τίποτα», όχι «βλέπει τα πάντα».
  assert.equal(isPortalUser({ userType: 'customer', companyId: null }), false)
  assert.equal(isPortalUser({ userType: 'customer', companyId: '' }), false)
  assert.equal(isPortalUser({ userType: 'customer' }), false)
})

test('η ομάδα δεν είναι portal user', () => {
  assert.equal(isPortalUser({ userType: 'employee', companyId: 'c1' }), false)
  assert.equal(isPortalUser({ userType: 'supplier', companyId: 'c1' }), false)
})

test('απών ή άγνωστος τύπος δεν είναι portal user', () => {
  assert.equal(isPortalUser(undefined), false)
  assert.equal(isPortalUser({ userType: undefined, companyId: 'c1' }), false)
  assert.equal(isPortalUser({ userType: 'nonsense', companyId: 'c1' }), false)
})
