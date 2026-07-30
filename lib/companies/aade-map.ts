/**
 * Καθαρός mapper ΑΑΔΕ (vat.wwa.gr/afm2info) → πεδία Company.
 *
 * ΚΑΜΙΑ εξάρτηση σε fetch/prisma/ρολόι, ώστε να δοκιμάζεται απομονωμένα.
 * Ported από cloudzeus/damask src/lib/trdr/aade-map.ts.
 */

/**
 * Coercer για nil markers: η υπηρεσία μετατρέπει XML σε JSON και αναπαριστά την
 * απούσα τιμή ως αντικείμενο, ΟΧΙ ως JSON null. Επιβεβαιωμένο ζωντανά — για ΑΦΜ
 * 094019245 τα `commer_title` και `stop_date` γυρίζουν `{"$":{"xsi:nil":"true"}}`.
 *
 *   - { $: { 'xsi:nil': 'true' } }   SOAP→JSON
 *   - { '@_xsi:nil': 'true' }        xml2js attribute-prefix
 *   - { _: 'πραγματική τιμή' }       SOAP→JSON text node
 */
export function s(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (o['@_xsi:nil'] === 'true') return null
    const dollar = o.$ as Record<string, unknown> | undefined
    if (dollar && (dollar['xsi:nil'] === 'true' || dollar.nil === 'true')) return null
    if (typeof o._ === 'string') return o._.trim() || null
  }
  return null
}

export type AadeFirmActRaw = {
  firm_act_code?: unknown
  firm_act_descr?: unknown
  firm_act_kind?: unknown
}

export type AadeRawResponse = {
  basic_rec?: Record<string, unknown>
  firm_act_tab?: { item?: AadeFirmActRaw | AadeFirmActRaw[] }
}

export type CompanyActivityDraft = {
  code: string | null
  description: string | null
  kind: 'PRIMARY' | 'SECONDARY'
  order: number
}

/** Τα πεδία της Company που γεμίζει η ΑΑΔΕ. */
export type AadeCompanyPatch = {
  NAME: string
  ADDRESS: string | null
  ZIP: string | null
  CITY: string | null
  /**
   * Ονομασία ΔΟΥ (basic_rec.doy_descr) — ΟΧΙ ο κωδικός. Το SoftOne TRDR.IRSDATA
   * κρατά την ονομασία σε αυτό το tenant (π.χ. "ΠΑΛΛΗΝΗΣ ΑΘΗΝΩΝ"), οπότε το
   * IRSDATA πρέπει να μένει συνεπές με ό,τι δείχνει το ERP.
   */
  IRSDATA: string | null
  /** Αριθμητικός κωδικός ΔΟΥ της ΑΑΔΕ (basic_rec.doy). */
  doyCode: string | null
  /** Περιγραφή κύριας δραστηριότητας. */
  JOBTYPETRD: string | null
  appLegalForm: string | null
  foundingDate: Date | null
  aadeStatus: string | null
  aadeFirmKind: string | null
}

export type AadeMapped = {
  company: AadeCompanyPatch
  activities: CompanyActivityDraft[]
  /** Ονομασία ΔΟΥ, ξεχωριστά για εμφάνιση στο UI. */
  doyDescr: string | null
  /** deactivation_flag === '1' ΚΑΙ χωρίς stop_date. */
  isActive: boolean
}

function toDate(v: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Μετατρέπει την ακατέργαστη απόκριση σε πεδία Company + δραστηριότητες.
 * `null` όταν λείπει το basic_rec/afm — δηλαδή το ΑΦΜ δεν βρέθηκε στο μητρώο.
 */
export function mapAadeResponse(raw: AadeRawResponse): AadeMapped | null {
  const b = raw?.basic_rec
  if (!b || !s(b.afm)) return null

  const item = raw?.firm_act_tab?.item
  const items: AadeFirmActRaw[] = item == null ? [] : Array.isArray(item) ? item : [item]

  const activities: CompanyActivityDraft[] = items.map((a, i) => ({
    code: s(a?.firm_act_code),
    description: s(a?.firm_act_descr),
    // firm_act_kind: '1' κύρια, οτιδήποτε άλλο δευτερεύουσα.
    kind: s(a?.firm_act_kind) === '1' ? 'PRIMARY' : 'SECONDARY',
    order: i,
  }))

  const primary = activities.find((a) => a.kind === 'PRIMARY') ?? activities[0]
  const addressParts = [s(b.postal_address), s(b.postal_address_no)].filter(Boolean)
  const doyDescr = s(b.doy_descr)

  return {
    company: {
      NAME: s(b.onomasia) ?? '',
      ADDRESS: addressParts.join(' ') || null,
      ZIP: s(b.postal_zip_code),
      CITY: s(b.postal_area_description),
      IRSDATA: doyDescr,
      doyCode: s(b.doy),
      JOBTYPETRD: primary?.description ?? null,
      appLegalForm: s(b.legal_status_descr),
      foundingDate: toDate(s(b.regist_date)),
      aadeStatus: s(b.deactivation_flag_descr),
      aadeFirmKind: s(b.firm_flag_descr),
    },
    activities,
    doyDescr,
    isActive: s(b.deactivation_flag) === '1' && !s(b.stop_date),
  }
}
