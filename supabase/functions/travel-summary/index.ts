// ============================================================
//  여행일지 일차 요약 자동 생성
//  camping_app(정적 사이트)은 서버가 없어서 Claude API 키를 안전하게
//  둘 곳이 없습니다. 이 Edge Function이 그 대신 API 키를 들고 있다가,
//  일정 목록을 받아 Claude에게 요약을 부탁하고 결과만 돌려줍니다.
//
//  배포: Supabase 대시보드 → Edge Functions → travel-summary 로
//  이 파일 내용을 붙여넣고 Deploy 하세요.
//  비밀키: 같은 화면(또는 Project Settings → Edge Functions → Secrets)
//  에서 ANTHROPIC_API_KEY 를 등록해야 합니다.
// ============================================================

const ALLOWED_ORIGIN = "https://dbsgud619-boop.github.io";
const MODEL = "claude-haiku-4-5-20251001";

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

type ItemInput = {
  time?: string;
  category?: string;
  schedule?: string;
  location?: string;
};

function buildPrompt(day: number, items: ItemInput[]): string {
  const lines = items
    .map((i) => {
      const time = i.time ? i.time : "시간 미정";
      const cat = i.category ? `[${i.category}] ` : "";
      const loc = i.location ? ` @ ${i.location}` : "";
      return `${time} ${cat}${i.schedule || ""}${loc}`;
    })
    .join("\n");

  return `다음은 여행 ${day}일차의 일정 목록입니다.

${lines}

이 일정을 바탕으로 아래 JSON 형식으로만 답해주세요 (다른 설명이나 코드블록 없이 JSON만):
{
  "mainRoute": "그날의 주요 동선을 한두 문장으로 요약 (예: 인천 출발→도하 경유→카이로 도착→기자지역 이동)",
  "checkpoints": "시간이 정해진 중요 체크포인트를 간단히 나열 (예: 11:05 카이로 도착, 18:00 호텔 체크인)",
  "cautions": "이 날 일정에서 실제로 주의할 점이나 준비물이 있으면 한 문장, 특별히 없으면 빈 문자열"
}
각 항목은 500자를 넘지 않게 써주세요.`;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST만 지원합니다." }), {
      status: 405,
      headers: { ...headers, "content-type": "application/json" },
    });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." }), {
        status: 500,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const day = Number(body?.day);
    const items: ItemInput[] = Array.isArray(body?.items) ? body.items : [];
    if (!Number.isInteger(day) || day < 1 || items.length === 0) {
      return new Response(JSON.stringify({ error: "요청 형식이 올바르지 않습니다." }), {
        status: 400,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: "user", content: buildPrompt(day, items) }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(JSON.stringify({ error: `Claude API 오류: ${errText.slice(0, 300)}` }), {
        status: 502,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const data = await resp.json();
    const text: string = data?.content?.[0]?.text ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return new Response(JSON.stringify({ error: "요약 형식을 해석하지 못했습니다." }), {
        status: 502,
        headers: { ...headers, "content-type": "application/json" },
      });
    }

    const parsed = JSON.parse(match[0]);
    const summary = {
      mainRoute: String(parsed.mainRoute || "").slice(0, 500),
      checkpoints: String(parsed.checkpoints || "").slice(0, 500),
      cautions: String(parsed.cautions || "").slice(0, 500),
    };

    return new Response(JSON.stringify({ summary }), {
      headers: { ...headers, "content-type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, "content-type": "application/json" },
    });
  }
});
