import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';

const chrome = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
const pageUrl = process.env.SOUNDPUB_EGRESS_URL || 'http://127.0.0.1:8281/auth';
const port = await new Promise((resolvePort, rejectPort) => {
  const server = createServer();
  server.once('error', rejectPort);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(error => error ? rejectPort(error) : resolvePort(address.port));
  });
});
const userDataDir = await mkdtemp(join(tmpdir(), 'soundpub-egress-chrome-'));
const browser = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  ...(process.platform === 'win32' ? [] : ['--no-sandbox', '--disable-dev-shm-usage']),
  `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
async function endpoint(path) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: path.startsWith('/json/new') ? 'PUT' : 'GET' });
      if (response.ok) return response.json();
    } catch {}
    if (Date.now() >= deadline) throw new Error('Chrome debugging endpoint unavailable');
    await delay(100);
  }
}

try {
  const page = await endpoint('/json/new?about:blank');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const requests = [];
  const exceptions = [];
  let sequence = 0;
  const pending = new Map();
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });
  socket.addEventListener('message', message => {
    const payload = JSON.parse(String(message.data));
    if (payload.method === 'Network.requestWillBeSent') requests.push(payload.params.request.url);
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params.exceptionDetails;
      exceptions.push([
        details.text,
        details.exception?.description,
        details.url,
        details.lineNumber,
        details.columnNumber,
      ].filter(Boolean).join(' | ').slice(0, 1000));
    }
    if (payload.id && pending.has(payload.id)) {
      const resolveCommand = pending.get(payload.id);
      pending.delete(payload.id);
      resolveCommand(payload);
    }
  });
  const command = (method, params = {}) => new Promise(resolveCommand => {
    const id = ++sequence;
    pending.set(id, resolveCommand);
    socket.send(JSON.stringify({ id, method, params }));
  });
  await command('Network.enable');
  await command('Page.enable');
  await command('Runtime.enable');
  const navigation = await command('Page.navigate', { url: pageUrl });
  assert.ok(!navigation.error, JSON.stringify(navigation.error));
  await delay(15_000);
  assert.deepEqual(exceptions, [], `Browser runtime exceptions: ${exceptions.join('; ')}`);
  const dom = await command('Runtime.evaluate', {
    expression: `JSON.stringify({
      email: Boolean(document.querySelector('#login-email')),
      password: Boolean(document.querySelector('#login-password')),
      title: document.title
    })`,
    returnByValue: true,
  });
  const rendered = JSON.parse(dom.result.result.value);
  assert.equal(rendered.email, true, `Login email input missing. Title: ${rendered.title}`);
  assert.equal(rendered.password, true, `Login password input missing. Title: ${rendered.title}`);
  for (const label of ['Login dengan Google', 'Login dengan SSO (Label)']) {
    const click = await command('Runtime.evaluate', {
      expression: `(() => {
        const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === ${JSON.stringify(label)});
        if (!button) return false;
        button.click();
        return true;
      })()`,
      returnByValue: true,
    });
    assert.equal(click.result.result.value, true, `Button missing: ${label}`);
    await delay(300);
  }
  assert.deepEqual(exceptions, [], `Browser runtime exceptions after login options: ${exceptions.join('; ')}`);
  const validation = await command('Runtime.evaluate', {
    expression: `(() => {
      const submit = document.querySelector('#login-password')?.closest('form')?.querySelector('button[type="submit"]');
      if (!submit) return false;
      submit.click();
      return true;
    })()`,
    returnByValue: true,
  });
  assert.equal(validation.result.result.value, true, 'Login submit button missing');
  await delay(300);
  const message = await command('Runtime.evaluate', {
    expression: `document.body.textContent.includes('Email tidak valid')`, returnByValue: true,
  });
  assert.equal(message.result.result.value, true, 'Zod validation message not displayed');
  assert.deepEqual(exceptions, [], `Browser runtime exceptions after validation: ${exceptions.join('; ')}`);
  assert.ok(requests.some(url => url.includes('/api/v1/auth/session')),
    `Backend session request missing. Requests: ${requests.length}. Exceptions: ${exceptions.join('; ')}. Paths: ${requests.slice(-12).map(url => { try { return new URL(url).pathname; } catch { return url; } }).join(', ')}`);
  const forbidden = requests.filter(url => /supabase\.invalid|sso\.invalid|\/rest\/v1|\/auth\/v1|\/functions\/v1/.test(url));
  const safeRequest = value => { try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '[invalid URL]'; } };
  assert.deepEqual(forbidden, [], `Forbidden frontend egress: ${forbidden.map(safeRequest).join(', ')}`);
  const allowedExternalOrigins = new Set(['https://fonts.googleapis.com', 'https://fonts.gstatic.com']);
  const unexpectedExternal = requests.filter(url => /^https?:/.test(url)).filter(url => {
    const host = new URL(url).hostname;
    return host !== '127.0.0.1' && host !== 'localhost' && !allowedExternalOrigins.has(new URL(url).origin);
  });
  assert.deepEqual(unexpectedExternal, [], `Unexpected frontend egress: ${unexpectedExternal.map(safeRequest).join(', ')}`);
  console.log(JSON.stringify({ page: new URL(pageUrl).pathname, requests: requests.length, forbiddenEgress: 0, loginRendered: true }));
  socket.close();
} finally {
  browser.kill();
  if (browser.exitCode === null) await Promise.race([once(browser, 'exit'), delay(5_000)]);
  const safeRoot = resolve(tmpdir()) + '\\';
  if (!resolve(userDataDir).startsWith(safeRoot)) throw new Error('Unsafe browser temp path');
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await rm(userDataDir, { recursive: true, force: true }); break; }
    catch (error) {
      if (attempt === 9 || !['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      await delay(250);
    }
  }
}
