const trimSlash = (value: string) => value.replace(/\/+$/, '');

export const API_BASE_URL = trimSlash(import.meta.env.VITE_API_BASE_URL || '');
export const SOCKET_URL = trimSlash(import.meta.env.VITE_SOCKET_URL || API_BASE_URL);

export function buildApiUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${API_BASE_URL}${path}`;
}

export function getSocketUrl() {
  if (SOCKET_URL) return SOCKET_URL;
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  return fetch(buildApiUrl(path), options);
}
