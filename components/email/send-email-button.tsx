'use client';

import { useState } from 'react';
import { Mail20Regular } from '@fluentui/react-icons';
import { EmailComposerModal, type EmailRecipientOption } from './email-composer-modal';
import { sendProjectEmail } from '@/app/(app)/projects/[id]/email-actions';

type Props = {
  projectId: string;
  projectCode: string;
  taskId?: string | null;
  questionId?: string | null;
  // Pre-populated values for the composer.
  defaultSubject?: string;
  defaultBody?: string;
  defaultTo?: string[];
  recipients: EmailRecipientOption[];
  // Visual variant — most callers want a small icon-only button next to a
  // title; some want a normal labelled button (e.g. in a header bar).
  variant?: 'icon' | 'labelled';
  label?: string;
  disabled?: boolean;
};

export function SendEmailButton({
  projectId,
  projectCode,
  taskId,
  questionId,
  defaultSubject,
  defaultBody,
  defaultTo = [],
  recipients,
  variant = 'icon',
  label = 'Email',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          title="Αποστολή email μέσω της εφαρμογής"
          className="h-8 w-8 rounded-md hover:bg-black/5 flex items-center justify-center text-fluent-neutral-70 disabled:opacity-50"
        >
          <Mail20Regular />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md bg-fluent-neutral-8 hover:bg-fluent-neutral-10 text-fluent-neutral-90 text-sm font-medium disabled:opacity-50"
        >
          <Mail20Regular className="h-4 w-4" />
          {label}
        </button>
      )}

      <EmailComposerModal
        open={open}
        onClose={() => setOpen(false)}
        context={{ projectId, projectCode, taskId: taskId ?? null, questionId: questionId ?? null }}
        recipients={recipients}
        defaultTo={defaultTo}
        defaultSubject={defaultSubject}
        defaultBody={defaultBody}
        onSend={sendProjectEmail}
      />
    </>
  );
}
