import { clearServiceFlowToken } from './service-flow.js';
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

function safeServiceDestination(value: unknown): string {
  if (typeof value !== 'string' || !/^\.\/[A-Za-z0-9._/-]+$/.test(value) || value.includes('..')) {
    throw new Error('サービスの移動先を確認できません。');
  }
  const target = new URL(value, location.href);
  if (target.origin !== location.origin || target.search || target.hash) {
    throw new Error('サービスの移動先を確認できません。');
  }
  return value;
}

function timeoutToHome(statusTarget?: HTMLElement | null): void {
  setStatus(statusTarget, 'タイムアウトしました。');
  clearServiceFlowToken();
  setTimeout(() => location.replace('./index.html'), 1100);
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

  const page = await identifyPageSignature(responseSignature) as PageKind;

  if (status === 'saved') {
    if (page === 'test') {
      const destination = safeServiceDestination(payload.destination);
      setStatus(statusTarget, '同意を確認しました。移動します。');
      location.assign(destination);
      return;
    }
    const destination = SUCCESS_PAGE[page];
    if (!destination) throw new Error('完了画面が定義されていません。');
    setStatus(statusTarget, '保存が完了しました。');
    location.assign(destination);
    return;
  }

  if (page === 'test' && payload.code === 'FLOW_TIMEOUT') {
    timeoutToHome(statusTarget);
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
