// Supabase Edge Function: 提交 50 题答案，服务端计分并写入结果。
// 只使用 service_role（Edge Runtime 自动注入），前端拿不到评分模型与城市坐标。
import { createClient } from "npm:@supabase/supabase-js@2";
import { pickResult, validateAnswers } from "../_shared/scoring.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function newResultId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "只支持 POST" }, 405);

  let payload: { sessionId?: string; answers?: Record<string, string> };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "请求格式不正确" }, 400);
  }

  const sessionId = payload.sessionId;
  const answers = payload.answers;
  if (!sessionId || typeof sessionId !== "string" || sessionId.length > 64) {
    return json({ ok: false, error: "会话不存在，请重新输入卡密" }, 400);
  }

  const valid = validateAnswers(answers);
  if (!valid.ok) return json({ ok: false, error: valid.error }, 400);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, error: "服务未配置" }, 500);

  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("id, code, submitted_at, result_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr) {
    console.error("session lookup", sessionErr);
    return json({ ok: false, error: "提交失败，请重试" }, 500);
  }
  if (!session) return json({ ok: false, error: "会话不存在，请重新输入卡密" }, 404);

  // 幂等：重复提交直接返回已经生成的结果。
  if (session.submitted_at && session.result_id) {
    return json({ ok: true, resultId: session.result_id });
  }

  const result = pickResult(answers as Record<string, string>);
  const resultId = newResultId();

  const { data: saved, error: saveErr } = await db.rpc("finalize_result", {
    p_session_id: sessionId,
    p_result_id: resultId,
    p_data: result,
  });

  if (saveErr) {
    console.error("finalize_result", saveErr);
    return json({ ok: false, error: "提交失败，请重试" }, 500);
  }

  return json({ ok: true, resultId: saved || resultId });
});
