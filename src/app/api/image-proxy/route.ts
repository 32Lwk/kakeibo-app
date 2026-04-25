import { NextResponse } from "next/server";

const ALLOWED_PREFIXES = ["https://lh3.googleusercontent.com/"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = String(url.searchParams.get("url") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "url_required" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  const targetStr = target.toString();
  const ok = ALLOWED_PREFIXES.some((p) => targetStr.startsWith(p));
  if (!ok) return NextResponse.json({ error: "forbidden_host" }, { status: 403 });

  const upstream = await fetch(targetStr, { cache: "no-store" });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "upstream_failed", status: upstream.status, statusText: upstream.statusText },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await upstream.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      // クライアントで canvas に描けるように
      "Access-Control-Allow-Origin": "*",
    },
  });
}

