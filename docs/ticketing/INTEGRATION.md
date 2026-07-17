# DGsmart Ticketing — Οδηγός Ενσωμάτωσης για Client Apps

Κάθε εφαρμογή της DGsmart (e-shop, GDPR tool, custom app) μπορεί να στέλνει support tickets στο κεντρικό fluent-pm. Ο οδηγός απευθύνεται στον developer που ενσωματώνει τη φόρμα.

> **Κατάσταση:** Υλοποιημένο (2026-07-17). Design spec: [2026-07-17-ticketing-system-design.md](../superpowers/specs/2026-07-17-ticketing-system-design.md).

## 1. Εγγραφή του project

Ο admin του fluent-pm δημιουργεί ένα **Ticket Source** στο `/admin/ticket-sources`:

- **Code** — σύντομος κωδικός project (π.χ. `DGSHOP`). Αυτός δηλώνεται στο `.env` σας ώστε να ξέρουμε από ποιο project προέρχεται το ticket.
- **Secret** — API key. Εμφανίζεται **μόνο μία φορά** κατά τη δημιουργία.
- **Allowed origins** — τα domains από τα οποία επιτρέπονται υποβολές.
- **Default project** — προαιρετικό προεπιλεγμένο έργο στο fluent-pm.

## 2. Ρύθμιση `.env` στο client app

```env
TICKETING_URL=https://pm.dgsmart.gr
TICKETING_PROJECT_CODE=DGSHOP
TICKETING_API_KEY=xxxxxxxxxxxxxxxx
```

⚠️ Το `TICKETING_API_KEY` είναι server-side secret. **Ποτέ** σε `NEXT_PUBLIC_*` μεταβλητή, ποτέ σε client-side κώδικα. Η φόρμα σας κάνει POST σε δικό σας route handler, που προωθεί στο ticketing API.

## 3. API Reference

### POST `/api/tickets` — δημιουργία ticket

Headers:

```
Content-Type: application/json
X-Ticket-Project: DGSHOP
X-Ticket-Key: <secret>
```

Body:

```json
{
  "subject": "Δεν ολοκληρώνεται η παραγγελία",
  "body": "Όταν πατάω πληρωμή με κάρτα, βγαίνει λευκή σελίδα...",
  "reporterEmail": "customer@example.com",
  "reporterName": "Μαρία Παπαδοπούλου",
  "originUrl": "https://shop.example.gr/checkout"
}
```

Response `201`:

```json
{ "code": "TKT-2026-0042", "publicToken": "clx...", "statusUrl": "https://pm.dgsmart.gr/t/clx..." }
```

Σφάλματα: `401` λάθος key/code (`missing_credentials`/`unknown_source`/`invalid_key`) · `403` μη επιτρεπτό origin · `422` ελλιπή πεδία (`invalid_subject` ≤200, `invalid_body` ≤5000, `invalid_email`) · `429` rate limit (10 tickets/ώρα ανά email, 60/ώρα ανά πηγή). Διπλή υποβολή (ίδιο email+subject εντός 10') επιστρέφει το υπάρχον ticket με `200` και `"duplicate": true`.

### GET `/api/tickets/{code}?token={publicToken}` — κατάσταση

```json
{
  "code": "TKT-2026-0042",
  "status": "converted",
  "statusLabel": "Σε επεξεργασία",
  "createdAt": "2026-07-17T09:00:00Z",
  "events": [
    { "type": "created", "at": "..." },
    { "type": "task_status", "label": "Ανατέθηκε", "at": "..." }
  ]
}
```

### `GET /t/{publicToken}` — δημόσια σελίδα κατάστασης

Έτοιμη σελίδα στα Ελληνικά — μπορείτε απλώς να δώσετε link στον χρήστη (περιλαμβάνεται και στα emails που στέλνει το σύστημα).

## 4. Drop-in ενσωμάτωση (Next.js)

### Route handler (server-side proxy)

```ts
// app/api/support/route.ts
export async function POST(req: Request) {
  const data = await req.json()
  const res = await fetch(`${process.env.TICKETING_URL}/api/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ticket-Project': process.env.TICKETING_PROJECT_CODE!,
      'X-Ticket-Key': process.env.TICKETING_API_KEY!,
    },
    body: JSON.stringify({
      subject: data.subject,
      body: data.body,
      reporterEmail: data.email,
      reporterName: data.name,
      originUrl: data.originUrl ?? req.headers.get('referer') ?? '',
    }),
  })
  return new Response(await res.text(), { status: res.status })
}
```

### Φόρμα (client component, shadcn/ui)

```tsx
'use client'
import { useState } from 'react'

export function SupportForm() {
  const [result, setResult] = useState<{ code: string; statusUrl: string } | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (fd.get('website')) return // honeypot
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: fd.get('subject'),
        body: fd.get('body'),
        email: fd.get('email'),
        name: fd.get('name'),
        originUrl: window.location.href,
      }),
    })
    if (res.ok) setResult(await res.json())
  }

  if (result)
    return <p>Το αίτημά σας καταχωρήθηκε με κωδικό <b>{result.code}</b>. <a href={result.statusUrl}>Παρακολούθηση</a></p>

  return (
    <form onSubmit={onSubmit}>
      <input name="website" className="hidden" tabIndex={-1} autoComplete="off" /> {/* honeypot */}
      <input name="name" placeholder="Ονοματεπώνυμο" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="subject" placeholder="Θέμα" required maxLength={200} />
      <textarea name="body" placeholder="Περιγράψτε το πρόβλημα..." required maxLength={5000} />
      <button type="submit">Αποστολή</button>
    </form>
  )
}
```

## 5. Τι συμβαίνει μετά την υποβολή

1. Ο χρήστης λαμβάνει email επιβεβαίωσης με τον κωδικό και link παρακολούθησης.
2. Το DeepSeek αναλύει το ticket: το ξαναγράφει τεχνικά, το κατηγοριοποιεί, προτείνει έργο/χρέωση με βάση τα υπάρχοντα projects, παρόμοια tasks και τη διαθεσιμότητα της ομάδας.
3. Admin/manager εγκρίνει ή τροποποιεί την πρόταση → δημιουργείται Task.
4. Κάθε αλλαγή κατάστασης του Task στέλνει email ενημέρωσης στον χρήστη.
5. Με την ολοκλήρωση, η λύση αποθηκεύεται στο Knowledge Base και βελτιώνει τα επόμενα triage.

## 6. Checklist ενσωμάτωσης

- [ ] Δημιουργήθηκε Ticket Source και σημειώθηκε το secret
- [ ] `.env`: `TICKETING_URL`, `TICKETING_PROJECT_CODE`, `TICKETING_API_KEY` (server-side μόνο)
- [ ] Route handler proxy — το key ΔΕΝ εκτίθεται στον browser
- [ ] Honeypot πεδίο στη φόρμα
- [ ] Το production domain υπάρχει στα allowed origins
- [ ] Δοκιμή: υποβολή → email επιβεβαίωσης → εμφάνιση στο /tickets του fluent-pm
