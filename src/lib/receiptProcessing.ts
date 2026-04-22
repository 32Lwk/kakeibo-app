import { ImageAnnotatorClient } from "@google-cloud/vision";
import OpenAI from "openai";
import { z } from "zod";

const StructuredSchema = z.object({
  storeName: z.string().optional().nullable(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  totalAmount: z.number().int().nonnegative().optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number().int().nonnegative(),
      }),
    )
    .optional()
    .nullable(),
});

export type StructuredReceipt = z.infer<typeof StructuredSchema>;

export async function runVisionOcr(imageBytes: Uint8Array) {
  const hasCreds =
    !!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY);
  if (!hasCreds) {
    throw new Error("Vision OCRが未設定です（GOOGLE_APPLICATION_CREDENTIALS 等）。");
  }

  const client = new ImageAnnotatorClient();
  const [result] = await client.textDetection({ image: { content: Buffer.from(imageBytes) } });
  const text = result.fullTextAnnotation?.text ?? "";
  if (!text.trim()) throw new Error("OCR結果が空でした。");
  return text;
}

export async function structureWithOpenAI(ocrText: string): Promise<StructuredReceipt> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAIが未設定です（OPENAI_API_KEY）。");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const prompt = [
    "次のOCRテキストから、家計簿のレシート情報をJSONで抽出してください。",
    "",
    "要件:",
    "- JSONのみを返す（前後に説明文を付けない）",
    "- purchaseDate は YYYY-MM-DD（不明なら null）",
    "- totalAmount は合計金額（円、整数。不明なら null）",
    "- storeName は店名（不明なら null）",
    "- items は明細（name, amount）。不明なら空配列でもよい",
    "",
    "返却JSONの形:",
    '{"storeName":string|null,"purchaseDate":string|null,"totalAmount":number|null,"items":[{"name":string,"amount":number}]}',
    "",
    "OCR:",
    ocrText,
  ].join("\n");

  const res = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.choices[0]?.message?.content ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // Try to salvage: find first/last braces
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      json = JSON.parse(text.slice(start, end + 1));
    } else {
      throw new Error("OpenAIの出力がJSONとして解析できませんでした。");
    }
  }

  const parsed = StructuredSchema.safeParse(json);
  if (!parsed.success) throw new Error("OpenAIの出力がスキーマに一致しませんでした。");
  return parsed.data;
}

