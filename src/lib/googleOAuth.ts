import { prisma } from "@/lib/db";

type GoogleTokenResult = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export async function getGoogleAccessTokenForUser(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account) throw new Error("Google連携が見つかりません。Googleでログインしてください。");

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAt = account.expires_at ?? 0;
  const hasValidAccessToken = account.access_token && expiresAt > nowSec + 30; // 30s 余裕
  if (hasValidAccessToken) return account.access_token!;

  // expires_at が保存されていない環境では、access_token がまだ有効な可能性があるため一旦それを使う
  if (account.access_token && (account.expires_at == null || account.expires_at <= 0)) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error("Googleのrefresh_tokenがありません。いったんGoogleで再ログインしてください。");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が設定されていません。");

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", account.refresh_token);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Googleトークン更新に失敗しました。");
  const json = (await res.json()) as GoogleTokenResult;
  if (!json.access_token) throw new Error("Googleトークン更新に失敗しました。");

  const newExpiresAt = typeof json.expires_in === "number" ? nowSec + json.expires_in : null;
  await prisma.account.update({
    where: { id: account.id },
    data: { access_token: json.access_token, expires_at: newExpiresAt ?? undefined },
  });

  return json.access_token;
}

