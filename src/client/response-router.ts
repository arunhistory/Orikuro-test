import { identifyPageSignature } from '../../assets/wasm/page-signature.js';

type PageKind = 'preregister' | 'contact' | 'test';

const SUCCESS_PAGE: Partial<Record<PageKind, string>> = {
  preregister: './preregister-complete.html',
  contact: './contact-complete.html',
};

const STATUS_MESSAGE: Record<string, string> = {
  rejected: '送信内容が拒否されました。',
  rejected_signature: '送信元情報を確認できませんでした。',
  rejected_schema: '送信内容の形式が正しくありません。',
  rejected_value: '入力内容を確認してください。',
  validation_error: '入力内容を確認してください。',
  system_error: '処理中にエラーが発生しました。時間をおいて再度お試しください。',
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('サーバーから不正な応答を受信しました。');
  }
  return value as Record<string, unknown>;
}

function unwrap(payload: Record<string, unknown>): Record<string, unknown> {
  const result = payload.result;
  return result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : payload;
}

function setStatus(target: HTMLElement | null | undefined, message: string): void {
  if (target) target.textContent = message;
}

export async function handleFinalResponse(
  submittedSignature: string,
  rawPayload: unknown,
  statusTarget?: HTMLElement | null,
): Promise<void> {
  const payload = unwrap(asObject(rawPayload));
  const responseSignature = payload.signature;
  const status = payload.status;

  if (typeof responseSignature !== 'string' || responseSignature !== submittedSignature) {
    throw new Error('返答の電子署名が一致しません。');
  }
  if (typeof status !== 'string') {
    throw new Error('返答ステータスが正しくありません。');
  }

  // 固定署名の逆引きもWASMで行う。JS側には署名値を重複定義しない。
  const page = await identifyPageSignature(responseSignature) as PageKind;

  if (status === 'saved') {
    if (page === 'test') {
      setStatus(statusTarget, '完了しました。');
      return;
    }
    const destination = SUCCESS_PAGE[page];
    if (!destination) throw new Error('完了画面が定義されていません。');
    setStatus(statusTarget, '保存が完了しました。');
    location.assign(destination);
    return;
  }

  const backendMessage = typeof payload.message === 'string' && payload.message.trim()
    ? payload.message.trim()
    : null;
  setStatus(statusTarget, backendMessage || STATUS_MESSAGE[status] || '送信処理が拒否されました。');
}

export function renderPipelineError(error: unknown, statusTarget?: HTMLElement | null): void {
  const message = error instanceof Error && error.message
    ? error.message
    : '送信処理に失敗しました。時間をおいて再度お試しください。';
  setStatus(statusTarget, message);
}
