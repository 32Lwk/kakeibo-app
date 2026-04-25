import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGoogleAccessTokenForUser } from "@/lib/googleOAuth";

export async function POST() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let accessToken: string;
  try {
    accessToken = await getGoogleAccessTokenForUser(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Google認証に失敗しました。";
    return NextResponse.json({ error: "google_auth_failed", message: msg }, { status: 401 });
  }
  const res = await fetch("https://photospicker.googleapis.com/v1/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pickingConfig: { maxItemCount: "1" } }),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    // access_token が失効している可能性がある（refresh_token が無い/更新できない等）
    const status = res.status === 401 ? 401 : 500;
    return NextResponse.json({ error: "create_failed", status: res.status, body: text }, { status });
  }
  const json = JSON.parse(text) as { id: string; pickerUri: string; pollingConfig?: { pollInterval?: string; timeoutIn?: string } };
  return NextResponse.json({ sessionId: json.id, pickerUri: json.pickerUri, pollingConfig: json.pollingConfig });
}

export async function GET(req: Request) {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = String(url.searchParams.get("sessionId") ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "sessionId_required" }, { status: 400 });

  const accessToken = await getGoogleAccessTokenForUser(userId);
  const res = await fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: "get_failed", status: res.status, body: text }, { status: 500 });
  }
  const json = JSON.parse(text) as { mediaItemsSet?: boolean; pollingConfig?: { pollInterval?: string; timeoutIn?: string } };
  return NextResponse.json({ mediaItemsSet: Boolean(json.mediaItemsSet), pollingConfig: json.pollingConfig });
}

