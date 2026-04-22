import OpenAI from "openai";
import { z } from "zod";
import { requireAuthedContext, requireRole } from "@/lib/authz";

const TxSchema = z.object({
  id: z.string().min(1),
  purchaseDate: z.string().min(1),
  createdAt: z.string().min(1),
  type: z.string().min(1),
  totalAmount: z.number(),
  memo: z.string().nullable(),
});

const BodySchema = z.object({
  txs: z.array(TxSchema).min(2).max(50),
});

export async function POST(req: Request) {
  try {
    const ctx = await requireAuthedContext();
    requireRole(ctx, "editor");

    const bodyJson = await req.json().catch(() => null);
    const body = BodySchema.parse(bodyJson);

    const apiKey = process.env.OPENNAI_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENAI_API;
    if (!apiKey) {
      return Response.json({ ok: false, error: "OPENNAI_API_KEY が未設定です。" }, { status: 400 });
    }

    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

    const system = [
      "あなたは家計簿アプリのデータクレンジング補助です。",
      "ユーザーは重複候補グループの中から『残すべき1件』を決めたいです。",
      "基準: 情報量が多い（メモが具体的）、意味がある（空メモより有益）、日付が不自然でない。",
      "回答は必ず JSON で返してください。",
      '形式: {"keepId":"...","reason":"..."}',
    ].join("\n");

    const user = [
      "次のトランザクション配列から、残すべき1件の id を1つ選んでください。",
      "他は削除候補になります。",
      "データ:",
      JSON.stringify(body.txs),
    ].join("\n");

    const resp = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" } as any,
    });

    const content = resp.choices[0]?.message?.content ?? "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      return Response.json({ ok: false, error: "AIの返答がJSONではありません。", raw: content }, { status: 502 });
    }

    const keepId = String(parsed.keepId ?? "");
    const reason = String(parsed.reason ?? "");
    if (!keepId || !body.txs.some((t) => t.id === keepId)) {
      return Response.json({ ok: false, error: "AIが不正な keepId を返しました。", raw: parsed }, { status: 502 });
    }

    return Response.json({ ok: true, keepId, reason, model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}

