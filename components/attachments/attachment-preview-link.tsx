'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Dismiss20Regular,
  Document20Regular,
  DocumentPdf20Regular,
  Image20Regular,
  Open16Regular,
} from '@fluentui/react-icons';

export type AttachmentPreviewFile = {
  id: string;
  name: string;
  title: string | null;
  mimeType: string;
  url: string;
};

function FileTypeIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf') {
    return <DocumentPdf20Regular className="h-5 w-5 shrink-0 text-fluent-accent-red" />;
  }
  if (mimeType.startsWith('image/')) {
    return <Image20Regular className="h-5 w-5 shrink-0 text-fluent-blue-600" />;
  }
  return <Document20Regular className="h-5 w-5 shrink-0 text-fluent-neutral-60" />;
}

function ImageHoverPreview({ file, label, id }: { file: AttachmentPreviewFile; label: string; id: string }) {
  return createPortal(
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none fixed left-1/2 top-1/2 z-[70] flex h-[600px] w-[600px] max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-black/10 bg-white p-4 shadow-fluent-28"
    >
      <div className="mb-3 truncate text-sm font-semibold text-fluent-neutral-90">{label}</div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-fluent-neutral-4">
        <img src={file.url} alt={label} className="max-h-full max-w-full object-contain" loading="lazy" />
      </div>
      <div className="mt-3 text-center text-[11px] text-fluent-neutral-60">Κλικ για προβολή σε μεγαλύτερο μέγεθος</div>
    </div>,
    document.body,
  );
}

function AttachmentViewer({ file, label, onClose }: { file: AttachmentPreviewFile; label: string; onClose: () => void }) {
  const isPdf = file.mimeType === 'application/pdf';

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    // Capture and stop the event so an enclosing task modal stays open.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-fluent-28">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/5 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold text-fluent-neutral-90">{label}</h2>
            <p className="text-[11px] text-fluent-neutral-60">{isPdf ? 'Προβολή PDF' : 'Προβολή εικόνας'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-fluent-blue-700 hover:bg-fluent-blue-50"
            >
              <Open16Regular />
              Άνοιγμα πρωτότυπου
            </a>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-fluent-neutral-70 hover:bg-fluent-neutral-8"
              aria-label="Κλείσιμο προεπισκόπησης"
              autoFocus
            >
              <Dismiss20Regular />
            </button>
          </div>
        </div>

        {isPdf ? (
          <div className="flex min-h-0 flex-1 flex-col bg-fluent-neutral-4">
            <iframe src={`${file.url}#view=FitH`} title={label} className="min-h-0 w-full flex-1 border-0" />
            <div className="shrink-0 border-t border-black/5 bg-white px-4 py-2 text-center text-[11px] text-fluent-neutral-60">
              Αν το PDF δεν εμφανίζεται, χρησιμοποίησε το «Άνοιγμα πρωτότυπου».
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-fluent-neutral-4 p-4">
            <img src={file.url} alt={label} className="max-h-full max-w-full object-contain" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function AttachmentPreviewLink({
  attachment,
  compact = false,
  showOriginalName = false,
}: {
  attachment: AttachmentPreviewFile;
  compact?: boolean;
  showOriginalName?: boolean;
}) {
  const [hoverPreview, setHoverPreview] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const tooltipId = useId();
  const isImage = attachment.mimeType.startsWith('image/');
  const isPdf = attachment.mimeType === 'application/pdf';
  const isPreviewable = isImage || isPdf;
  const label = attachment.title || attachment.name;

  const content = (
    <>
      {isImage ? (
        <span className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} shrink-0 overflow-hidden rounded-md border border-fluent-neutral-20 bg-fluent-neutral-4`}>
          <img src={attachment.url} alt="" className="h-full w-full object-cover" loading="lazy" />
        </span>
      ) : (
        <FileTypeIcon mimeType={attachment.mimeType} />
      )}
      <span className={`min-w-0 ${compact ? 'max-w-[180px]' : 'flex-1'}`}>
        <span className="block truncate font-medium">{label}</span>
        {showOriginalName && attachment.title && (
          <span className="block truncate text-[11px] font-normal text-fluent-neutral-60">{attachment.name}</span>
        )}
      </span>
    </>
  );

  const sharedClass = `${compact ? 'inline-flex max-w-full' : 'flex w-full flex-1'} items-center gap-2 min-w-0 text-left text-fluent-blue-700 hover:underline`;

  return (
    <>
      {isPreviewable ? (
        <button
          type="button"
          className={sharedClass}
          onClick={() => {
            setHoverPreview(false);
            setViewerOpen(true);
          }}
          onMouseEnter={() => isImage && setHoverPreview(true)}
          onMouseLeave={() => setHoverPreview(false)}
          onFocus={() => isImage && setHoverPreview(true)}
          onBlur={() => setHoverPreview(false)}
          aria-describedby={isImage && hoverPreview ? tooltipId : undefined}
          aria-haspopup="dialog"
          aria-label={`Προεπισκόπηση ${label}`}
        >
          {content}
        </button>
      ) : (
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          className={sharedClass}
          title={label}
        >
          {content}
        </a>
      )}

      {isImage && hoverPreview && !viewerOpen && <ImageHoverPreview file={attachment} label={label} id={tooltipId} />}
      {viewerOpen && <AttachmentViewer file={attachment} label={label} onClose={() => setViewerOpen(false)} />}
    </>
  );
}
