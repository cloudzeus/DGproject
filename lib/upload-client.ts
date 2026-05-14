// Browser-side upload helper that uses XMLHttpRequest so we can hook the
// `upload.onprogress` event for a real-time progress bar.
//
// Why XHR instead of fetch:
//   - `fetch` doesn't expose request upload progress in browsers yet (only
//     download progress via ReadableStream). XHR does.
//   - We want a single uniform API: pass a File + URL, get a Promise that
//     resolves with the server JSON, plus an onProgress callback that fires
//     0..100 during the upload.

export type UploadProgress = {
  loaded: number;
  total: number;
  pct: number; // 0..100
};

export type UploadResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

export type UploadOpts = {
  /** Target endpoint, e.g. /api/upload/task-attachment/abc123 */
  url: string;
  /** The file to upload. Stored under FormData field "file". */
  file: File;
  /** Optional FormData fields tacked onto the request. */
  fields?: Record<string, string>;
  /** Fires repeatedly with current upload progress. */
  onProgress?: (p: UploadProgress) => void;
  /** Optional AbortSignal to cancel the upload. */
  signal?: AbortSignal;
};

export function uploadFileWithProgress<T = unknown>(opts: UploadOpts): Promise<UploadResult<T>> {
  const { url, file, fields = {}, onProgress, signal } = opts;
  return new Promise<UploadResult<T>>((resolve) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file);
    for (const [k, v] of Object.entries(fields)) {
      fd.append(k, v);
    }

    if (signal) {
      if (signal.aborted) {
        resolve({ ok: false, status: 0, data: null, error: 'aborted' });
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (!onProgress) return;
      const total = e.lengthComputable ? e.total : file.size;
      const loaded = e.loaded;
      const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      onProgress({ loaded, total, pct });
    });

    xhr.addEventListener('load', () => {
      let data: T | null = null;
      let error: string | null = null;
      const text = xhr.responseText;
      if (text) {
        try {
          data = JSON.parse(text) as T;
        } catch {
          error = `Non-JSON response: ${text.slice(0, 200)}`;
        }
      }
      const ok = xhr.status >= 200 && xhr.status < 300;
      if (!ok && !error) {
        // Try to pull a structured error from the parsed payload.
        const maybeError =
          data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)
            ? String((data as Record<string, unknown>).error)
            : null;
        error = maybeError ?? `HTTP ${xhr.status}`;
      }
      resolve({ ok, status: xhr.status, data, error });
    });

    xhr.addEventListener('error', () => {
      resolve({
        ok: false,
        status: xhr.status || 0,
        data: null,
        error: 'Network error (check connection or proxy body-size limits).',
      });
    });

    xhr.addEventListener('timeout', () => {
      resolve({ ok: false, status: 0, data: null, error: 'Upload timed out.' });
    });

    xhr.addEventListener('abort', () => {
      resolve({ ok: false, status: 0, data: null, error: 'Upload cancelled.' });
    });

    xhr.open('POST', url, true);
    // No Content-Type header here — the browser sets it (including the
    // multipart boundary) when you pass a FormData body.
    xhr.send(fd);
  });
}
