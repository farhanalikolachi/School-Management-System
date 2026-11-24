let csrfToken = '';
let sessionToken = '';

try {
  csrfToken = localStorage.getItem('sti_csrf') || '';
  sessionToken = localStorage.getItem('sti_token') || '';
} catch {
  // ignore storage unavailability
}

export function setAuthTokens(nextSessionToken: string, nextCsrfToken: string) {
  sessionToken = nextSessionToken || '';
  csrfToken = nextCsrfToken || '';
  try {
    if (sessionToken) localStorage.setItem('sti_token', sessionToken);
    else localStorage.removeItem('sti_token');
    if (csrfToken) localStorage.setItem('sti_csrf', csrfToken);
    else localStorage.removeItem('sti_csrf');
  } catch {
    // ignore
  }
}

export function setCsrfToken(token: string) {
  csrfToken = token || '';
  try {
    if (csrfToken) localStorage.setItem('sti_csrf', csrfToken);
    else localStorage.removeItem('sti_csrf');
  } catch {
    // ignore
  }
}

export function clearAuthTokens() {
  setAuthTokens('', '');
}

export function getCsrfToken(): string {
  return csrfToken;
}

export async function apiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  if (csrfToken && options.method && !['GET', 'HEAD', 'OPTIONS'].includes(options.method.toUpperCase())) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore non-json error body
    }
    if (res.status === 401 && !url.includes('/auth/login')) {
      clearAuthTokens();
    }
    throw new Error(msg);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function downloadProtectedFile(url: string, fallbackFilename: string) {
  const headers = new Headers();
  if (sessionToken) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  const res = await fetch(url, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/i);
  const filename = match ? match[1] : fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
