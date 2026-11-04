export function parseIsolatedDatabaseUrl(raw: string | undefined, allowedUsers: readonly string[]): URL {
  if (!raw) throw new Error('DATABASE_URL required');
  let target: URL;
  let username: string;
  try {
    target = new URL(raw);
    username = decodeURIComponent(target.username);
    decodeURIComponent(target.password);
  } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['localhost', '127.0.0.1', '[::1]', 'postgres', 'db'].includes(target.hostname) ||
      !/^\/soundpub_(dev|test)(_[a-zA-Z0-9_]+)?$/.test(target.pathname) ||
      !allowedUsers.includes(username) || !target.password ||
      (target.port !== '' && (!/^\d+$/.test(target.port) || Number(target.port) < 1 || Number(target.port) > 65535)) ||
      target.search || target.hash) {
    throw new Error('Phase 2 requires an isolated PostgreSQL target and approved dedicated user');
  }
  return target;
}

export function assertFoundationEnvironment(value: string | undefined): void {
  if (!['development', 'test'].includes(value ?? 'development')) {
    throw new Error('Phase 2 runtime permits only isolated development and test environments');
  }
}
