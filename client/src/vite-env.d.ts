/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_SOCKET_URL?: string;
    readonly VITE_CLIENT_NAME?: string;
    // more env variables can be added here
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
