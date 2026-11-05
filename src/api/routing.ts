const backendDomains = new Set(
  String(import.meta.env.VITE_SOUNDPUB_BACKEND_DOMAINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
);

export const usesBackendDomain = (domain: string) => backendDomains.has(domain);
export const usesBackendCopyrightRegistration = () => usesBackendDomain('copyright-registration');

