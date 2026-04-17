'use client';

import { useActionState, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { updateProfile, type ProfileUpdateState } from './actions';

type Props = {
  initial: { name: string; email: string; image: string | null; role: string };
};

const initialState: ProfileUpdateState = { ok: false };
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_BYTES = 5 * 1024 * 1024;

export function ProfileForm({ initial }: Props) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initial.image);
  const [removed, setRemoved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLocalError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setLocalError('Το αρχείο υπερβαίνει τα 5MB.');
      e.target.value = '';
      return;
    }
    setRemoved(false);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleRemove() {
    setPreview(null);
    setRemoved(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <form action={formAction} className="space-y-6 max-w-xl">
      <div className="flex items-center gap-5">
        {preview ? (
          <img src={preview} alt="" className="h-20 w-20 rounded-full object-cover ring-2 ring-white shadow-fluent-4" />
        ) : (
          <div className="h-20 w-20 rounded-full bg-fluent-blue-500 text-white flex items-center justify-center text-2xl font-semibold ring-2 ring-white shadow-fluent-4">
            {(initial.name || initial.email).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-fluent-neutral-90 truncate">{initial.email}</div>
          <div className="text-[11px] uppercase tracking-wider text-fluent-neutral-50 mt-0.5">{initial.role}</div>
          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Μεταφόρτωση εικόνας
            </Button>
            {preview && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemove}>
                Αφαίρεση
              </Button>
            )}
          </div>
          <p className="text-xs text-fluent-neutral-60 mt-1.5">PNG, JPG, WEBP ή GIF. Μέγιστο 5MB.</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        name="avatarFile"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
      <input type="hidden" name="removeAvatar" value={removed ? '1' : '0'} />

      <div>
        <label className="block text-sm font-medium text-fluent-neutral-80 mb-1.5">Όνομα</label>
        <input
          name="name"
          defaultValue={initial.name}
          required
          minLength={2}
          className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
        />
      </div>

      <div className="pt-4 border-t border-black/5">
        <h3 className="font-display font-semibold text-fluent-neutral-90 mb-3">Αλλαγή κωδικού</h3>
        <div className="space-y-3">
          <input
            name="currentPassword"
            type="password"
            placeholder="Τρέχων κωδικός"
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
          <input
            name="newPassword"
            type="password"
            placeholder="Νέος κωδικός (ελάχ. 8 χαρ.)"
            minLength={8}
            className="w-full h-10 px-3 rounded-md border border-fluent-neutral-20 text-sm focus:border-fluent-blue-500 focus:outline-none"
          />
        </div>
        <p className="text-xs text-fluent-neutral-60 mt-2">Αφήστε κενά τα πεδία για να μην αλλάξετε τον κωδικό.</p>
      </div>

      {(localError || state.error) && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          {localError ?? state.error}
        </div>
      )}
      {state.ok && state.message && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm">
          {state.message}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>
    </form>
  );
}
