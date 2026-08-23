const WASM_URL = new URL('./email_stage1.wasm', import.meta.url);

let wasmPromise;

const ERROR_MESSAGES = Object.freeze({
  1: 'メールアドレスを入力してください。',
  2: 'メールアドレスが長すぎます。',
  3: 'このメールアドレス形式には対応していません。',
  4: 'メールアドレスの形式が正しくありません。',
  5: 'メールアドレスの@より前の部分が正しくありません。',
  6: 'メールアドレスのドメイン形式が正しくありません。',
  7: '使い捨てメールアドレスは使用できません。',
  8: '適当な文字列ではなく、実際に使用しているメールアドレスを入力してください。',
  9: 'メールアドレス処理用の乱数生成に失敗しました。',
});

export class EmailStage1Error extends Error {
  constructor(code, message = ERROR_MESSAGES[code] || 'メールアドレスの処理に失敗しました。') {
    super(message);
    this.name = 'EmailStage1Error';
    this.code = code;
  }
}

async function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const response = await fetch(WASM_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`email stage1 wasm load failed: ${response.status}`);
      }

      if (WebAssembly.instantiateStreaming) {
        try {
          const { instance } = await WebAssembly.instantiateStreaming(response.clone(), {});
          return instance.exports;
        } catch {
          // GitHub Pages/CDN側のMIME差異があってもArrayBuffer経由で継続する。
        }
      }

      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      return instance.exports;
    })();
  }
  return wasmPromise;
}

function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function unpackResult(packed) {
  if (typeof packed !== 'bigint') {
    throw new Error('email stage1 wasm returned an invalid result');
  }
  return {
    ptr: Number(packed & 0xffffffffn),
    len: Number((packed >> 32n) & 0xffffffffn),
  };
}

export async function processEmailStage1(email) {
  if (typeof email !== 'string') {
    throw new TypeError('email must be a string');
  }
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('secure random source is unavailable');
  }

  const wasm = await loadWasm();
  if (!wasm.memory || !wasm.alloc || !wasm.dealloc || !wasm.process_email) {
    throw new Error('email stage1 wasm exports are incomplete');
  }

  const input = new TextEncoder().encode(email);
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const inputPtr = input.length ? wasm.alloc(input.length) : 0;
  const noncePtr = wasm.alloc(nonce.length);

  if ((input.length && !inputPtr) || !noncePtr) {
    if (inputPtr) wasm.dealloc(inputPtr, input.length);
    if (noncePtr) wasm.dealloc(noncePtr, nonce.length);
    throw new Error('email stage1 wasm allocation failed');
  }

  try {
    let memory = new Uint8Array(wasm.memory.buffer);
    if (input.length) memory.set(input, inputPtr);
    memory.set(nonce, noncePtr);

    const packed = wasm.process_email(inputPtr, input.length, noncePtr, nonce.length);
    const { ptr, len } = unpackResult(packed);
    if (!ptr || !len) {
      throw new Error('email stage1 wasm produced an empty result');
    }

    memory = new Uint8Array(wasm.memory.buffer);
    const result = memory.slice(ptr, ptr + len);
    wasm.dealloc(ptr, len);

    if (result[0] === 0xff) {
      throw new EmailStage1Error(result[1] || 0);
    }
    if (result[0] !== 1) {
      throw new Error('unsupported email stage1 payload version');
    }

    return Object.freeze({
      version: 1,
      kind: 'email',
      algorithm: 'oc-email-stage1-v1',
      payload: toBase64Url(result),
      payloadBytes: result.length,
    });
  } finally {
    if (inputPtr) wasm.dealloc(inputPtr, input.length);
    wasm.dealloc(noncePtr, nonce.length);
  }
}

export async function warmEmailStage1() {
  await loadWasm();
}
