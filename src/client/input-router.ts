import { processEmailStage1 } from '../../assets/wasm/email-stage1.js';
import { createPageSignature } from '../../assets/wasm/page-signature.js';
import { verifyOtherInputWithSupabase } from './b-verify.js';
import { submitIntegratedSubmission } from './submission-submit.js';
import { handleFinalResponse, renderPipelineError } from './response-router.js';

type PageKind = 'preregister' | 'test';
type OtherInput = Readonly<Record<string, string | boolean>>;

type PreparedSubmission = Readonly<{
  email: Readonly<{ version: number; kind: string; algorithm: string; payload: string; payloadBytes: number }>;
  input: OtherInput;
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
    allowedNames: ['email', 'terms', 'privacy', 'cookie'],
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

function collectOtherInput(form: HTMLFormElement, kind: PageKind): OtherInput {
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

export async function prepareSubmission(
  form: HTMLFormElement,
  pathname = location.pathname,
): Promise<PreparedSubmission> {
  const kind = pageKindFromPath(pathname);
  exactFormKeys(form, PAGE_CONFIG[kind].allowedNames);

  const emailValue = text(form, 'email');
  if (!emailValue) throw new Error('メールアドレスを入力してください。');

  const otherInput = collectOtherInput(form, kind);

  const [email, pageSignature] = await Promise.all([
    processEmailStage1(emailValue),
    createPageSignature(pathname),
  ]);

  const verified = await verifyOtherInputWithSupabase(otherInput, pageSignature.signature);
  if (verified !== true) {
    throw new Error('入力内容の確認に失敗しました。');
  }

  return Object.freeze({
    email,
    input: otherInput,
    signature: pageSignature.signature,
  });
}

export function bindCurrentSubmissionForm(): void {
  let kind: PageKind;
  try {
    kind = pageKindFromPath(location.pathname);
  } catch {
    return;
  }

  const config = PAGE_CONFIG[kind];
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const status = document.querySelector<HTMLElement>(config.statusSelector);
  if (!form) return;

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitButton) submitButton.disabled = false;
  form.dataset.productionPipeline = 'ready';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

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
      renderPipelineError(error, status);
      if (submit) submit.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindCurrentSubmissionForm, { once: true });
} else {
  bindCurrentSubmissionForm();
}
