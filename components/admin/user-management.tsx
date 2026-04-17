'use client';

import { useState, useTransition, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Delete20Regular, Edit20Regular, Add20Filled,
  ArrowUpload20Regular, Dismiss20Regular,
} from '@fluentui/react-icons';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  createUser,
  updateUser,
  deleteUser,
  uploadUserAvatar,
  removeUserAvatar,
  syncUserAvatarFromMicrosoft,
} from '@/app/(app)/admin/users/actions';

type Role = 'admin' | 'manager' | 'member' | 'viewer';

type DepartmentOption = { id: string; name: string; color: string };

type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  hasMicrosoftAccount: boolean;
  createdAt: string;
  departmentIds: string[];
};

const roleVariant: Record<Role, 'red' | 'orange' | 'blue' | 'neutral'> = {
  admin: 'red',
  manager: 'orange',
  member: 'blue',
  viewer: 'neutral',
};

const roleLabel: Record<Role, string> = {
  admin: 'Διαχειριστής',
  manager: 'Διευθυντής',
  member: 'Μέλος',
  viewer: 'Προβολή',
};

export function UserManagementClient({
  initialUsers,
  departments,
}: {
  initialUsers: UserRow[];
  departments: DepartmentOption[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submitCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createUser(formData);
      if (res?.ok) setShowAdd(false);
      else if (res?.error) setError(res.error);
    });
  }

  function submitUpdate(id: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateUser(id, formData);
      if (res?.ok) setEditingId(null);
      else if (res?.error) setError(res.error);
    });
  }

  function confirmDelete(id: string) {
    if (!confirm('Να διαγραφεί ο χρήστης;')) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteUser(id);
      if (res && !res.ok && res.error) setError(res.error);
    });
  }

  async function uploadAvatar(userId: string, file: File) {
    setUploadingId(userId);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    const res = await uploadUserAvatar(userId, fd);
    if (!res.ok) setError(res.error ?? 'Αποτυχία μεταφόρτωσης εικόνας.');
    setUploadingId(null);
  }

  async function syncMicrosoftAvatar(userId: string) {
    setUploadingId(userId);
    setError(null);
    const res = await syncUserAvatarFromMicrosoft(userId);
    if (!res.ok) setError(res.error ?? 'Αποτυχία συγχρονισμού από Microsoft.');
    setUploadingId(null);
  }

  async function clearAvatar(userId: string) {
    if (!confirm('Να αφαιρεθεί η εικόνα του χρήστη;')) return;
    setUploadingId(userId);
    setError(null);
    await removeUserAvatar(userId);
    setUploadingId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-display text-2xl font-semibold">Διαχείριση Χρηστών</h2>
        <Button variant="primary" size="md" icon={<Add20Filled />} onClick={() => { setShowAdd(true); setError(null); }}>
          Νέος Χρήστης
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">{error}</div>
      )}

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-xl border border-black/5 shadow-fluent-2 p-6"
          >
            <UserForm
              mode="create"
              departments={departments}
              pending={pending}
              onCancel={() => setShowAdd(false)}
              onSubmit={submitCreate}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white rounded-xl border border-black/5 shadow-fluent-2 overflow-hidden">
        <div className="divide-y divide-black/5">
          {initialUsers.map((user) => {
            const userDepts = departments.filter((d) => user.departmentIds.includes(d.id));
            const avatarUser = { name: user.name || user.email, avatarUrl: user.image ?? undefined };
            const isEditing = editingId === user.id;
            return (
              <div key={user.id} className="p-4">
                {isEditing ? (
                  <UserForm
                    mode="edit"
                    initial={user}
                    departments={departments}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(fd) => submitUpdate(user.id, fd)}
                  />
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="relative group shrink-0">
                      <Avatar user={avatarUser} size="md" />
                      <label className={`absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer ${uploadingId === user.id ? 'opacity-100' : ''}`}>
                        <ArrowUpload20Regular className="text-white h-4 w-4" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(user.id, f); }}
                          disabled={uploadingId === user.id}
                        />
                      </label>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-fluent-neutral-95 truncate">{user.name}</p>
                      <p className="text-xs text-fluent-neutral-60 truncate">{user.email}</p>
                      {userDepts.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {userDepts.map((d) => (
                            <span
                              key={d.id}
                              className="text-[11px] px-2 py-0.5 rounded-full text-white"
                              style={{ background: d.color }}
                            >
                              {d.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <Badge variant={roleVariant[user.role]}>{roleLabel[user.role]}</Badge>

                    <div className="flex items-center gap-1">
                      {user.hasMicrosoftAccount && (
                        <button
                          onClick={() => syncMicrosoftAvatar(user.id)}
                          disabled={uploadingId === user.id}
                          className="h-8 px-2 rounded-md border border-fluent-blue-200 text-fluent-blue-700 hover:bg-fluent-blue-50 inline-flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                          title="Λήψη φωτογραφίας από Microsoft 365"
                        >
                          <svg viewBox="0 0 23 23" className="h-3.5 w-3.5" aria-hidden>
                            <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                            <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                            <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                            <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                          </svg>
                          Microsoft
                        </button>
                      )}
                      {user.image && (
                        <button
                          onClick={() => clearAvatar(user.id)}
                          disabled={uploadingId === user.id}
                          className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70 disabled:opacity-50"
                          aria-label="Αφαίρεση εικόνας"
                          title="Αφαίρεση εικόνας"
                        >
                          <Dismiss20Regular className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingId(user.id); setError(null); }}
                        className="h-8 w-8 rounded-md hover:bg-fluent-neutral-8 flex items-center justify-center text-fluent-neutral-70"
                        aria-label="Επεξεργασία"
                      >
                        <Edit20Regular className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => confirmDelete(user.id)}
                        className="h-8 w-8 rounded-md hover:bg-fluent-accent-red hover:text-white flex items-center justify-center text-fluent-neutral-70"
                        aria-label="Διαγραφή"
                      >
                        <Delete20Regular className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UserForm({
  mode,
  initial,
  departments,
  pending,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial?: UserRow;
  departments: DepartmentOption[];
  pending: boolean;
  onSubmit: (fd: FormData) => void;
  onCancel: () => void;
}) {
  const [selectedDepts, setSelectedDepts] = useState<string[]>(initial?.departmentIds ?? []);
  const formRef = useRef<HTMLFormElement>(null);

  function toggleDept(id: string) {
    setSelectedDepts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Όνομα</label>
          <input
            name="name"
            defaultValue={initial?.name ?? ''}
            required
            minLength={2}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={initial?.email ?? ''}
            required
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">
            {mode === 'create' ? 'Κωδικός' : 'Νέος κωδικός (προαιρ.)'}
          </label>
          <input
            name={mode === 'create' ? 'password' : 'newPassword'}
            type="password"
            required={mode === 'create'}
            minLength={8}
            placeholder={mode === 'edit' ? 'Αφήστε κενό για να μην αλλάξει' : undefined}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-fluent-neutral-70 mb-1">Ρόλος</label>
          <select
            name="role"
            defaultValue={initial?.role ?? 'member'}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          >
            <option value="admin">Διαχειριστής</option>
            <option value="manager">Διευθυντής</option>
            <option value="member">Μέλος</option>
            <option value="viewer">Προβολή</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-fluent-neutral-70 mb-1.5">Τμήματα</label>
        {departments.length === 0 ? (
          <p className="text-xs text-fluent-neutral-60">Δεν υπάρχουν ακόμη τμήματα.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {departments.map((d) => {
              const active = selectedDepts.includes(d.id);
              return (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => toggleDept(d.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all inline-flex items-center gap-1.5 ${
                    active ? 'text-white border-transparent' : 'border-fluent-neutral-20 text-fluent-neutral-80 hover:bg-fluent-neutral-4'
                  }`}
                  style={active ? { background: d.color } : undefined}
                >
                  {active && <Dismiss20Regular className="h-3 w-3" />}
                  {d.name}
                </button>
              );
            })}
          </div>
        )}
        {selectedDepts.map((id) => (
          <input key={id} type="hidden" name="departmentIds" value={id} />
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Ακύρωση
        </Button>
      </div>
    </form>
  );
}
