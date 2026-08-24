const ALLOWED_ORIGIN = "https://arunhistory.github.io";
const SUPABASE_ROUTER_URL = "https://mpuhgfbdkxmhynytwhzu.supabase.co/functions/v1/submission-router";
const MAX_BODY_BYTES = 16384;

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: cors(origin) });
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return reply(origin, 200, { ok: true, service: "oc-stage2", version: 3, mode: "production" });
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
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
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

    let upstream;
    try {
      upstream = await fetch(SUPABASE_ROUTER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-oc-router-secret": env.OC_SUBMISSION_ROUTER_SECRET,
        },
        body: JSON.stringify(body),
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
