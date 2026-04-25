import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGoogleAccessTokenForUser } from "@/lib/googleOAuth";

export async function GET(req: Request) {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = String(url.searchParams.get("sessionId") ?? "").trim();
  if (!sessionId) return NextResponse.json({ error: "sessionId_required" }, { status: 400 });

  const accessToken = await getGoogleAccessTokenForUser(userId);
  const res = await fetch(`https://photospicker.googleapis.com/v1/mediaItems?sessionId=${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) return NextResponse.json({ error: "list_failed", status: res.status, body: text }, { status: 500 });

  const json = JSON.parse(text) as {
    mediaItems?: { mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string } }[];
  };
  const first = json.mediaItems?.[0]?.mediaFile;
  if (!first?.baseUrl) return NextResponse.json({ error: "no_media" }, { status: 404 });
  return NextResponse.json({
    baseUrl: first.baseUrl,
    mimeType: first.mimeType ?? "image/jpeg",
    fileName: first.filename ?? "google-photos.jpg",
  });
}

