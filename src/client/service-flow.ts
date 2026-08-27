const FLOW_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/service-flow-gate';
const FLOW_STORAGE_KEY = 'oc_service_flow_token_v1';
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const REQUEST_TIMEOUT_MS = 12_000;

export class ServiceFlowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ServiceFlowError';
    this.code = code;
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ServiceFlowError('INVALID_RESPONSE', '利用準備から不正な応答を受信しました。');
  }
  return value as Record<string, unknown>;
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(FLOW_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    const parsed = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    if (!response.ok || parsed.ok !== true) {
      throw new ServiceFlowError(
        typeof parsed.code === 'string' ? parsed.code : `HTTP_${response.status}`,
        typeof parsed.message === 'string' ? parsed.message : '利用準備を確認できません。',
      );
    }
    return asObject(parsed);
  } catch (error) {
    if (error instanceof ServiceFlowError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ServiceFlowError('TIMEOUT_NETWORK', '利用準備の通信がタイムアウトしました。');
    }
    throw new ServiceFlowError('NETWORK', '利用準備の通信に失敗しました。');
  } finally {
    clearTimeout(timeout);
  }
}

export function getServiceFlowToken(): string | null {
  const token = sessionStorage.getItem(FLOW_STORAGE_KEY);
  return token && TOKEN_RE.test(token) ? token : null;
}

export function clearServiceFlowToken(): void {
  sessionStorage.removeItem(FLOW_STORAGE_KEY);
}

export async function startServiceFlow(entry: 'stream' | 'watch' | 'algorithm'): Promise<void> {
  const payload = await post({ action: 'start', entry });
  const token = payload.token;
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) {
    throw new ServiceFlowError('INVALID_TOKEN', '利用準備用トークンを確認できません。');
  }
  sessionStorage.setItem(FLOW_STORAGE_KEY, token);
}

export async function touchServiceFlow(): Promise<void> {
  const token = getServiceFlowToken();
  if (!token) throw new ServiceFlowError('FLOW_MISSING', '利用準備を確認できません。');
  await post({ action: 'touch', token });
}

export async function consumeServiceFlow(path: string): Promise<void> {
  const token = getServiceFlowToken();
  if (!token) throw new ServiceFlowError('FLOW_MISSING', 'このサービスを直接開くことはできません。');
  await post({ action: 'consume', token, path });
}

export function isFlowTimeout(error: unknown): boolean {
  return error instanceof ServiceFlowError && (error.code === 'FLOW_TIMEOUT' || error.code === 'FLOW_MISSING');
}
