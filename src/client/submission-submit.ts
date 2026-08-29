type EmailStage1 = Readonly<{
  version: number;
  kind: string;
  algorithm: string;
  payload: string;
  payloadBytes: number;
  matchDigest?: string;
}>;

type IntegratedSubmission = Readonly<{
  email: EmailStage1;
  input: Readonly<Record<string, string | boolean>>;
  signature: string;
}>;

const SUBMISSION_PROTECTOR_URL = 'https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/mail-system/submission-public';
const REQUEST_TIMEOUT_MS = 12_000;

export class SubmissionTransportError extends Error {
  readonly code: string;
  readonly detail?: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'SubmissionTransportError';
    this.code = code;
    this.detail = detail;
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SubmissionTransportError('INVALID_RESPONSE', 'サーバーから不正な応答を受信しました。');
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
      const parsed = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
      throw new SubmissionTransportError(
        typeof parsed.code === 'string' ? parsed.code : `HTTP_${response.status}`,
        typeof parsed.message === 'string' ? parsed.message : '送信処理が拒否されました。',
        parsed,
      );
    }
    return objectValue(payload);
  } catch (error) {
    if (error instanceof SubmissionTransportError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new SubmissionTransportError('TIMEOUT', '通信がタイムアウトしました。');
    }
    throw new SubmissionTransportError('NETWORK', '通信に失敗しました。', error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitIntegratedSubmission(submission: IntegratedSubmission): Promise<Record<string, unknown>> {
  if (!submission || !submission.email || !submission.input || typeof submission.signature !== 'string') {
    throw new SubmissionTransportError('INVALID_INTEGRATED_INPUT', '統合送信データが正しくありません。');
  }
  return postJson(SUBMISSION_PROTECTOR_URL, {
    email: submission.email,
    input: submission.input,
    signature: submission.signature,
  });
}
