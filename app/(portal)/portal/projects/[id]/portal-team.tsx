import { Avatar } from '@/components/ui/avatar';

export type PortalTeamMember = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  /** Ιδιότητα σε ΑΥΤΟ το έργο, π.χ. «Υπεύθυνος εγκατάστασης». */
  title: string | null;
  responsibilities: string | null;
  phone: string | null;
  mobile: string | null;
  isOwner: boolean;
};

/**
 * Η ομάδα του έργου, όπως τη βλέπει ο πελάτης.
 *
 * Η ιεραρχία της κάρτας είναι σκόπιμη: **ιδιότητα και αρμοδιότητες πριν από τα
 * στοιχεία επικοινωνίας**. Ο πελάτης δεν ψάχνει «ποιος είναι ο Γιάννης» — ψάχνει
 * «σε ποιον μιλάω γι' αυτό». Το όνομα χωρίς αρμοδιότητα δεν απαντά σε αυτό.
 *
 * Εμφανίζονται μόνο μέλη με `visibleToCustomer` — το φιλτράρισμα γίνεται στο
 * query, όχι εδώ.
 */
/**
 * Το θέμα του email φέρει τον κωδικό έργου σε μορφή [FPM:p=PRJ-…], ώστε η
 * απάντηση του μέλους να δρομολογηθεί αυτόματα πίσω στο έργο από το email
 * ingest (lib/email-tag.ts) αντί να χαθεί σε ένα προσωπικό inbox.
 */
function mailtoFor(email: string, projectCode: string | null, projectName: string): string {
  const subject = projectCode
    ? `[FPM:p=${projectCode}] ${projectName}`
    : projectName
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`
}

export function PortalTeam({
  members,
  projectCode,
  projectName,
}: {
  members: PortalTeamMember[]
  projectCode: string | null
  projectName: string
}) {
  if (members.length === 0) {
    return (
      <section>
        <h2 className="mb-2 font-display text-base font-semibold text-fluent-neutral-90">
          Η ομάδα σας
        </h2>
        <div className="rounded-xl border border-dashed border-fluent-neutral-20 bg-white/60 px-6 py-8 text-center">
          <p className="text-sm text-fluent-neutral-60">
            Δεν έχουν οριστεί ακόμα μέλη επικοινωνίας για αυτό το έργο.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 font-display text-base font-semibold text-fluent-neutral-90">
        Η ομάδα σας
      </h2>
      <p className="mb-3 text-xs text-fluent-neutral-60">
        Απευθυνθείτε στο μέλος που καλύπτει το θέμα σας.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border border-fluent-neutral-10 bg-white p-4 shadow-fluent-2"
          >
            <div className="flex items-start gap-3">
              <Avatar user={{ name: m.name, avatarUrl: m.avatarUrl }} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fluent-neutral-90">{m.name}</p>
                {m.title ? (
                  <p className="text-xs font-medium text-fluent-blue-700">{m.title}</p>
                ) : m.isOwner ? (
                  <p className="text-xs font-medium text-fluent-blue-700">Υπεύθυνος έργου</p>
                ) : null}
              </div>
            </div>

            {m.responsibilities && (
              <p className="mt-2.5 text-xs leading-relaxed text-fluent-neutral-70">
                {m.responsibilities}
              </p>
            )}

            <div className="mt-3 space-y-2 border-t border-fluent-neutral-8 pt-2.5">
              <a
                href={mailtoFor(m.email, projectCode, projectName)}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-fluent-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-fluent-blue-700"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z" />
                  <path d="m2.5 5 5.5 3.5L13.5 5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Στείλτε email
              </a>
              <p className="truncate text-center text-[11px] text-fluent-neutral-60">{m.email}</p>
              {(m.phone || m.mobile) && (
                <div className="flex flex-wrap gap-x-3 text-xs">
                  {m.phone && (
                    <a href={`tel:${m.phone}`} className="tabular-nums text-fluent-neutral-70 hover:underline">
                      {m.phone}
                    </a>
                  )}
                  {m.mobile && (
                    <a href={`tel:${m.mobile}`} className="tabular-nums text-fluent-neutral-70 hover:underline">
                      {m.mobile}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
