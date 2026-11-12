const A_KID = '_hZuoQf2N2Cdjo0vxFrAoUEVojA_laBgN2J4jOzX97U';
const OUTPUT_ALGORITHM = 'oc-full-name-stage1-a-rsa-match-v1';
const MATCH_DIGEST_CONTEXT = 'OC/FULL-NAME/MATCH-DIGEST/V1|';
const A_PUBLIC_JWK = Object.freeze({
  kty: 'RSA',
  n: '1D5Awx-CGldUa8JLBSHvoBYbc16pWCq8Yl8xxcidXuig6U6mA-GEZb7oDBZ0jOe2GVqP_Xy2C8GK9EaOhU8wCcRQFqMRrdHPgcqXhmzwTQyNBpEdN1DR9VbEpIPiUSHPSDz1K_eFyeGrn-0vZ0gSeh5eqNtHHDQ1HBAQJEoZ2OoSub08AEkCBY-g_APp-3XUQOjwfQ9DgEDVr5cBEdVXEhkODsuv5-wrRWS3NhiYMdahlITYp8z1waNaccoD1t-wtO1DdjsHRjhstWUm7M7j-RkOObCQdk3sm4VO0URCxaSBq6w-Hh0PX_1US1NluNbmwDuKTG2f8FAKqw42-otNWyQ2ohNK-ciTzIDZVUUmD7kiJ2oLu3HjJIQwEcYUXd5g87pjvJniNTkDBXP0i9AFHtJQ1ahsQmIhpwqDonljYzKWx5H44HN2rqjpcFP3WJgPxHKR1U7tvWLcbc7o9VP7mxIqZvQUAhrV_e1fh_TdHCSBWoHf3acMadVCxCNwrSOh',
  e: 'AQAB',
  alg: 'RSA-OAEP-256',
  use: 'enc',
  kid: A_KID,
});
let publicKeyPromise;
const encoder = new TextEncoder();
function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function normalizeForMatch(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, '');
}
async function publicKey() {
  if (!publicKeyPromise) {
    publicKeyPromise = crypto.subtle.importKey('jwk', A_PUBLIC_JWK, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  }
  return publicKeyPromise;
}
export class FullNameStage1Error extends Error {
  constructor(message) { super(message); this.name = 'FullNameStage1Error'; }
}
export async function processFullNameStage1(value) {
  if (typeof value !== 'string') throw new TypeError('full name must be a string');
  const original = value.trim();
  if (!original || /[\u0000-\u001f\u007f]/u.test(original)) throw new FullNameStage1Error('本名を正しく入力してください。');
  const normalized = normalizeForMatch(original);
  if (!normalized || normalized.length > 100) throw new FullNameStage1Error('本名を正しく入力してください。');
  const plain = encoder.encode(original);
  if (plain.length > 240) { plain.fill(0); throw new FullNameStage1Error('本名が長すぎます。'); }
  const digestInput = encoder.encode(`${MATCH_DIGEST_CONTEXT}${normalized}`);
  try {
    const [encryptedBuffer, digestBuffer] = await Promise.all([
      crypto.subtle.encrypt({ name: 'RSA-OAEP' }, await publicKey(), plain),
      crypto.subtle.digest('SHA-256', digestInput),
    ]);
    const encrypted = new Uint8Array(encryptedBuffer);
    const kid = encoder.encode(A_KID);
    const framed = new Uint8Array(1 + kid.length + 2 + encrypted.length);
    framed[0] = kid.length;
    framed.set(kid, 1);
    framed[1 + kid.length] = (encrypted.length >>> 8) & 0xff;
    framed[2 + kid.length] = encrypted.length & 0xff;
    framed.set(encrypted, 3 + kid.length);
    return Object.freeze({
      version: 1,
      kind: 'full_name',
      algorithm: OUTPUT_ALGORITHM,
      payload: toBase64Url(framed),
      payloadBytes: framed.length,
      matchDigest: toBase64Url(new Uint8Array(digestBuffer)),
    });
  } finally {
    plain.fill(0);
    digestInput.fill(0);
  }
}
