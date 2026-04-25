import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGoogleAccessTokenForUser } from "@/lib/googleOAuth";

export async function GET(req: Request) {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const baseUrl = String(url.searchParams.get("baseUrl") ?? "").trim();
  const w = Math.max(1, Math.min(2048, Number(url.searchParams.get("w") ?? "512") || 512));
  const h = Math.max(1, Math.min(2048, Number(url.searchParams.get("h") ?? "512") || 512));
  if (!baseUrl) return NextResponse.json({ error: "baseUrl_required" }, { status: 400 });

  // Picker が返す baseUrl は googleusercontent の想定。念のため制限する。
  if (!baseUrl.startsWith("https://lh3.googleusercontent.com/")) {
    return NextResponse.json({ error: "forbidden_host" }, { status: 403 });
  }

  const accessToken = await getGoogleAccessTokenForUser(userId);
  const contentUrl = `${baseUrl}=w${w}-h${h}`;
  const upstream = await fetch(contentUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "upstream_failed", status: upstream.status, statusText: upstream.statusText },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}

