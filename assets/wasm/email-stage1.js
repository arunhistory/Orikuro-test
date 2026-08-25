const WASM_URL = new URL('./email_stage1.wasm', import.meta.url);

const A_KID = 'gnqyOhhA_YngD8NGD-uJjxQD6H9x3VRaTn7vY6vw02c';
const STAGE1_OUTPUT_ALGORITHM = 'oc-email-stage1-a-rsa-match-v2';
const MATCH_DIGEST_CONTEXT = 'OC/EMAIL/MATCH-DIGEST/V1\0';
const A_PUBLIC_JWK = Object.freeze({
  kty: 'RSA',
  n: 'wDNvnSNpLWzrS7VoD2Lz4t-e6Ktg5CauInDV2LeX0UE0kIt3hXgySRdQ9Yt5P5RfdA2nOYrTUKqYrx1AxiDNbkWDQuBWmz4uEe9jfhlKRpz4DcV3IxGYmjpVQrGFe8iJ5BVDKdRoPyjaHN8x7RnZoOOwJOqbxSbLKBEFswPIl5T5VDe-W9CaQ7kFwF3l0aB3tEGztkoHs5pKHRSJEuGIIBc4QJ0CVBqVvdrTbLOVvj1zc7FdTzcqFMuE22nkXiZKdBZTEb9mkXtTNFasR_8tAzZCBcs3aEo_99JevFlNKXMxlXyfMx4d9vDK_WW8ax6gCjH0W3SpGSI__RtFAZWcAmnXilGPmXm3AUcoQEfa1UgUqZkoZQ-j2AGUPppG9arMgI6fME7r1WtxHAJc_rNKBAPNXoajGTXT0Z5GEZoMkGWucAw7NwLePQLrBzC62MSHgfIA2Ji2F_u4kYyJKq4wsCQ_RSUaiI0L6Jz9y8m7l8D5yLcckOJtYDJV2f8',
  e: 'AQAB',
  alg: 'RSA-OAEP-256',
  use: 'enc',
  kid: A_KID,
});

let wasmPromise;
let wasmExports;
let publicKeyPromise;

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
      if (!response.ok) throw new Error(`email stage1 wasm load failed: ${response.status}`);
      let instance;
      if (WebAssembly.instantiateStreaming) {
        try { ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), imports())); } catch {}
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

async function loadPublicKey() {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey(
      'jwk',
      A_PUBLIC_JWK,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  }
  return publicKeyPromise;
}

function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unpackResult(packed) {
  if (typeof packed !== 'bigint') throw new Error('email stage1 wasm returned an invalid result');
  return { ptr: Number(packed & 0xffffffffn), len: Number((packed >> 32n) & 0xffffffffn) };
}

function normalizeAfterValidation(email) {
  const value = email.trim();
  const at = value.indexOf('@');
  return `${value.slice(0, at)}@${value.slice(at + 1).toLowerCase()}`;
}

async function validateWithWasm(email) {
  const wasm = await loadWasm();
  if (!wasm.memory || !wasm.alloc || !wasm.dealloc || !wasm.process_email) throw new Error('email stage1 wasm exports are incomplete');

  const input = new TextEncoder().encode(email);
  const inputPtr = input.length ? wasm.alloc(input.length) : 0;
  if (input.length && !inputPtr) throw new Error('email stage1 wasm allocation failed');

  try {
    if (input.length) new Uint8Array(wasm.memory.buffer).set(input, inputPtr);
    const { ptr, len } = unpackResult(wasm.process_email(inputPtr, input.length));
    if (!ptr || !len) throw new Error('email stage1 wasm produced an empty result');
    const result = new Uint8Array(wasm.memory.buffer).slice(ptr, ptr + len);
    wasm.dealloc(ptr, len);
    if (result[0] === 0xff) throw new EmailStage1Error(result[1] || 0);
    if (result[0] !== 2) throw new Error('unsupported email validator payload version');
  } finally {
    input.fill(0);
    if (inputPtr) wasm.dealloc(inputPtr, input.length);
  }
}

export async function processEmailStage1(email) {
  if (typeof email !== 'string') throw new TypeError('email must be a string');

  await validateWithWasm(email);
  const normalized = normalizeAfterValidation(email);
  const textEncoder = new TextEncoder();
  const plain = textEncoder.encode(normalized);
  const digestInput = textEncoder.encode(`${MATCH_DIGEST_CONTEXT}${normalized}`);

  try {
    const publicKey = await loadPublicKey();
    const [encryptedBuffer, digestBuffer] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, plain),
      crypto.subtle.digest('SHA-256', digestInput),
    ]);
    const encrypted = new Uint8Array(encryptedBuffer);
    const matchDigest = toBase64Url(new Uint8Array(digestBuffer));
    const kid = textEncoder.encode(A_KID);
    const framed = new Uint8Array(1 + kid.length + 2 + encrypted.length);
    framed[0] = kid.length;
    framed.set(kid, 1);
    framed[1 + kid.length] = (encrypted.length >>> 8) & 0xff;
    framed[2 + kid.length] = encrypted.length & 0xff;
    framed.set(encrypted, 3 + kid.length);

    return Object.freeze({
      version: 4,
      kind: 'email',
      algorithm: STAGE1_OUTPUT_ALGORITHM,
      payload: toBase64Url(framed),
      payloadBytes: framed.length,
      matchDigest,
    });
  } finally {
    plain.fill(0);
    digestInput.fill(0);
  }
}

export async function warmEmailStage1() {
  await Promise.all([loadWasm(), loadPublicKey()]);
}
