/**
 * Build-time switches for where the app runs. The embed build targets
 * sandboxed hosts that block downloads, printing, and URL state, so the UI
 * offers clipboard equivalents there.
 */
export const EMBED = import.meta.env.VITE_EMBED === '1';

/** Link to the source repository, set at build time (the Pages workflow fills it in). */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? '';

export const can = {
  print: !EMBED,
  download: !EMBED,
  shareLink: !EMBED,
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** localStorage that never throws (private windows and sandboxes can refuse access). */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable; the app keeps working in memory */
    }
  },
};
