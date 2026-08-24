type EmailStage1 = Readonly<{
  version: number;
  kind: string;
  algorithm: string;
  payload: string;
  payloadBytes: number;
}>;

type PreparedSubmission = Readonly<{
  email: EmailStage1;
  input: Record<string, string | boolean>;
  signature: string;
}>;

const SUPABASE_VERIFY_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/input-verify';
const CLOUDFLARE_STAGE2_URL = 'https://oc-stage2.garigarimegane625.workers.dev/v1/process';
const REQUEST_TIMEOUT_MS = 12_000;

export class SubmissionPipelineError extends Error {
  readonly code: string;
  readonly detail?: unknown;

  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'SubmissionPipelineError';
    this.code = code;
    this.detail = detail;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SubmissionPipelineError('INVALID_RESPONSE', 'サーバーから不正な応答を受信しました。');
  }
  return value as Record<string, unknown>;
}

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      throw new SubmissionPipelineError(
        typeof parsed.code === 'string' ? parsed.code : `HTTP_${response.status}`,
        typeof parsed.message === 'string' ? parsed.message : '送信処理が拒否されました。',
        parsed,
      );
    }
    return objectValue(payload);
  } catch (error) {
    if (error instanceof SubmissionPipelineError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new SubmissionPipelineError('TIMEOUT', '通信がタイムアウトしました。');
    }
    throw new SubmissionPipelineError('NETWORK', '通信に失敗しました。', error);
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyOtherInput(prepared: PreparedSubmission): Promise<Record<string, string | boolean>> {
  const response = await postJson(SUPABASE_VERIFY_URL, {
    signature: prepared.signature,
    input: prepared.input,
  });

  if (response.ok !== true) {
    throw new SubmissionPipelineError(
      typeof response.code === 'string' ? response.code : 'B_REJECTED',
      typeof response.message === 'string' ? response.message : '入力内容が拒否されました。',
      response,
    );
  }

  const verified = response.input;
  if (!verified || typeof verified !== 'object' || Array.isArray(verified)) {
    throw new SubmissionPipelineError('B_INVALID_RESPONSE', '入力確認処理の応答が正しくありません。');
  }

  const result: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(verified)) {
    if (typeof value !== 'string' && typeof value !== 'boolean') {
      throw new SubmissionPipelineError('B_INVALID_VALUE', '入力確認処理から不正な値が返されました。');
    }
    result[key] = value;
  }
  return Object.freeze(result);
}

export async function submitPreparedSubmission(prepared: PreparedSubmission): Promise<Record<string, unknown>> {
  if (!prepared || typeof prepared.signature !== 'string' || !prepared.email || !prepared.input) {
    throw new SubmissionPipelineError('INVALID_PREPARED_INPUT', '送信前データが正しくありません。');
  }

  const verifiedInput = await verifyOtherInput(prepared);

  // Cloudflareへ送る業務データは A（メール第1処理）+ B（確認済みその他入力）+ C（固定電子署名）の3つだけ。
  return postJson(CLOUDFLARE_STAGE2_URL, {
    email: prepared.email,
    input: verifiedInput,
    signature: prepared.signature,
  });
}
