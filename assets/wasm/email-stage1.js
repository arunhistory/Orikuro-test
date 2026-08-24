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
  10: 'メールアドレス保護鍵Aの読み込みに失敗しました。',
  11: 'メールアドレスの第1段暗号化に失敗しました。',
});

export class EmailStage1Error extends Error {
  constructor(code, message = ERROR_MESSAGES[code] || 'メールアドレスの処理に失敗しました。') {
    super(message);
    this.name = 'EmailStage1Error';
    this.code = code;
  }
}

function imports() {
  return { env: { oc_random_fill(ptr, len) {
    try {
      if (!wasmExports?.memory || !globalThis.crypto?.getRandomValues) return -1;
      crypto.getRandomValues(new Uint8Array(wasmExports.memory.buffer, ptr, len));
      return 0;
    } catch { return -1; }
  } } };
}

async function loadWasm() {
  if (!wasmPromise) wasmPromise = (async () => {
    const response = await fetch(WASM_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`email stage1 wasm load failed: ${response.status}`);
    let instance;
    if (WebAssembly.instantiateStreaming) {
      try { ({ instance } = await WebAssembly.instantiateStreaming(response.clone(), imports())); } catch {}
    }
    if (!instance) ({ instance } = await WebAssembly.instantiate(await response.arrayBuffer(), imports()));
    wasmExports = instance.exports;
    return wasmExports;
  })();
  return wasmPromise;
}

function toBase64Url(bytes) {
  let binary=''; const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
function unpackResult(packed) {
  if(typeof packed!=='bigint') throw new Error('email stage1 wasm returned an invalid result');
  return {ptr:Number(packed&0xffffffffn),len:Number((packed>>32n)&0xffffffffn)};
}

export async function processEmailStage1(email) {
  if(typeof email!=='string') throw new TypeError('email must be a string');
  const wasm=await loadWasm();
  if(!wasm.memory||!wasm.alloc||!wasm.dealloc||!wasm.process_email) throw new Error('email stage1 wasm exports are incomplete');
  const input=new TextEncoder().encode(email);
  const inputPtr=input.length?wasm.alloc(input.length):0;
  if(input.length&&!inputPtr) throw new Error('email stage1 wasm allocation failed');
  try {
    if(input.length) new Uint8Array(wasm.memory.buffer).set(input,inputPtr);
    const {ptr,len}=unpackResult(wasm.process_email(inputPtr,input.length));
    if(!ptr||!len) throw new Error('email stage1 wasm produced an empty result');
    const result=new Uint8Array(wasm.memory.buffer).slice(ptr,ptr+len);
    wasm.dealloc(ptr,len);
    if(result[0]===0xff) throw new EmailStage1Error(result[1]||0);
    if(result[0]!==3) throw new Error('unsupported email stage1 payload version');
    const kidLen=result[1];
    const kid=new TextDecoder().decode(result.slice(2,2+kidLen));
    return Object.freeze({
      version:3,
      kind:'email',
      algorithm:'oc-email-stage1-rsa-oaep-sha256-v3',
      keyId:kid,
      payload:toBase64Url(result),
      payloadBytes:result.length,
    });
  } finally { if(inputPtr) wasm.dealloc(inputPtr,input.length); }
}

export async function warmEmailStage1(){await loadWasm();}
