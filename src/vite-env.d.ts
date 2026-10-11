/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" for the single-file embed build. */
  readonly VITE_EMBED?: string;
  /** Repository URL shown in the app footer. */
  readonly VITE_REPO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
