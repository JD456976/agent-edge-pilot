import { supabase } from '@/integrations/supabase/client';

export interface EdgeFunctionError {
  kind: 'auth' | 'network' | 'not_found' | 'rate_limited' | 'server' | 'unknown';
  status?: number;
  message: string;
  requestId: string;
  details?: any;
}

// Store last call info for debug drawer
let _lastCall: { name: string; status?: number; requestId: string; errorKind?: string; timestamp: string } | null = null;
export function getLastEdgeCall() { return _lastCall; }

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function classifyError(status: number): EdgeFunctionError['kind'] {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'unknown';
}

function userMessage(kind: EdgeFunctionError['kind'], name: string, status?: number): string {
  switch (kind) {
    case 'auth': return 'Session expired. Please sign out and sign in, then try again.';
    case 'not_found': return `Edge function not found. Confirm it is deployed: ${name}.`;
    case 'rate_limited': return 'Rate limit reached. Try again in a minute. Showing last known summary if available.';
    case 'server': return `Server error${status ? ` (${status})` : ''}. Try again shortly.`;
    case 'network': return 'Network could not reach the function. Check connection or backend status.';
    default: return 'An unexpected error occurred. Please try again.';
  }
}

async function logAudit(action: string, metadata: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('admin_audit_events').insert({
      admin_user_id: user.id,
      action,
      metadata: metadata as any,
    });
  } catch {
    // Best-effort logging, don't throw
  }
}

export async function callEdgeFunction<T = any>(
  name: string,
  payload?: any,
  opts?: { timeoutMs?: number; retry?: boolean }
): Promise<T> {
  const requestId = generateRequestId();
  const timeoutMs = opts?.timeoutMs ?? 15000;
  const shouldRetry = opts?.retry ?? true;
  const startTime = Date.now();

  // Guard: require active session
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const err: EdgeFunctionError = {
      kind: 'auth',
      message: userMessage('auth', name),
      requestId,
    };
    _lastCall = { name, requestId, errorKind: 'auth', timestamp: new Date().toISOString() };
    await logAudit('edge_function_error', { functionName: name, kind: 'auth', requestId });
    throw err;
  }

  const attempt = async (isRetry: boolean): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await supabase.functions.invoke(name, {
        body: payload,
        headers: {
          'x-request-id': requestId,
        },
      });

      clearTimeout(timer);
      const durationMs = Date.now() - startTime;

      // supabase.functions.invoke returns { data, error }
      if (res.error) {
        // The error object from invoke can be a FunctionsHttpError, FunctionsRelayError, or FunctionsFetchError
        const errorMessage = res.error.message || 'Unknown error';
        const context = (res.error as any).context;
        const status = context?.status || (res.error as any).status;

        // Check if we got data despite the error (e.g. non-2xx with body)
        const responseData = res.data;

        let kind: EdgeFunctionError['kind'];
        if (!status) {
          kind = 'network';
        } else {
          kind = classifyError(status);
        }

        // Retry on transient failures
        if (!isRetry && shouldRetry && (kind === 'network' || kind === 'rate_limited' || (status && [502, 503, 504].includes(status)))) {
          await new Promise(r => setTimeout(r, 1500));
          return attempt(true);
        }

        const edgeErr: EdgeFunctionError = {
          kind,
          status,
          message: userMessage(kind, name, status),
          requestId,
          details: responseData || errorMessage,
        };

        _lastCall = { name, status, requestId, errorKind: kind, timestamp: new Date().toISOString() };
        await logAudit('edge_function_error', { functionName: name, status, kind, requestId, durationMs });
        throw edgeErr;
      }

      // Check for application-level errors in data
      if (res.data?.error) {
        const appError = res.data.error;
        const kind: EdgeFunctionError['kind'] = typeof appError === 'string' && /unauthorized|session/i.test(appError) ? 'auth'
          : typeof appError === 'string' && /rate.?limit/i.test(appError) ? 'rate_limited'
          : 'server';

        const edgeErr: EdgeFunctionError = {
          kind,
          status: 400,
          message: typeof appError === 'string' ? appError : userMessage(kind, name),
          requestId,
          details: res.data,
        };

        _lastCall = { name, status: 400, requestId, errorKind: kind, timestamp: new Date().toISOString() };
        await logAudit('edge_function_error', { functionName: name, status: 400, kind, requestId, durationMs });
        throw edgeErr;
      }

      // Success
      _lastCall = { name, status: 200, requestId, timestamp: new Date().toISOString() };
      await logAudit('edge_function_success', { functionName: name, durationMs, requestId });
      return res.data as T;

    } catch (err: any) {
      clearTimeout(timer);

      // If it's already an EdgeFunctionError, rethrow
      if (err && typeof err === 'object' && 'kind' in err && 'requestId' in err) {
        throw err;
      }

      // AbortController timeout
      if (err?.name === 'AbortError') {
        const edgeErr: EdgeFunctionError = {
          kind: 'network',
          message: userMessage('network', name),
          requestId,
          details: `Request timed out after ${timeoutMs}ms`,
        };
        _lastCall = { name, requestId, errorKind: 'network', timestamp: new Date().toISOString() };
        await logAudit('edge_function_error', { functionName: name, kind: 'network', requestId, details: 'timeout' });
        throw edgeErr;
      }

      // Network or unknown error
      if (!isRetry && shouldRetry) {
        await new Promise(r => setTimeout(r, 1500));
        return attempt(true);
      }

      const edgeErr: EdgeFunctionError = {
        kind: 'network',
        message: userMessage('network', name),
        requestId,
        details: err?.message || String(err),
      };
      _lastCall = { name, requestId, errorKind: 'network', timestamp: new Date().toISOString() };
      await logAudit('edge_function_error', { functionName: name, kind: 'network', requestId });
      throw edgeErr;
    }
  };

  return attempt(false);
}

/** Format an EdgeFunctionError for clipboard (no secrets). */
export function formatErrorForClipboard(err: EdgeFunctionError, functionName: string): string {
  return [
    `Function: ${functionName}`,
    `Status: ${err.status ?? 'N/A'}`,
    `Request ID: ${err.requestId}`,
    `Error: ${err.message}`,
    `Timestamp: ${new Date().toISOString()}`,
    err.details ? `Details: ${typeof err.details === 'string' ? err.details : JSON.stringify(err.details)}` : '',
  ].filter(Boolean).join('\n');
}
