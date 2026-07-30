import { test } from 'node:test'
import assert from 'node:assert/strict'
import { s, mapAadeResponse } from '../aade-map'

test('s() κανονικοποιεί nil markers σε null', () => {
  // Η μορφή που ΟΝΤΩΣ επιστρέφει το vat.wwa.gr για κενά πεδία.
  assert.equal(s({ $: { 'xsi:nil': 'true' } }), null)
  assert.equal(s({ '@_xsi:nil': 'true' }), null)
  assert.equal(s({ _: '  τιμή  ' }), 'τιμή')
  assert.equal(s('  κείμενο '), 'κείμενο')
  assert.equal(s('   '), null)
  assert.equal(s(null), null)
  assert.equal(s(undefined), null)
  assert.equal(s(42), '42')
})

// Πραγματικό σχήμα απόκρισης για ΑΦΜ 094019245 (ΟΤΕ ΑΕ), όπως καταγράφηκε ζωντανά.
const RAW = {
  basic_rec: {
    afm: '094019245',
    onomasia: 'ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΤΗΣ ΕΛΛΑΔΟΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ',
    commer_title: { $: { 'xsi:nil': 'true' } },
    doy: '1190',
    doy_descr: 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ',
    legal_status_descr: 'ΑΕ',
    postal_address: 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ',
    postal_address_no: '99',
    postal_zip_code: '15124',
    postal_area_description: 'ΜΑΡΟΥΣΙ',
    regist_date: '1949-11-26',
    deactivation_flag: '1',
    deactivation_flag_descr: 'ΕΝΕΡΓΟΣ ΑΦΜ',
    firm_flag_descr: 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ',
    stop_date: { $: { 'xsi:nil': 'true' } },
  },
  firm_act_tab: {
    item: [
      { firm_act_code: '61900000', firm_act_descr: 'ΑΛΛΕΣ ΥΠΗΡΕΣΙΕΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ', firm_act_kind: '1' },
      { firm_act_code: '62010000', firm_act_descr: 'ΠΡΟΓΡΑΜΜΑΤΙΣΜΟΣ', firm_act_kind: '2' },
    ],
  },
}

test('mapAadeResponse αντιστοιχεί τα πεδία', () => {
  const r = mapAadeResponse(RAW)!
  assert.equal(r.company.NAME, 'ΟΡΓΑΝΙΣΜΟΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ ΤΗΣ ΕΛΛΑΔΟΣ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ')
  assert.equal(r.company.ADDRESS, 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ 99')
  assert.equal(r.company.ZIP, '15124')
  assert.equal(r.company.CITY, 'ΜΑΡΟΥΣΙ')
  assert.equal(r.company.appLegalForm, 'ΑΕ')
  assert.equal(r.company.aadeStatus, 'ΕΝΕΡΓΟΣ ΑΦΜ')
  assert.equal(r.company.aadeFirmKind, 'ΕΠΙΤΗΔΕΥΜΑΤΙΑΣ')
  assert.equal(r.company.foundingDate?.toISOString().slice(0, 10), '1949-11-26')
  assert.equal(r.company.JOBTYPETRD, 'ΑΛΛΕΣ ΥΠΗΡΕΣΙΕΣ ΤΗΛΕΠΙΚΟΙΝΩΝΙΩΝ')
  assert.equal(r.isActive, true)
})

test('IRSDATA παίρνει την ΟΝΟΜΑΣΙΑ της ΔΟΥ και doyCode τον κωδικό', () => {
  // Το SoftOne TRDR.IRSDATA κρατά ονομασία ("ΠΑΛΛΗΝΗΣ ΑΘΗΝΩΝ"), όχι κωδικό,
  // άρα το doy_descr πάει στο IRSDATA και το doy σε δικό του πεδίο.
  const r = mapAadeResponse(RAW)!
  assert.equal(r.company.IRSDATA, 'ΚΕΦΟΔΕ ΑΤΤΙΚΗΣ')
  assert.equal(r.company.doyCode, '1190')
})

test('mapAadeResponse κανονικοποιεί τις δραστηριότητες', () => {
  const r = mapAadeResponse(RAW)!
  assert.equal(r.activities.length, 2)
  assert.equal(r.activities[0].kind, 'PRIMARY')
  assert.equal(r.activities[0].code, '61900000')
  assert.equal(r.activities[0].order, 0)
  assert.equal(r.activities[1].kind, 'SECONDARY')
  assert.equal(r.activities[1].order, 1)
})

test('firm_act_tab.item δέχεται μονό object ή απουσία', () => {
  const single = mapAadeResponse({
    basic_rec: { afm: '094019245', onomasia: 'Χ' },
    firm_act_tab: { item: { firm_act_code: '1', firm_act_descr: 'Α', firm_act_kind: '1' } },
  })!
  assert.equal(single.activities.length, 1)
  assert.equal(single.activities[0].kind, 'PRIMARY')

  const none = mapAadeResponse({ basic_rec: { afm: '094019245', onomasia: 'Χ' } })!
  assert.equal(none.activities.length, 0)
  assert.equal(none.company.JOBTYPETRD, null)
})

test('mapAadeResponse επιστρέφει null όταν λείπει το basic_rec/afm', () => {
  assert.equal(mapAadeResponse({}), null)
  assert.equal(mapAadeResponse({ basic_rec: {} }), null)
  assert.equal(mapAadeResponse({ basic_rec: { afm: { $: { 'xsi:nil': 'true' } } } }), null)
})

test('ανενεργό ΑΦΜ όταν υπάρχει stop_date ή λείπει το deactivation_flag', () => {
  const stopped = mapAadeResponse({
    basic_rec: { afm: '094019245', onomasia: 'Χ', deactivation_flag: '1', stop_date: '2020-01-01' },
  })!
  assert.equal(stopped.isActive, false)

  const noFlag = mapAadeResponse({ basic_rec: { afm: '094019245', onomasia: 'Χ' } })!
  assert.equal(noFlag.isActive, false)
})

test('διεύθυνση χωρίς αριθμό δεν αφήνει κρεμασμένο κενό', () => {
  const r = mapAadeResponse({
    basic_rec: {
      afm: '094019245', onomasia: 'Χ',
      postal_address: 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ',
      postal_address_no: { $: { 'xsi:nil': 'true' } },
    },
  })!
  assert.equal(r.company.ADDRESS, 'ΛΕΩΦΟΡΟΣ ΚΗΦΙΣΙΑΣ')
})
