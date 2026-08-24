type OtherInput = Readonly<Record<string, string | boolean>>;

const SUPABASE_VERIFY_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/input-verify';
const REQUEST_TIMEOUT_MS = 12_000;

export class BVerificationError extends Error {
  readonly code: string;
  readonly detail?: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'BVerificationError';
    this.code = code;
    this.detail = detail;
  }
}

function responseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BVerificationError('B_INVALID_RESPONSE', '入力確認処理から不正な応答を受信しました。');
  }
  return value as Record<string, unknown>;
}

export async function verifyOtherInputWithSupabase(
  input: OtherInput,
  signature: string,
): Promise<true> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BVerificationError('B_INVALID_INPUT', '確認対象の入力値が正しくありません。');
  }
  if (typeof signature !== 'string' || !signature) {
    throw new BVerificationError('B_INVALID_SIGNATURE', '入力確認に必要な電子署名がありません。');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SUPABASE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input,
        signature,
      }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const parsed = payload && typeof payload === 'object' && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      throw new BVerificationError(
        typeof parsed.code === 'string' ? parsed.code : `B_HTTP_${response.status}`,
        typeof parsed.message === 'string' ? parsed.message : '入力内容の確認が拒否されました。',
        parsed,
      );
    }

    const parsed = responseObject(payload);
    if (parsed.ok !== true) {
      throw new BVerificationError(
        typeof parsed.code === 'string' ? parsed.code : 'B_REJECTED',
        typeof parsed.message === 'string' ? parsed.message : '入力内容が拒否されました。',
        parsed,
      );
    }

    // B処理は値を書き換えない。SupabaseがTrueを返した事実だけを統合処理へ渡す。
    return true;
  } catch (error) {
    if (error instanceof BVerificationError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new BVerificationError('B_TIMEOUT', '入力内容の確認がタイムアウトしました。');
    }
    throw new BVerificationError('B_NETWORK', '入力内容の確認通信に失敗しました。', error);
  } finally {
    clearTimeout(timeout);
  }
}
