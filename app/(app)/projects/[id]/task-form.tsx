'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
  Dismiss20Regular, Attach20Regular, Delete20Regular,
  DocumentPdf20Regular, Image20Regular, Document20Regular,
  Calendar20Regular, PeopleTeam20Regular,
  CheckmarkCircle20Filled,
  BookmarkAdd20Regular, BookmarkMultiple20Regular,
} from '@fluentui/react-icons';
import { Button } from '@/components/ui/button';
import { deleteTaskAttachment } from './task-actions';
import { SendEmailButton } from '@/components/email/send-email-button';
import { uploadFileWithProgress, type UploadProgress } from '@/lib/upload-client';
import { useRouter } from 'next/navigation';
import {
  TaskQuestionsPanel,
  type TaskQuestionInfo,
  type ProjectMemberOption,
} from './task-questions-panel';
import {
  listTaskTemplates,
  saveTaskTemplate,
  deleteTaskTemplate,
  type TaskTemplateOption,
} from './template-actions';

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Προς εκτέλεση' },
  { value: 'in_progress', label: 'Σε εξέλιξη' },
  { value: 'review', label: 'Προς έλεγχο' },
  { value: 'done', label: 'Ολοκληρωμένο' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Χαμηλή' },
  { value: 'medium', label: 'Μεσαία' },
  { value: 'high', label: 'Υψηλή' },
  { value: 'urgent', label: 'Επείγουσα' },
];

export type TaskAssigneeOption = { id: string; name: string; email: string };

export type TaskAttachmentInfo = {
  id: string;
  name: string;
  title: string | null;
  size: number;
  mimeType: string;
  url: string;
};

export type TaskFormInitial = {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: Date | null;
  dueDate: Date | null;
  estimatedHours: number | null;
  assigneeIds: string[];
  addToCalendar?: boolean;
  addToTeams?: boolean;
  dependencyIds?: string[];
};

export type TaskOption = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
};

function toDateTimeInput(d: Date | null | undefined): string {
  if (!d) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  members: TaskAssigneeOption[];
  initial?: TaskFormInitial;
  submitLabel: string;
  onSubmit: (fd: FormData) => Promise<{ ok: boolean; error?: string } | void>;
  onCancel: () => void;
  projectId?: string;
  projectCode?: string | null;
  taskId?: string;
  taskTitleForEmail?: string;
  attachments?: TaskAttachmentInfo[];
  questions?: TaskQuestionInfo[];
  questionMembers?: ProjectMemberOption[];
  currentUserId?: string;
  isPrivileged?: boolean;
  /** Tasks in this project that can be picked as prerequisites for this task. */
  availableDependencies?: TaskOption[];
  /** When true: task fields render as disabled/read-only. Q&A panel stays interactive. */
  readOnly?: boolean;
};

export function TaskForm({
  members,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  projectId,
  projectCode,
  taskId,
  taskTitleForEmail,
  attachments,
  questions,
  questionMembers,
  currentUserId,
  isPrivileged,
  availableDependencies = [],
  readOnly = false,
}: Props) {
  const [assignees, setAssignees] = useState<string[]>(initial?.assigneeIds ?? []);
  const [dependencies, setDependencies] = useState<string[]>(initial?.dependencyIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Refs into uncontrolled inputs so applying a template can prefill them
  // without forcing a full controlled-component refactor.
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const priorityRef = useRef<HTMLSelectElement>(null);
  const estimatedHoursRef = useRef<HTMLInputElement>(null);

  // Sync flags managed in state so a template can flip them programmatically.
  const [addToCalendarChecked, setAddToCalendarChecked] = useState(initial?.addToCalendar ?? true);
  const [addToTeamsChecked, setAddToTeamsChecked] = useState(initial?.addToTeams ?? false);

  // Templates are loaded lazily on first edit (only if the form is editable).
  const isEdit = Boolean(taskId);
  const showTemplates = !readOnly && !isEdit;
  const [templates, setTemplates] = useState<TaskTemplateOption[] | null>(null);
  useEffect(() => {
    if (!showTemplates) return;
    let cancelled = false;
    listTaskTemplates()
      .then((list) => {
        if (!cancelled) setTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showTemplates]);

  function applyTemplate(t: TaskTemplateOption) {
    if (titleRef.current) titleRef.current.value = t.title;
    if (descriptionRef.current) descriptionRef.current.value = t.description ?? '';
    if (priorityRef.current) priorityRef.current.value = t.priority;
    if (estimatedHoursRef.current)
      estimatedHoursRef.current.value = t.estimatedHours !== null ? String(t.estimatedHours) : '';
    setAddToCalendarChecked(t.addToCalendar);
    setAddToTeamsChecked(t.addToTeams);
  }

  function toggleAssignee(id: string) {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleDependency(id: string) {
    setDependencies((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(formData);
      if (res && !res.ok && res.error) setError(res.error);
    });
  }

  const inputCls = `w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none ${readOnly ? 'bg-fluent-neutral-4 text-fluent-neutral-80 cursor-not-allowed' : ''}`;
  const textareaCls = `w-full px-3 py-2 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none ${readOnly ? 'bg-fluent-neutral-4 text-fluent-neutral-80 cursor-not-allowed' : ''}`;
  const selectCls = `w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none ${readOnly ? 'bg-fluent-neutral-4 text-fluent-neutral-80 cursor-not-allowed' : 'bg-white'}`;

  return (
    <form action={readOnly ? undefined : handleSubmit} className="space-y-4">
      {readOnly && (
        <div className="bg-fluent-blue-50 border border-fluent-blue-200 text-fluent-blue-800 text-xs rounded-md px-3 py-2">
          Προβολή μόνο. Μπορείς να δεις την εργασία και να συμμετέχεις στις ερωτήσεις.
        </div>
      )}
      {showTemplates && templates !== null && templates.length > 0 && (
        <TemplatePicker templates={templates} onApply={applyTemplate} />
      )}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-fluent-neutral-70">Τίτλος</label>
          {isEdit && projectId && projectCode && questionMembers && questionMembers.length > 0 && (
            <SendEmailButton
              projectId={projectId}
              projectCode={projectCode}
              taskId={taskId ?? null}
              defaultSubject={`[${taskTitleForEmail ?? initial?.title ?? 'Task'}]`}
              recipients={questionMembers.map((m) => ({
                id: m.id,
                name: m.name,
                email: m.email,
                avatarUrl: m.avatarUrl,
              }))}
              variant="labelled"
              label="Αποστολή email"
            />
          )}
        </div>
        <input
          ref={titleRef}
          name="title"
          defaultValue={initial?.title ?? ''}
          required={!readOnly}
          minLength={2}
          autoFocus={!readOnly}
          readOnly={readOnly}
          disabled={readOnly}
          className={inputCls}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Περιγραφή</label>
        <textarea
          ref={descriptionRef}
          name="description"
          defaultValue={initial?.description ?? ''}
          rows={3}
          readOnly={readOnly}
          disabled={readOnly}
          className={textareaCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Κατάσταση</label>
          <select
            name="status"
            defaultValue={initial?.status ?? 'todo'}
            disabled={readOnly}
            className={selectCls}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Προτεραιότητα</label>
          <select
            ref={priorityRef}
            name="priority"
            defaultValue={initial?.priority ?? 'medium'}
            disabled={readOnly}
            className={selectCls}
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Έναρξη</label>
          <input
            type="datetime-local"
            name="startDate"
            min="2020-01-01T09:00"
            defaultValue={toDateTimeInput(initial?.startDate ?? null)}
            readOnly={readOnly}
            disabled={readOnly}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Λήξη</label>
          <input
            type="datetime-local"
            name="dueDate"
            defaultValue={toDateTimeInput(initial?.dueDate ?? null)}
            readOnly={readOnly}
            disabled={readOnly}
            className={inputCls}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Εκτιμώμενες ώρες</label>
          <input
            ref={estimatedHoursRef}
            type="number"
            name="estimatedHours"
            step="0.25"
            min="0"
            defaultValue={initial?.estimatedHours ?? ''}
            placeholder="π.χ. 4.5"
            readOnly={readOnly}
            disabled={readOnly}
            className={inputCls}
          />
        </div>
      </div>

      <p className="text-[11px] text-fluent-neutral-60">
        Τα tasks περιορίζονται σε ώρες εργασίας 09:00–18:30. Ώρες εκτός ωραρίου μετατίθενται στο επόμενο 09:00.
      </p>

      {/* Sync preferences — what notifications fan out when this task is created/updated. */}
      <fieldset
        disabled={readOnly}
        className={`rounded-lg border p-3 ${
          readOnly
            ? 'border-fluent-neutral-20 bg-fluent-neutral-4'
            : 'border-fluent-blue-200 bg-fluent-blue-50/40'
        }`}
      >
        <legend className="px-2 text-[11px] font-semibold uppercase tracking-wider text-fluent-neutral-70">
          Συγχρονισμός
        </legend>
        <div className="space-y-2">
          <SyncToggle
            name="addToCalendar"
            checked={addToCalendarChecked}
            onChange={setAddToCalendarChecked}
            icon={<Calendar20Regular className="h-4 w-4 text-fluent-blue-600" />}
            label="Προσθήκη στο ημερολόγιο (Outlook)"
            hint="Δημιουργεί συμβάν για όλους τους υπεύθυνους με βάση τη λήξη."
            readOnly={readOnly}
          />
          <SyncToggle
            name="addToTeams"
            checked={addToTeamsChecked}
            onChange={setAddToTeamsChecked}
            icon={<PeopleTeam20Regular className="h-4 w-4 text-fluent-accent-purple" />}
            label="Δημοσίευση στο κανάλι Teams του έργου"
            hint="Στέλνει κάρτα με τίτλο, προτεραιότητα και προθεσμία στο συνδεδεμένο κανάλι."
            readOnly={readOnly}
          />
        </div>
      </fieldset>

      {/* Prerequisite tasks — must be completed before this task can start. */}
      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1.5 inline-flex items-center gap-1.5">
          Εξάρτηση από
          <span className="text-[10px] font-normal text-fluent-neutral-50">
            (ολοκληρώνονται πριν ξεκινήσει αυτή)
          </span>
        </label>
        <DependencyPicker
          options={availableDependencies.filter((o) => o.id !== taskId)}
          selectedIds={dependencies}
          onToggle={toggleDependency}
          readOnly={readOnly}
        />
        {dependencies.map((id) => (
          <input key={id} type="hidden" name="dependencyIds" value={id} />
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1.5">Ανάθεση σε</label>
        {members.length === 0 ? (
          <p className="text-xs text-fluent-neutral-60">Δεν υπάρχουν μέλη στο έργο.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 rounded-md border border-fluent-neutral-20">
            {members.map((u) => {
              const active = assignees.includes(u.id);
              return (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => !readOnly && toggleAssignee(u.id)}
                  disabled={readOnly}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1 ${
                    active
                      ? 'bg-fluent-blue-600 text-white border-transparent'
                      : 'border-fluent-neutral-20 text-fluent-neutral-80 hover:bg-fluent-neutral-4'
                  } ${readOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                >
                  {active && !readOnly && <Dismiss20Regular className="h-3 w-3" />}
                  {u.name || u.email}
                </button>
              );
            })}
          </div>
        )}
        {assignees.map((id) => (
          <input key={id} type="hidden" name="assigneeIds" value={id} />
        ))}
      </div>

      {projectId && taskId && (
        <AttachmentsPanel
          projectId={projectId}
          taskId={taskId}
          attachments={attachments ?? []}
          readOnly={readOnly}
        />
      )}

      {projectId && taskId && currentUserId && questionMembers && (
        <TaskQuestionsPanel
          projectId={projectId}
          projectCode={projectCode}
          taskId={taskId}
          taskTitle={taskTitleForEmail ?? initial?.title}
          currentUserId={currentUserId}
          isPrivileged={isPrivileged ?? false}
          members={questionMembers}
          questions={questions ?? []}
        />
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">{error}</div>}

      {!readOnly && (
        <SaveAsTemplatePanel
          getCurrentValues={() => ({
            title: titleRef.current?.value ?? '',
            description: descriptionRef.current?.value ?? '',
            priority: (priorityRef.current?.value as TaskPriority) ?? 'medium',
            estimatedHours: estimatedHoursRef.current?.value ?? '',
            addToCalendar: addToCalendarChecked,
            addToTeams: addToTeamsChecked,
          })}
        />
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" size="md" onClick={onCancel} disabled={pending}>
          {readOnly ? 'Κλείσιμο' : 'Ακύρωση'}
        </Button>
        {!readOnly && (
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? 'Αποθήκευση…' : submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

const DEP_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'Προς εκτέλεση',
  in_progress: 'Σε εξέλιξη',
  review: 'Προς έλεγχο',
  done: 'Ολοκληρωμένο',
};
const DEP_STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: '#8A8A8A',
  todo: '#0078D4',
  in_progress: '#D83B01',
  review: '#8764B8',
  done: '#107C10',
};

function DependencyPicker({
  options,
  selectedIds,
  onToggle,
  readOnly,
}: {
  options: TaskOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  readOnly: boolean;
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? options.filter((o) => o.title.toLowerCase().includes(trimmed))
    : options;

  if (options.length === 0) {
    return (
      <p className="text-xs text-fluent-neutral-60 bg-fluent-neutral-4 rounded-md px-3 py-2">
        Δεν υπάρχουν άλλες εργασίες στο έργο για επιλογή.
      </p>
    );
  }

  const selectedOptions = options.filter((o) => selectedIds.includes(o.id));

  return (
    <div className="space-y-2">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1.5 text-xs pl-2 pr-1 py-1 rounded-md border border-fluent-blue-200 bg-fluent-blue-50 text-fluent-blue-800 max-w-full"
            >
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: DEP_STATUS_COLOR[o.status] }}
                aria-hidden
              />
              <span className="truncate max-w-[220px]" title={o.title}>
                {o.title}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onToggle(o.id)}
                  className="h-5 w-5 rounded hover:bg-fluent-blue-100 flex items-center justify-center text-fluent-blue-700"
                  aria-label="Αφαίρεση"
                >
                  <Dismiss20Regular className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!readOnly && (
        <details className="rounded-md border border-fluent-neutral-20 bg-white">
          <summary className="cursor-pointer text-xs font-medium text-fluent-neutral-80 px-3 py-2 select-none">
            Επιλογή προαπαιτούμενης εργασίας…
          </summary>
          <div className="p-2 border-t border-fluent-neutral-20">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Αναζήτηση εργασίας…"
              className="w-full h-8 px-2 mb-2 rounded-md border border-fluent-neutral-20 text-xs focus:border-fluent-blue-500 focus:outline-none"
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-[11px] text-fluent-neutral-60 px-2 py-1.5">
                  Καμία εργασία δεν ταιριάζει.
                </p>
              )}
              {filtered.map((o) => {
                const active = selectedIds.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onToggle(o.id)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                      active
                        ? 'bg-fluent-blue-50 text-fluent-blue-700'
                        : 'hover:bg-fluent-neutral-4 text-fluent-neutral-90'
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: DEP_STATUS_COLOR[o.status] }}
                    />
                    <span className="flex-1 truncate">{o.title}</span>
                    <span className="text-[10px] text-fluent-neutral-50 shrink-0">
                      {DEP_STATUS_LABEL[o.status]}
                    </span>
                    {active && (
                      <CheckmarkCircle20Filled className="h-4 w-4 text-fluent-blue-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}

function SyncToggle({
  name,
  checked,
  onChange,
  icon,
  label,
  hint,
  readOnly,
}: {
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
  readOnly: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-md p-2 transition-colors ${
        readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-white/70'
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={readOnly}
        className="mt-0.5 h-4 w-4 accent-fluent-blue-600"
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-fluent-neutral-90 inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <span className="block text-[11px] text-fluent-neutral-60 mt-0.5">{hint}</span>
      </span>
    </label>
  );
}

function AttachmentsPanel({
  projectId,
  taskId,
  attachments,
  readOnly = false,
}: {
  projectId: string;
  taskId: string;
  attachments: TaskAttachmentInfo[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [title, setTitle] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [, startTransition] = useTransition();
  // Reference the projectId to avoid an unused-arg warning now that the
  // upload endpoint is keyed by taskId alone.
  void projectId;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setUploadError(null);
    setProgress(null);
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    setProgress({ loaded: 0, total: pendingFile.size, pct: 0 });

    const res = await uploadFileWithProgress<{ ok: boolean; error?: string }>({
      url: `/api/upload/task-attachment/${taskId}`,
      file: pendingFile,
      fields: title.trim() ? { title: title.trim() } : {},
      onProgress: (p) => setProgress(p),
    });
    setUploading(false);

    if (!res.ok) {
      setUploadError(res.data?.error ?? res.error ?? 'Σφάλμα μεταφόρτωσης.');
      return;
    }
    setPendingFile(null);
    setTitle('');
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
    startTransition(() => router.refresh());
  }

  function handleCancel() {
    setPendingFile(null);
    setTitle('');
    setUploadError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleRemove(id: string) {
    if (!confirm('Να διαγραφεί το συνημμένο;')) return;
    startTransition(async () => {
      await deleteTaskAttachment(projectId, id);
      router.refresh();
    });
  }

  return (
    <div className="pt-3 border-t border-black/5">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-fluent-neutral-70 inline-flex items-center gap-1.5">
          <Attach20Regular className="h-4 w-4" />
          Συνημμένα ({attachments.length})
        </label>
        {!readOnly && !pendingFile && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Επιλογή αρχείου
          </Button>
        )}
        {!readOnly && (
          <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
        )}
      </div>

      {!readOnly && pendingFile && (
        <div className="bg-fluent-neutral-4 border border-fluent-neutral-20 rounded-md p-3 mb-2 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <FileIcon mimeType={pendingFile.type} />
            <span className="flex-1 min-w-0 truncate font-medium text-fluent-neutral-90">
              {pendingFile.name}
            </span>
            <span className="text-[11px] text-fluent-neutral-60 tabular-nums">
              {formatBytes(pendingFile.size)}
            </span>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-fluent-neutral-70 mb-1">
              Περιγραφή αρχείου (προαιρ.)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="π.χ. Προσφορά πελάτη, Φωτογραφία χώρου…"
              disabled={uploading}
              className="w-full h-9 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none bg-white disabled:opacity-60"
            />
          </div>

          {/* Live upload progress — visible only while transferring. */}
          {uploading && progress && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-fluent-neutral-70 tabular-nums">
                <span>{progress.pct}%</span>
                <span>
                  {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-fluent-neutral-10 overflow-hidden">
                <div
                  className="h-full bg-fluent-blue-500 transition-all duration-200"
                  style={{ width: `${progress.pct}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleCancel} disabled={uploading}>
              Ακύρωση
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleUpload} disabled={uploading}>
              {uploading ? `Μεταφόρτωση… ${progress?.pct ?? 0}%` : 'Ανέβασμα'}
            </Button>
          </div>
        </div>
      )}

      {uploadError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mb-2">
          {uploadError}
        </div>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-fluent-neutral-60">Δεν υπάρχουν συνημμένα.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 text-sm rounded-md border border-fluent-neutral-20 px-2 py-1.5"
            >
              <FileIcon mimeType={a.mimeType} />
              <div className="flex-1 min-w-0">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-fluent-blue-700 hover:underline font-medium"
                  title={a.title ?? a.name}
                >
                  {a.title || a.name}
                </a>
                {a.title && (
                  <span className="block text-[11px] text-fluent-neutral-60 truncate">{a.name}</span>
                )}
              </div>
              <span className="text-[11px] text-fluent-neutral-60 tabular-nums shrink-0">
                {formatBytes(a.size)}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleRemove(a.id)}
                  className="h-7 w-7 rounded hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-60"
                  aria-label="Διαγραφή"
                >
                  <Delete20Regular className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/')) return <Image20Regular className="h-5 w-5 text-fluent-blue-600 shrink-0" />;
  if (mimeType === 'application/pdf') return <DocumentPdf20Regular className="h-5 w-5 text-fluent-accent-red shrink-0" />;
  return <Document20Regular className="h-5 w-5 text-fluent-neutral-60 shrink-0" />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function TaskModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative bg-white rounded-xl shadow-fluent-16 w-full max-w-xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-black/5 sticky top-0 bg-white z-10">
          <h2 className="font-display text-lg font-semibold text-fluent-neutral-90">{title}</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
            aria-label="Κλείσιμο"
          >
            <Dismiss20Regular />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

function TemplatePicker({
  templates,
  onApply,
}: {
  templates: TaskTemplateOption[];
  onApply: (t: TaskTemplateOption) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(trimmed) ||
          t.title.toLowerCase().includes(trimmed) ||
          (t.tags ?? '').toLowerCase().includes(trimmed),
      )
    : templates;

  function handleDelete(id: string) {
    if (!confirm('Να διαγραφεί το πρότυπο;')) return;
    startTransition(async () => {
      await deleteTaskTemplate(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-fluent-blue-200 bg-fluent-blue-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-3 py-2 flex items-center justify-between text-sm font-medium text-fluent-blue-800 hover:bg-fluent-blue-50 rounded-md"
      >
        <span className="inline-flex items-center gap-2">
          <BookmarkMultiple20Regular className="h-4 w-4" />
          Από πρότυπο
          <span className="text-[11px] text-fluent-blue-700/80 font-normal">
            ({templates.length} διαθέσιμα)
          </span>
        </span>
        <span className="text-[11px] text-fluent-blue-700">{open ? 'Κλείσιμο' : 'Επιλογή…'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση προτύπου…"
            className="w-full h-8 px-2 mb-2 rounded-md border border-fluent-blue-200 bg-white text-xs focus:border-fluent-blue-500 focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto space-y-1">
            {filtered.length === 0 && (
              <p className="text-[11px] text-fluent-neutral-60 px-2 py-1.5">
                Κανένα πρότυπο δεν ταιριάζει.
              </p>
            )}
            {filtered.map((t) => (
              <div
                key={t.id}
                className="flex items-start gap-2 rounded-md border border-fluent-neutral-20 bg-white p-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    onApply(t);
                    setOpen(false);
                  }}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-semibold text-fluent-neutral-90 truncate">{t.name}</div>
                  <div className="text-[11px] text-fluent-neutral-60 truncate">
                    {t.title}
                    {t.estimatedHours ? ` · ${t.estimatedHours}h` : ''}
                    {' · '}
                    <span className="text-fluent-neutral-50">από {t.createdByName}</span>
                  </div>
                </button>
                {t.isMine && (
                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="h-6 w-6 rounded hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-50 shrink-0"
                    aria-label="Διαγραφή"
                    title="Διαγραφή προτύπου"
                  >
                    <Delete20Regular className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type TemplateValuesGetter = () => {
  title: string;
  description: string;
  priority: TaskPriority;
  estimatedHours: string;
  addToCalendar: boolean;
  addToTeams: boolean;
};

function SaveAsTemplatePanel({ getCurrentValues }: { getCurrentValues: TemplateValuesGetter }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setError(null);
    setSaved(false);
    setOpen(false);
  }

  function handleSave() {
    setError(null);
    const vals = getCurrentValues();
    if (!name.trim()) {
      setError('Δώσε όνομα στο πρότυπο.');
      return;
    }
    if (!vals.title.trim() || vals.title.trim().length < 2) {
      setError('Συμπλήρωσε τίτλο εργασίας πριν αποθηκεύσεις πρότυπο.');
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('name', name.trim());
      fd.set('title', vals.title.trim());
      fd.set('description', vals.description);
      fd.set('priority', vals.priority);
      if (vals.estimatedHours) fd.set('estimatedHours', vals.estimatedHours);
      if (vals.addToCalendar) fd.set('addToCalendar', 'on');
      if (vals.addToTeams) fd.set('addToTeams', 'on');
      const res = await saveTaskTemplate(fd);
      if (!res.ok) {
        setError(res.error ?? 'Σφάλμα αποθήκευσης.');
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(reset, 1800);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-fluent-blue-700 hover:text-fluent-blue-800 font-medium inline-flex items-center gap-1.5"
      >
        <BookmarkAdd20Regular className="h-4 w-4" />
        Αποθήκευση ως πρότυπο
      </button>
    );
  }

  return (
    <div className="rounded-md border border-fluent-blue-200 bg-fluent-blue-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <BookmarkAdd20Regular className="h-4 w-4 text-fluent-blue-600" />
        <span className="text-xs font-semibold text-fluent-neutral-90">Αποθήκευση ως πρότυπο</span>
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="π.χ. «Εβδομαδιαία αναφορά πελάτη»"
        className="w-full h-9 px-2 rounded-md border border-fluent-neutral-20 bg-white text-sm focus:border-fluent-blue-500 focus:outline-none"
        maxLength={120}
      />
      <p className="text-[11px] text-fluent-neutral-60">
        Αποθηκεύονται: τίτλος, περιγραφή, προτεραιότητα, εκτιμώμενες ώρες και προτιμήσεις
        συγχρονισμού (Outlook / Teams).
      </p>
      {error && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </div>
      )}
      {saved && (
        <div className="text-[11px] text-fluent-accent-green inline-flex items-center gap-1.5">
          <CheckmarkCircle20Filled className="h-4 w-4" /> Αποθηκεύτηκε.
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={reset} disabled={pending}>
          Ακύρωση
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handleSave} disabled={pending}>
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση προτύπου'}
        </Button>
      </div>
    </div>
  );
}
