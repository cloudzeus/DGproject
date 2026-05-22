'use client';

import { useState } from 'react';
import { Copy20Regular, CheckmarkCircle20Filled, Mail20Regular } from '@fluentui/react-icons';
import { buildEmailTag } from '@/lib/email-tag';
import { EmailComposerModal, type EmailRecipientOption } from '@/components/email/email-composer-modal';
import { sendProjectEmail } from './email-actions';

type Props = {
  projectId: string;
  projectCode: string;
  recipients: EmailRecipientOption[];
  // Customer's email is pre-selected in the To field when present.
  defaultRecipient?: string | null;
};

export function EmailTagBadge({ projectId, projectCode, recipients, defaultRecipient }: Props) {
  const [copied, setCopied] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const tag = buildEmailTag(projectCode);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Αντιγράψτε το tag:', tag);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-white/70">Email tag:</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30 font-mono"
          title="Αντιγραφή tag — βάλε το στο subject αν στέλνεις από Outlook. Τα replies το κρατάνε αυτόματα."
        >
          <span>{tag}</span>
          {copied ? (
            <CheckmarkCircle20Filled className="h-3.5 w-3.5" />
          ) : (
            <Copy20Regular className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/20 backdrop-blur text-white hover:bg-white/30"
          title="Σύνταξη νέου email μέσα από το app"
        >
          <Mail20Regular className="h-3.5 w-3.5" />
          <span>Νέο email</span>
        </button>
      </div>
      <EmailComposerModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        context={{ projectId, projectCode }}
        recipients={recipients}
        defaultTo={defaultRecipient ? [defaultRecipient] : []}
        onSend={sendProjectEmail}
      />
    </>
  );
}
