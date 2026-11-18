/**
 * Pure authentication storage, timeout, and safe error classification helpers.
 * Never logs or exposes tokens, headers, or user credentials.
 */

export const AUTH_REQUEST_TIMEOUT_MS = 12000;
export const PROFILE_CACHE_KEY = 'tricore_user_profile';

/**
 * Derive the current Supabase project storage key (`sb-<ref>-auth-token`) so
 * stale tokens belonging to a different Supabase project are ignored.
 */
export function getExpectedAuthStorageKey(supabaseUrl = import.meta.env?.VITE_SUPABASE_URL) {
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()) return null;
  try {
    const hostname = new URL(supabaseUrl).hostname;
    const projectRef = hostname.split('.')[0];
    if (projectRef) {
      return `sb-${projectRef}-auth-token`;
    }
  } catch {
    return null;
  }
  return null;
}

const extractValidStoredUser = (rawItem) => {
  if (!rawItem) return null;
  try {
    const parsed = JSON.parse(rawItem);
    if (parsed && typeof parsed === 'object' && parsed.user && typeof parsed.user.id === 'string') {
      return parsed.user;
    }
  } catch {
    return null;
  }
  return null;
};

const readStoredUserFromStorage = (storage, expectedKey) => {
  if (!storage) return null;
  if (expectedKey) {
    return extractValidStoredUser(storage.getItem(expectedKey));
  }
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      const user = extractValidStoredUser(storage.getItem(key));
      if (user) return user;
    }
  }
  return null;
};

export function getStoredSessionUser() {
  if (typeof window === 'undefined') return null;
  const expectedKey = getExpectedAuthStorageKey();
  try {
    return (
      readStoredUserFromStorage(window.localStorage, expectedKey) ||
      readStoredUserFromStorage(window.sessionStorage, expectedKey)
    );
  } catch {
    return null;
  }
}

export function getStoredProfile(expectedUserId) {
  if (typeof window === 'undefined' || !expectedUserId) return null;
  try {
    const cached = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.id === expectedUserId &&
      typeof parsed.role === 'string' &&
      parsed.role.trim().length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLocalAuthCache() {
  if (typeof window === 'undefined') return;
  const expectedKey = getExpectedAuthStorageKey();
  try {
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
    if (expectedKey) {
      window.localStorage.removeItem(expectedKey);
      window.sessionStorage.removeItem(expectedKey);
    }
  } catch {
    // Storage access may be restricted
  }
}

export function withTimeout(promise, timeoutMs, operationLabel) {
  if (!timeoutMs || timeoutMs <= 0) return Promise.resolve(promise);
  let timerId;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      const timeoutError = new Error(`${operationLabel} timed out.`);
      timeoutError.name = 'AuthTimeoutError';
      timeoutError.isTimeout = true;
      reject(timeoutError);
    }, timeoutMs);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    clearTimeout(timerId);
  });
}

export function isTransientNetworkError(err) {
  if (!err) return false;
  if (err.isTimeout || err.name === 'AuthTimeoutError') return true;
  if (typeof err.status === 'number' && (err.status >= 500 || err.status === 429 || err.status === 0)) {
    return true;
  }
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('err_network')
  );
}

export function isTerminalSessionError(err) {
  if (!err) return false;
  if (isTransientNetworkError(err)) return false;
  if (err.status === 400 || err.status === 401 || err.status === 403) return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('invalid_grant') ||
    msg.includes('session_not_found') ||
    msg.includes('auth session missing') ||
    msg.includes('user not found') ||
    msg.includes('jwt')
  );
}

export function formatSafeProfileError(err) {
  const code = err?.code;
  if (isTransientNetworkError(err)) {
    return {
      code: 'profile_network_error',
      message: 'Unable to load your account profile due to a network or timeout issue. Check your connection and try again.',
      retryable: true,
    };
  }
  if (code === 'PGRST116') {
    return {
      code: 'profile_not_found',
      message: 'Your account profile could not be found. Please contact support or sign out and try again.',
      retryable: true,
    };
  }
  if (code === '42501' || err?.status === 401 || err?.status === 403) {
    return {
      code: 'profile_access_denied',
      message: 'Access to your account profile was denied. Your session may need to be refreshed—retry or sign in again.',
      retryable: true,
    };
  }
  return {
    code: 'profile_load_failed',
    message: 'Unable to load your account profile right now. Please retry or sign out and log in again.',
    retryable: true,
  };
}
