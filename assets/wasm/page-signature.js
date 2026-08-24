const WASM_URL = new URL('./page_signature.wasm', import.meta.url);

let wasmPromise;

export class PageSignatureError extends Error {
  constructor(code, message) {
    super(message || {
      1: 'ページ情報がありません。',
      2: 'ページ情報の形式が正しくありません。',
      3: 'このページからの送信には対応していません。',
    }[code] || 'ページ署名の生成に失敗しました。');
    this.name = 'PageSignatureError';
    this.code = code;
  }
}

async function loadWasm() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const response = await fetch(WASM_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`page signature wasm load failed: ${response.status}`);
      }

      if (WebAssembly.instantiateStreaming) {
        try {
          const { instance } = await WebAssembly.instantiateStreaming(response.clone(), {});
          return instance.exports;
        } catch {
          // MIME差異がある場合はArrayBuffer経由で継続する。
        }
      }

      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, {});
      return instance.exports;
    })();
  }
  return wasmPromise;
}

function unpackResult(packed) {
  if (typeof packed !== 'bigint') {
    throw new Error('page signature wasm returned an invalid result');
  }
  return {
    ptr: Number(packed & 0xffffffffn),
    len: Number((packed >> 32n) & 0xffffffffn),
  };
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function createPageSignature(pathname = globalThis.location?.pathname || '') {
  if (typeof pathname !== 'string') {
    throw new TypeError('pathname must be a string');
  }

  const wasm = await loadWasm();
  if (!wasm.memory || !wasm.alloc || !wasm.dealloc || !wasm.signature_for_page) {
    throw new Error('page signature wasm exports are incomplete');
  }

  const input = new TextEncoder().encode(pathname);
  const inputPtr = input.length ? wasm.alloc(input.length) : 0;
  if (input.length && !inputPtr) {
    throw new Error('page signature wasm allocation failed');
  }

  try {
    if (input.length) {
      new Uint8Array(wasm.memory.buffer).set(input, inputPtr);
    }

    const packed = wasm.signature_for_page(inputPtr, input.length);
    const { ptr, len } = unpackResult(packed);
    if (!ptr || !len) {
      throw new Error('page signature wasm produced an empty result');
    }

    const result = new Uint8Array(wasm.memory.buffer).slice(ptr, ptr + len);
    wasm.dealloc(ptr, len);

    if (result[0] === 0xff) {
      throw new PageSignatureError(result[1] || 0);
    }
    if (result[0] !== 1 || result.length !== 33) {
      throw new Error('unsupported page signature payload');
    }

    return Object.freeze({
      version: 1,
      kind: 'page-signature',
      signature: toBase64Url(result.subarray(1)),
    });
  } finally {
    if (inputPtr) wasm.dealloc(inputPtr, input.length);
  }
}

export async function warmPageSignature() {
  await loadWasm();
}
