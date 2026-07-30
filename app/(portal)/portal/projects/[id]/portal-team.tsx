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
export function PortalTeam({ members }: { members: PortalTeamMember[] }) {
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

            <div className="mt-3 space-y-1 border-t border-fluent-neutral-8 pt-2.5">
              <a
                href={`mailto:${m.email}`}
                className="block truncate text-xs text-fluent-blue-600 hover:underline"
              >
                {m.email}
              </a>
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
