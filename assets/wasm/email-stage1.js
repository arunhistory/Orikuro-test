const WASM_URL = new URL('./email_stage1.wasm', import.meta.url);

let wasmPromise;
let wasmExports;

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

function imports() {
  return {
    env: {
      oc_random_fill(ptr, len) {
        try {
          if (!wasmExports?.memory || !globalThis.crypto?.getRandomValues) return -1;
          const view = new Uint8Array(wasmExports.memory.buffer, ptr, len);
          crypto.getRandomValues(view);
          return 0;
        } catch {
          return -1;
        }
      },
    },
  };
}

async function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const response = await fetch(WASM_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`email stage1 wasm load failed: ${response.status}`);
      }

      let instance;
      if (WebAssembly.instantiateStreaming) {
        try {
          ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), imports()));
        } catch {
          // GitHub Pages/CDN側のMIME差異があってもArrayBuffer経由で継続する。
        }
      }

      if (!instance) {
        const bytes = await response.arrayBuffer();
        ({ instance } = await WebAssembly.instantiate(bytes, imports()));
      }

      wasmExports = instance.exports;
      return wasmExports;
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

  const wasm = await loadWasm();
  if (!wasm.memory || !wasm.alloc || !wasm.dealloc || !wasm.process_email) {
    throw new Error('email stage1 wasm exports are incomplete');
  }

  const input = new TextEncoder().encode(email);
  const inputPtr = input.length ? wasm.alloc(input.length) : 0;

  if (input.length && !inputPtr) {
    throw new Error('email stage1 wasm allocation failed');
  }

  try {
    if (input.length) {
      const memory = new Uint8Array(wasm.memory.buffer);
      memory.set(input, inputPtr);
    }

    const packed = wasm.process_email(inputPtr, input.length);
    const { ptr, len } = unpackResult(packed);
    if (!ptr || !len) {
      throw new Error('email stage1 wasm produced an empty result');
    }

    const memory = new Uint8Array(wasm.memory.buffer);
    const result = memory.slice(ptr, ptr + len);
    wasm.dealloc(ptr, len);

    if (result[0] === 0xff) {
      throw new EmailStage1Error(result[1] || 0);
    }
    if (result[0] !== 2) {
      throw new Error('unsupported email stage1 payload version');
    }

    return Object.freeze({
      version: 2,
      kind: 'email',
      algorithm: 'oc-email-stage1-v2',
      payload: toBase64Url(result),
      payloadBytes: result.length,
    });
  } finally {
    if (inputPtr) wasm.dealloc(inputPtr, input.length);
  }
}

export async function warmEmailStage1() {
  await loadWasm();
}
