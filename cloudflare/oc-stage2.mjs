const ALLOWED_ORIGIN = "https://arunhistory.github.io";
const SUPABASE_ROUTER_URL = "https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/submission-router";
const SUPABASE_DELETE_REQUEST_URL = "https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/preregister-delete-request";
const MAX_BODY_BYTES = 16384;
const LEGACY_STAGE1_ALGORITHM = "oc-email-stage1-a-rsa-v1";
const MATCH_STAGE1_ALGORITHM = "oc-email-stage1-a-rsa-match-v2";
const STAGE2_ALGORITHM = "oc-email-stage2-double-v1";
const LAYER_ALGORITHM = "RSA-OAEP-256+A256GCM";
const MATCH_KEY_CONTEXT = "OC/EMAIL/MATCH-KEY/V1";
const STAGE2_PUBLIC_KEY_KID = "juLZWwM28kxjHOTZc3xCCnkTDwfvJ2QeBVwuMce9S7w";
const STAGE2_PUBLIC_KEY_JWK = Object.freeze({
  kty: "RSA",
  n: "mgrIAuERRTnHlPVwqX0q01J7RAaP6RK_jXnJC7uUOLWfKQ9IbAzDkHZc0SNMl7Ifg5qEhcLw7uZ_NiwfSMrQDrP6Qhqm6f7MyLsoadJVz-7HvTjmsWy2Adzpu2BueO1FYxuCQe1Jfkl9-MkDGmQHcqR7g5yijM9gQwo9eLYPtHYJoTxok3fxmwymFGnxO33d9jfSmweS3e8gXO-a5-TktzvHqjV6TEl0hz8SH5ZWKQVzvTmDiQ79Ru8BiMmgMuUZM5wjKNwHYIkpBcxrcoN9NOJ6fpADR79XN1APi_efxb83ayMypyl6FFbG6lW3ljLnmQO1vXNtNyb3LRiSv71YHUt6jcix0JIBVxjyF82rH_tRibhN_acy7fGJrok_S1OpyWAXZC6lIhGgmo9goVLB3628gE5pxSUhiZQqlpmrzHavbYhVSPBfIBGeB8iFi7qR8JznjQp5xep0tQwiGuLH9kI92SE-oqgaj4T63o7MOovfqOP14dqLTKGJl0fHawkx",
  e: "AQAB",
  alg: "RSA-OAEP-256",
  use: "enc",
  kid: STAGE2_PUBLIC_KEY_KID,
});
const encoder = new TextEncoder();

function cors(origin) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  };
  if (origin === ALLOWED_ORIGIN) headers["access-control-allow-origin"] = ALLOWED_ORIGIN;
  return headers;
}

function reply(origin, status, body) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function validEmailEnvelope(email) {
  if (!isObject(email)) return false;

  const commonValid = email.kind === "email"
    && typeof email.payload === "string"
    && email.payload.length > 0
    && Number.isInteger(email.payloadBytes)
    && email.payloadBytes > 0;
  if (!commonValid) return false;

  if (email.version === 3 && email.algorithm === LEGACY_STAGE1_ALGORITHM) {
    return exactKeys(email, ["version", "kind", "algorithm", "payload", "payloadBytes"]);
  }

  if (email.version === 4 && email.algorithm === MATCH_STAGE1_ALGORITHM) {
    return exactKeys(email, ["version", "kind", "algorithm", "payload", "payloadBytes", "matchDigest"])
      && typeof email.matchDigest === "string"
      && /^[A-Za-z0-9_-]{43}$/.test(email.matchDigest);
  }

  return false;
}

function validEnvelope(body) {
  if (!isObject(body) || !exactKeys(body, ["email", "input", "signature"])) return false;
  if (!isObject(body.input) || typeof body.signature !== "string") return false;
  if (!validEmailEnvelope(body.email)) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(body.signature)) return false;
  return true;
}

function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  let source = value.replace(/-/g, "+").replace(/_/g, "/");
  while (source.length % 4) source += "=";
  const binary = atob(source);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function legacyStage1Envelope(email) {
  return Object.freeze({
    version: 3,
    kind: "email",
    algorithm: LEGACY_STAGE1_ALGORITHM,
    payload: email.payload,
    payloadBytes: email.payloadBytes,
  });
}

async function deriveMatchToken(matchDigest, rootSecret) {
  if (!matchDigest) return null;

  const digestBytes = fromBase64Url(matchDigest);
  const rootBytes = encoder.encode(rootSecret);
  const contextBytes = encoder.encode(MATCH_KEY_CONTEXT);
  let derivedBytes;
  try {
    if (digestBytes.length !== 32) throw new Error("invalid_match_digest");
    const rootKey = await crypto.subtle.importKey(
      "raw",
      rootBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    derivedBytes = new Uint8Array(await crypto.subtle.sign("HMAC", rootKey, contextBytes));
    const matchKey = await crypto.subtle.importKey(
      "raw",
      derivedBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const token = new Uint8Array(await crypto.subtle.sign("HMAC", matchKey, digestBytes));
    try {
      return toBase64Url(token);
    } finally {
      token.fill(0);
    }
  } finally {
    digestBytes.fill(0);
    rootBytes.fill(0);
    contextBytes.fill(0);
    derivedBytes?.fill(0);
  }
}

async function importStage2PublicKey() {
  const key = await crypto.subtle.importKey(
    "jwk",
    STAGE2_PUBLIC_KEY_JWK,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  return { key, kid: STAGE2_PUBLIC_KEY_KID };
}

async function encryptLayer(data, publicKey, kid, layer) {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aadText = `OC/EMAIL/CLOUDFLARE/STAGE2/V1/LAYER${layer}`;
  const aad = encoder.encode(aadText);

  try {
    const aesKey = await crypto.subtle.importKey("raw", dek, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
      aesKey,
      data,
    );
    const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, dek);

    return Object.freeze({
      version: 1,
      layer,
      algorithm: LAYER_ALGORITHM,
      kid,
      aad: aadText,
      iv: toBase64Url(iv),
      wrappedKey: toBase64Url(wrappedKey),
      ciphertext: toBase64Url(ciphertext),
    });
  } finally {
    dek.fill(0);
  }
}

async function encryptEmailTwice(email) {
  const { key: publicKey, kid } = await importStage2PublicKey();
  const stage1Bytes = encoder.encode(JSON.stringify(email));
  const layer1 = await encryptLayer(stage1Bytes, publicKey, kid, 1);
  stage1Bytes.fill(0);

  const layer1Bytes = encoder.encode(JSON.stringify(layer1));
  const layer2 = await encryptLayer(layer1Bytes, publicKey, kid, 2);
  layer1Bytes.fill(0);

  const outerBytes = encoder.encode(JSON.stringify(layer2));
  const payload = toBase64Url(outerBytes);
  const payloadBytes = outerBytes.byteLength;
  outerBytes.fill(0);

  return Object.freeze({ version: 3, kind: "email", algorithm: STAGE2_ALGORITHM, payload, payloadBytes });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: cors(origin) });
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      let cryptoReady = false;
      try { await importStage2PublicKey(); cryptoReady = true; } catch {}
      return reply(origin, 200, {
        ok: true,
        service: "oc-stage2",
        version: 8,
        mode: "production",
        inputEncryption: [LEGACY_STAGE1_ALGORITHM, MATCH_STAGE1_ALGORITHM],
        matchIndex: { algorithm: "HMAC-SHA-256", ready: typeof env.OC_SUBMISSION_ROUTER_SECRET === "string" && !!env.OC_SUBMISSION_ROUTER_SECRET },
        emailEncryption: { layers: 2, algorithm: STAGE2_ALGORITHM, kid: STAGE2_PUBLIC_KEY_KID, ready: cryptoReady },
      });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/process") {
      return reply(origin, 405, { status: "rejected", signature: "", message: "許可されていない通信です。" });
    }
    if (origin !== ALLOWED_ORIGIN) {
      return reply(origin, 403, { status: "rejected", signature: "", message: "送信元を確認できません。" });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return reply(origin, 415, { status: "rejected_schema", signature: "", message: "送信形式が正しくありません。" });
    }

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return reply(origin, 413, { status: "rejected_schema", signature: "", message: "送信内容が大きすぎます。" });
    }

    const text = await request.text();
    if (encoder.encode(text).byteLength > MAX_BODY_BYTES) {
      return reply(origin, 413, { status: "rejected_schema", signature, message: "送信内容が大きすぎます。" });
    }

    let body;
    try { body = JSON.parse(text); }
    catch { return reply(origin, 400, { status: "rejected_schema", signature: "", message: "送信内容の形式が正しくありません。" }); }

    const signature = isObject(body) && typeof body.signature === "string" ? body.signature : "";
    if (!validEnvelope(body)) {
      return reply(origin, 400, { status: "rejected_schema", signature, message: "送信データの構造が正しくありません。" });
    }

    if (typeof env.OC_SUBMISSION_ROUTER_SECRET !== "string" || !env.OC_SUBMISSION_ROUTER_SECRET) {
      return reply(origin, 500, { status: "system_error", signature, message: "保存経路を利用できません。" });
    }

    let protectedEmail;
    let matchToken = null;
    try {
      const stage1ForStorage = legacyStage1Envelope(body.email);
      [protectedEmail, matchToken] = await Promise.all([
        encryptEmailTwice(stage1ForStorage),
        body.email.version === 4
          ? deriveMatchToken(body.email.matchDigest, env.OC_SUBMISSION_ROUTER_SECRET)
          : Promise.resolve(null),
      ]);
    } catch {
      return reply(origin, 500, { status: "system_error", signature, message: "メール保護処理を利用できません。" });
    }

    const isDeletionRequest = body.input.deletePreregisterEmail === true;
    const upstreamUrl = isDeletionRequest ? SUPABASE_DELETE_REQUEST_URL : SUPABASE_ROUTER_URL;

    let upstream;
    try {
      const headers = {
        "content-type": "application/json",
        "x-oc-router-secret": env.OC_SUBMISSION_ROUTER_SECRET,
      };
      if (matchToken) headers["x-oc-email-match-token"] = matchToken;

      upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ email: protectedEmail, input: body.input, signature: body.signature }),
      });
    } catch {
      return reply(origin, 502, { status: "system_error", signature, message: "保存処理との通信に失敗しました。" });
    }

    const upstreamText = await upstream.text();
    let payload;
    try { payload = JSON.parse(upstreamText); }
    catch { return reply(origin, 502, { status: "system_error", signature, message: "保存処理から不正な応答を受信しました。" }); }

    return reply(origin, upstream.status, payload);
  },
};
