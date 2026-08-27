import { processEmailStage1 } from '../../assets/wasm/email-stage1.js?v=20260827-a2';
import { processFullNameStage1 } from '../../assets/wasm/full-name-stage1.js?v=20260827-flow1';
import { createPageSignature } from '../../assets/wasm/page-signature.js';
import { verifyOtherInputWithSupabase } from './b-verify.js';
import { submitIntegratedSubmission } from './cloudflare-submit.js';
import { handleFinalResponse, renderPipelineError } from './response-router.js';
import { clearServiceFlowToken, getServiceFlowToken, isFlowTimeout, touchServiceFlow } from './service-flow.js';

type PageKind = 'preregister' | 'test';
type ConsentInput = Readonly<Record<string, boolean>>;
type SubmissionInput = Readonly<Record<string, unknown>>;

type PreparedSubmission = Readonly<{
  email: Readonly<{ version: number; kind: string; algorithm: string; payload: string; payloadBytes: number }>;
  input: SubmissionInput;
  signature: string;
}>;

const PAGE_CONFIG: Record<PageKind, {
  formSelector: string;
  statusSelector: string;
  allowedNames: readonly string[];
}> = {
  preregister: {
    formSelector: '[data-preregister-form]',
    statusSelector: '[data-preregister-status]',
    allowedNames: ['email', 'privacy', 'terms'],
  },
  test: {
    formSelector: '[data-test-form]',
    statusSelector: '[data-test-status]',
    allowedNames: ['fullName', 'email', 'terms', 'privacy', 'cookie'],
  },
};

function pageKindFromPath(pathname: string): PageKind {
  const file = pathname.split('/').filter(Boolean).at(-1) || '';
  if (file === 'preregister.html') return 'preregister';
  if (file === 'test.html') return 'test';
  throw new Error('このページからの送信には対応していません。');
}

function exactFormKeys(form: HTMLFormElement, allowed: readonly string[]): void {
  const keys = [...new Set(Array.from(new FormData(form).keys()))];
  for (const key of keys) {
    if (!allowed.includes(key)) throw new Error('許可されていない入力項目が含まれています。');
  }
}

function checkbox(form: HTMLFormElement, name: string): boolean {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement) || field.type !== 'checkbox') {
    throw new Error(`入力項目 ${name} が正しくありません。`);
  }
  return field.checked;
}

function text(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
    throw new Error(`入力項目 ${name} が正しくありません。`);
  }
  return field.value.trim();
}

function requireConsent(value: boolean, label: string): true {
  if (!value) throw new Error(`${label}への同意が必要です。`);
  return true;
}

function collectConsent(form: HTMLFormElement, kind: PageKind): ConsentInput {
  if (kind === 'preregister') {
    return Object.freeze({
      privacy: requireConsent(checkbox(form, 'privacy'), 'プライバシーポリシー'),
      terms: requireConsent(checkbox(form, 'terms'), '利用規約'),
    });
  }
  return Object.freeze({
    terms: requireConsent(checkbox(form, 'terms'), '利用規約'),
    privacy: requireConsent(checkbox(form, 'privacy'), 'プライバシーポリシー'),
    cookie: requireConsent(checkbox(form, 'cookie'), 'Cookieポリシー'),
  });
}

function returnHome(status: HTMLElement | null, message: string): void {
  if (status) status.textContent = message;
  clearServiceFlowToken();
  setTimeout(() => location.replace('./index.html'), 1100);
}

async function prepareTestInput(form: HTMLFormElement, pathname: string): Promise<PreparedSubmission> {
  const flowToken = getServiceFlowToken();
  if (!flowToken) throw new Error('このページを直接開くことはできません。');
  await touchServiceFlow();

  const emailValue = text(form, 'email');
  if (!emailValue) throw new Error('メールアドレスを入力してください。');
  const fullNameValue = text(form, 'fullName');
  if (!fullNameValue) throw new Error('本名を入力してください。');
  const consent = collectConsent(form, 'test');

  const [email, fullName, pageSignature] = await Promise.all([
    processEmailStage1(emailValue),
    processFullNameStage1(fullNameValue),
    createPageSignature(pathname),
  ]);

  const verified = await verifyOtherInputWithSupabase(Object.freeze({
    terms: true,
    privacy: true,
    cookie: true,
    fullName: fullNameValue,
    fullNameDigest: fullName.matchDigest,
    flowToken,
  }), pageSignature.signature);
  if (verified !== true) throw new Error('入力内容の確認に失敗しました。');

  return Object.freeze({
    email,
    input: Object.freeze({ ...consent, fullName, flowToken }),
    signature: pageSignature.signature,
  });
}

export async function prepareSubmission(
  form: HTMLFormElement,
  pathname = location.pathname,
): Promise<PreparedSubmission> {
  const kind = pageKindFromPath(pathname);
  exactFormKeys(form, PAGE_CONFIG[kind].allowedNames);
  if (kind === 'test') return prepareTestInput(form, pathname);

  const emailValue = text(form, 'email');
  if (!emailValue) throw new Error('メールアドレスを入力してください。');
  const consent = collectConsent(form, kind);
  const [email, pageSignature] = await Promise.all([
    processEmailStage1(emailValue),
    createPageSignature(pathname),
  ]);
  const verified = await verifyOtherInputWithSupabase(consent, pageSignature.signature);
  if (verified !== true) throw new Error('入力内容の確認に失敗しました。');
  return Object.freeze({ email, input: consent, signature: pageSignature.signature });
}

async function installTestActivityGuard(status: HTMLElement | null): Promise<boolean> {
  if (!getServiceFlowToken()) {
    returnHome(status, 'このページを直接開くことはできません。');
    return false;
  }
  try {
    await touchServiceFlow();
  } catch (error) {
    if (isFlowTimeout(error)) returnHome(status, 'タイムアウトしました。');
    else if (status) status.textContent = error instanceof Error ? error.message : '利用準備を確認できません。';
    return false;
  }

  let lastTouch = 0;
  let stopped = false;
  const onActivity = () => {
    if (stopped) return;
    const now = Date.now();
    if (now - lastTouch < 5000) return;
    lastTouch = now;
    void touchServiceFlow().catch((error) => {
      if (!isFlowTimeout(error)) return;
      stopped = true;
      returnHome(status, 'タイムアウトしました。');
    });
  };
  for (const type of ['pointerdown', 'keydown', 'input', 'change'] as const) {
    document.addEventListener(type, onActivity, { capture: true, passive: type === 'pointerdown' });
  }
  return true;
}

export async function bindCurrentSubmissionForm(): Promise<void> {
  let kind: PageKind;
  try { kind = pageKindFromPath(location.pathname); } catch { return; }
  const config = PAGE_CONFIG[kind];
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const status = document.querySelector<HTMLElement>(config.statusSelector);
  if (!form) return;

  if (kind === 'test' && !(await installTestActivityGuard(status))) return;

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitButton) submitButton.disabled = false;
  form.dataset.productionPipeline = 'ready';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit?.disabled) return;
    if (status) status.textContent = '送信内容を確認しています。';
    if (submit) submit.disabled = true;
    try {
      const prepared = await prepareSubmission(form);
      if (status) status.textContent = '送信しています。';
      const finalResponse = await submitIntegratedSubmission(prepared);
      await handleFinalResponse(prepared.signature, finalResponse, status);
    } catch (error) {
      if (kind === 'test' && isFlowTimeout(error)) {
        returnHome(status, 'タイムアウトしました。');
        return;
      }
      renderPipelineError(error, status);
      if (submit) submit.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void bindCurrentSubmissionForm(); }, { once: true });
} else {
  void bindCurrentSubmissionForm();
}
