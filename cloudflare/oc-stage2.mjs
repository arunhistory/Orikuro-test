const ALLOWED_ORIGIN = "https://arunhistory.github.io";
const SUPABASE_ROUTER_URL = "https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/submission-router";
const MAX_BODY_BYTES = 16384;
const STAGE2_ALGORITHM = "oc-email-stage2-double-v1";
const LAYER_ALGORITHM = "RSA-OAEP-256+A256GCM";
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

function validEnvelope(body) {
  if (!isObject(body) || !exactKeys(body, ["email", "input", "signature"])) return false;
  if (!isObject(body.email) || !isObject(body.input) || typeof body.signature !== "string") return false;
  if (!exactKeys(body.email, ["version", "kind", "algorithm", "payload", "payloadBytes"])) return false;
  if (body.email.version !== 2 || body.email.kind !== "email" || body.email.algorithm !== "oc-email-stage1-v2") return false;
  if (typeof body.email.payload !== "string" || body.email.payload.length < 1) return false;
  if (!Number.isInteger(body.email.payloadBytes) || body.email.payloadBytes < 1) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(body.signature)) return false;
  return true;
}

function toBase64Url(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function publicKeyConfig(env) {
  if (typeof env.OC_EMAIL_STAGE2_PUBLIC_KEY_JWK !== "string" || !env.OC_EMAIL_STAGE2_PUBLIC_KEY_JWK) {
    throw new Error("OC_EMAIL_STAGE2_PUBLIC_KEY_JWK is unavailable");
  }
  if (typeof env.OC_EMAIL_STAGE2_PUBLIC_KEY_KID !== "string" || !env.OC_EMAIL_STAGE2_PUBLIC_KEY_KID) {
    throw new Error("OC_EMAIL_STAGE2_PUBLIC_KEY_KID is unavailable");
  }

  let jwk;
  try {
    jwk = JSON.parse(env.OC_EMAIL_STAGE2_PUBLIC_KEY_JWK);
  } catch {
    throw new Error("OC_EMAIL_STAGE2_PUBLIC_KEY_JWK is invalid");
  }
  if (!isObject(jwk) || jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string") {
    throw new Error("OC_EMAIL_STAGE2_PUBLIC_KEY_JWK is not an RSA public key");
  }
  return { jwk, kid: env.OC_EMAIL_STAGE2_PUBLIC_KEY_KID };
}

async function importStage2PublicKey(env) {
  const { jwk, kid } = publicKeyConfig(env);
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  return { key, kid };
}

async function encryptLayer(data, publicKey, kid, layer) {
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aadText = `OC/EMAIL/CLOUDFLARE/STAGE2/V1/LAYER${layer}`;
  const aad = encoder.encode(aadText);

  try {
    const aesKey = await crypto.subtle.importKey(
      "raw",
      dek,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );

    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
      aesKey,
      data,
    );

    const wrappedKey = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      publicKey,
      dek,
    );

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

async function encryptEmailTwice(email, env) {
  const { key: publicKey, kid } = await importStage2PublicKey(env);

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

  return Object.freeze({
    version: 3,
    kind: "email",
    algorithm: STAGE2_ALGORITHM,
    payload,
    payloadBytes,
  });
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
      try {
        publicKeyConfig(env);
        cryptoReady = true;
      } catch {}
      return reply(origin, 200, {
        ok: true,
        service: "oc-stage2",
        version: 4,
        mode: "production",
        emailEncryption: { layers: 2, algorithm: STAGE2_ALGORITHM, ready: cryptoReady },
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
      return reply(origin, 413, { status: "rejected_schema", signature: "", message: "送信内容が大きすぎます。" });
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(origin, 400, { status: "rejected_schema", signature: "", message: "送信内容の形式が正しくありません。" });
    }

    const signature = isObject(body) && typeof body.signature === "string" ? body.signature : "";
    if (!validEnvelope(body)) {
      return reply(origin, 400, { status: "rejected_schema", signature, message: "送信データの構造が正しくありません。" });
    }

    if (typeof env.OC_SUBMISSION_ROUTER_SECRET !== "string" || !env.OC_SUBMISSION_ROUTER_SECRET) {
      return reply(origin, 500, { status: "system_error", signature, message: "保存経路を利用できません。" });
    }

    let protectedEmail;
    try {
      protectedEmail = await encryptEmailTwice(body.email, env);
    } catch {
      return reply(origin, 500, { status: "system_error", signature, message: "メール保護処理を利用できません。" });
    }

    const protectedBody = {
      email: protectedEmail,
      input: body.input,
      signature: body.signature,
    };

    let upstream;
    try {
      upstream = await fetch(SUPABASE_ROUTER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-oc-router-secret": env.OC_SUBMISSION_ROUTER_SECRET,
        },
        body: JSON.stringify(protectedBody),
      });
    } catch {
      return reply(origin, 502, { status: "system_error", signature, message: "保存処理との通信に失敗しました。" });
    }

    const upstreamText = await upstream.text();
    let payload;
    try {
      payload = JSON.parse(upstreamText);
    } catch {
      return reply(origin, 502, { status: "system_error", signature, message: "保存処理から不正な応答を受信しました。" });
    }

    return reply(origin, upstream.status, payload);
  },
};
