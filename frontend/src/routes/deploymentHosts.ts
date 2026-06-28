const defaultMainHost = 'lens-rhyme.tensorbytes.com';
const defaultAdminHost = 'admin.lens-rhyme.tensorbytes.com';

export function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase();
}

export function getMainAppHost(): string {
  return normalizeHost(import.meta.env.VITE_MAIN_APP_HOST ?? defaultMainHost);
}

export function getAdminAppHost(): string {
  return normalizeHost(import.meta.env.VITE_ADMIN_APP_HOST ?? defaultAdminHost);
}

export function isAdminHost(hostname = globalThis.location?.hostname ?? ''): boolean {
  return normalizeHost(hostname) === getAdminAppHost();
}
