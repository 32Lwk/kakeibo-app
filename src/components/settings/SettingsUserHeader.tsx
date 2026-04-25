"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { signIn } from "next-auth/react";
import type { MembershipRole } from "@prisma/client";
import {
  createHouseholdInviteLink,
  createHouseholdLayer,
  deleteHouseholdLayer,
  approveJoinRequest,
  rejectJoinRequest,
  renameHouseholdLayer,
  revokeHouseholdInvite,
  revokeAllHouseholdInvites,
  setPreferredLayerFromForm,
  updateMemberRole,
  removeMember,
  updateProfileDisplayName,
  updateProfileImage,
  uploadProfileImage,
  uploadProfileImageFromGooglePhotos,
  exchangeGoogleAuthCodeForPhotosAccessToken,
} from "@/app/(app)/settings/actions";

type GisOauth2 = {
  initTokenClient: (opts: {
    client_id: string;
    scope: string;
    callback: (resp: { access_token?: string; expires_in?: number }) => void;
    error_callback?: (resp: { type?: string }) => void;
  }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
  initCodeClient: (opts: {
    client_id: string;
    scope: string;
    ux_mode?: "popup" | "redirect";
    redirect_uri?: string;
    state?: string;
    callback?: (resp: { code?: string; state?: string }) => void;
    error_callback?: (resp: { type?: string }) => void;
  }) => { requestCode: () => void };
};

type GisWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: GisOauth2;
    };
  };
};

export type SettingsUserHeaderMember = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: MembershipRole;
};

type Props = {
  user: { name: string | null; email: string | null; image: string | null };
  household: { id: string; name: string };
  membershipRole: MembershipRole;
  members: SettingsUserHeaderMember[];
  layers: { id: string; name: string }[];
  activeLayerId: string;
  invites: { id: string; token: string; role: MembershipRole; expiresAt: Date; createdAt: Date }[];
  joinRequests: {
    id: string;
    requestedRole: MembershipRole;
    createdAt: Date;
    user: { id: string; name: string | null; email: string | null; image: string | null };
  }[];
};

function roleLabel(r: MembershipRole) {
  switch (r) {
    case "owner":
      return "オーナー";
    case "editor":
      return "編集者";
    case "viewer":
      return "閲覧";
    default:
      return r;
  }
}

function IconCheck({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function Avatar({
  name,
  email,
  image,
  size = "lg",
}: {
  name: string | null;
  email: string | null;
  image: string | null;
  size?: "lg" | "sm";
}) {
  const initial = useMemo(() => {
    const n = (name ?? "").trim();
    if (n.length > 0) return n.slice(0, 1).toUpperCase();
    const e = (email ?? "").trim();
    if (e.length > 0) return e.slice(0, 1).toUpperCase();
    return "?";
  }, [name, email]);

  const cls = size === "lg" ? "size-14" : "size-9";
  const textCls = size === "lg" ? "text-lg" : "text-xs";

  if (image) {
    return (
      <img
        src={image}
        alt=""
        className={`${cls} shrink-0 rounded-2xl border border-black/10 object-cover`}
      />
    );
  }

  return (
    <div
      className={`${cls} ${textCls} flex shrink-0 items-center justify-center rounded-2xl border border-black/10 bg-black/[0.06] font-semibold text-neutral-700`}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function SettingsUserHeader({
  user,
  household,
  membershipRole,
  members,
  layers,
  activeLayerId,
  invites,
  joinRequests,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingImage, setEditingImage] = useState(false);
  const [imageDraftUrl, setImageDraftUrl] = useState<string | null>(null);
  const [imageDraftFile, setImageDraftFile] = useState<File | null>(null);
  const [googlePicked, setGooglePicked] = useState<{
    accessToken: string;
    baseUrl: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [googlePreviewUrl, setGooglePreviewUrl] = useState<string | null>(null);
  const [googlePicking, setGooglePicking] = useState(false);
  const [googlePickerUi, setGooglePickerUi] = useState<{ pickerUri: string } | null>(null);
  const [googlePickerError, setGooglePickerError] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropZoom, setCropZoom] = useState(1.2);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropBusy, setCropBusy] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const cropPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const cropPinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const uploadFormRef = useRef<HTMLFormElement | null>(null);
  const urlFormRef = useRef<HTMLFormElement | null>(null);
  const googleFormRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropDragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [inviteRole, setInviteRole] = useState<MembershipRole>("editor");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [showIssuedInvites, setShowIssuedInvites] = useState(false);
  const isOwner = membershipRole === "owner";

  const displayName = (user.name ?? "").trim() || user.email || "ユーザー";

  const imageDraftObjectUrl = useMemo(() => {
    if (!imageDraftFile) return null;
    return URL.createObjectURL(imageDraftFile);
  }, [imageDraftFile]);

  useEffect(() => {
    if (!imageDraftObjectUrl) return;
    return () => URL.revokeObjectURL(imageDraftObjectUrl);
  }, [imageDraftObjectUrl]);

  useEffect(() => {
    if (!googlePreviewUrl) return;
    // blob: の場合のみ revoke（https: など通常URLでは不要）
    if (!googlePreviewUrl.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(googlePreviewUrl);
  }, [googlePreviewUrl]);

  const imagePreviewSrc = useMemo(() => {
    if (googlePreviewUrl) return googlePreviewUrl;
    if (imageDraftObjectUrl) return imageDraftObjectUrl;
    if ((imageDraftUrl ?? "").trim()) return (imageDraftUrl ?? "").trim();
    return user.image;
  }, [googlePreviewUrl, imageDraftObjectUrl, imageDraftUrl, user.image]);

  const loadImageAsSafeUrl = async (src: string): Promise<{ url: string; revoke?: () => void }> => {
    // 可能ならそのまま使う。canvas に描くときにCORSで失敗したら image-proxy にフォールバックする。
    if (!src) throw new Error("画像がありません。");
    return { url: src };
  };

  const fetchViaProxyAsBlobUrl = async (src: string) => {
    const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(src)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("画像の取得に失敗しました（プロキシ）。");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  };

  const cropApply = async () => {
    if (!imagePreviewSrc) return;
    setCropBusy(true);
    setCropError(null);
    let revoke: (() => void) | undefined;
    try {
      let safe = await loadImageAsSafeUrl(imagePreviewSrc);
      let img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.src = safe.url;

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
      });

      const SIZE = 512;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvasの初期化に失敗しました。");

      const container = 240; // UI上のプレビュー枠（px想定）
      const scale = Math.max(1, cropZoom);
      // コンテナ中央を基準に offset だけ移動しているとみなす
      const dx = cropOffset.x;
      const dy = cropOffset.y;

      // 画像を container に cover で当てたときの基準スケール
      const baseCover = Math.max(container / img.naturalWidth, container / img.naturalHeight);
      const drawScale = baseCover * scale;
      const drawnW = img.naturalWidth * drawScale;
      const drawnH = img.naturalHeight * drawScale;
      const drawnX = (container - drawnW) / 2 + dx;
      const drawnY = (container - drawnH) / 2 + dy;

      // container(240) 内の正方形を SIZE に写す
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.save();
      ctx.scale(SIZE / container, SIZE / container);
      ctx.drawImage(img, drawnX, drawnY, drawnW, drawnH);
      ctx.restore();

      // CORSで canvas が汚染されている場合、toBlob で例外/失敗し得るのでフォールバック
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) reject(new Error("画像の書き出しに失敗しました。"));
            else resolve(b);
          },
          "image/jpeg",
          0.9,
        );
      }).catch(async () => {
        // proxy 経由で再試行
        const proxied = await fetchViaProxyAsBlobUrl(imagePreviewSrc);
        revoke = proxied.revoke;
        img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.src = proxied.url;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("画像の読み込みに失敗しました（プロキシ）。"));
        });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.save();
        ctx.scale(SIZE / container, SIZE / container);
        const baseCover2 = Math.max(container / img.naturalWidth, container / img.naturalHeight);
        const drawScale2 = baseCover2 * scale;
        const drawnW2 = img.naturalWidth * drawScale2;
        const drawnH2 = img.naturalHeight * drawScale2;
        const drawnX2 = (container - drawnW2) / 2 + dx;
        const drawnY2 = (container - drawnH2) / 2 + dy;
        ctx.drawImage(img, drawnX2, drawnY2, drawnW2, drawnH2);
        ctx.restore();
        const blob2 = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (!b) reject(new Error("画像の書き出しに失敗しました（プロキシ）。"));
              else resolve(b);
            },
            "image/jpeg",
            0.9,
          );
        });
        return blob2;
      });

      if (blob.size > 5 * 1024 * 1024) throw new Error("画像サイズが大きすぎます（最大5MB）。");
      const f = new File([blob], `cropped_${Date.now()}.jpg`, { type: "image/jpeg" });
      setImageDraftFile(f);
      setImageDraftUrl(null);
      setGooglePicked(null);
      setGooglePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setCropOpen(false);
    } catch (e) {
      setCropError(e instanceof Error ? e.message : "画像の調整に失敗しました。");
    } finally {
      if (revoke) revoke();
      setCropBusy(false);
    }
  };

  async function ensureGisLoaded() {
    if (typeof window === "undefined") return;
    if ((window as GisWindow).google?.accounts?.oauth2) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("GISの読み込みに失敗しました。")), { once: true });
        return;
      }
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("GISの読み込みに失敗しました。"));
      document.head.appendChild(s);
    });
  }

  const TOKEN_KEY = "gphotos_access_token";
  const TOKEN_EXPIRES_AT_KEY = "gphotos_access_expires_at_ms";
  const PENDING_SESSION_ID_KEY = "gphotos_pending_session_id";
  const PENDING_PICKER_URI_KEY = "gphotos_pending_picker_uri";

  const getCachedAccessToken = () => {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY) || "";
      const expiresAt = Number(sessionStorage.getItem(TOKEN_EXPIRES_AT_KEY) || "0");
      if (!token) return null;
      // 数十秒の余裕を見て切る
      if (!Number.isFinite(expiresAt) || Date.now() > expiresAt - 30_000) return null;
      return token;
    } catch {
      return null;
    }
  };

  const cacheAccessToken = (token: string, expiresInSec?: number | null) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
      // GIS の expires_in が無い場合でも、短めに見積もってキャッシュする
      const ttlMs = typeof expiresInSec === "number" && Number.isFinite(expiresInSec) && expiresInSec > 0 ? expiresInSec * 1000 : 30 * 60 * 1000;
      sessionStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + ttlMs));
    } catch {
      // noop
    }
  };

  const getPendingSession = () => {
    try {
      const id = (sessionStorage.getItem(PENDING_SESSION_ID_KEY) || "").trim();
      const pickerUri = (sessionStorage.getItem(PENDING_PICKER_URI_KEY) || "").trim();
      if (!id || !pickerUri) return null;
      return { id, pickerUri };
    } catch {
      return null;
    }
  };

  const setPendingSession = (id: string, pickerUri: string) => {
    try {
      sessionStorage.setItem(PENDING_SESSION_ID_KEY, id);
      sessionStorage.setItem(PENDING_PICKER_URI_KEY, pickerUri);
    } catch {
      // noop
    }
  };

  const clearPendingSession = () => {
    try {
      sessionStorage.removeItem(PENDING_SESSION_ID_KEY);
      sessionStorage.removeItem(PENDING_PICKER_URI_KEY);
    } catch {
      // noop
    }
  };

  function requestGoogleAccessToken(): Promise<string> {
    // 重要: クリック直後の同期コンテキストで popup を開けるように、
    // ここでは `await` しない（`await` が入るとポップアップがブロックされやすい）。
    // GIS は useEffect で事前ロードしておく。
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    // Google Identity Services (ブラウザ側) では NEXT_PUBLIC_ のみ参照できる。
    if (!clientId) {
      throw new Error(
        "NEXT_PUBLIC_GOOGLE_CLIENT_ID が設定されていません（値は .env の GOOGLE_CLIENT_ID と同じでOK）。開発サーバを再起動してください。",
      );
    }

    return new Promise<string>((resolve, reject) => {
      const google = (window as GisWindow).google;
      const oauth2 = google?.accounts?.oauth2;
      if (!oauth2) {
        reject(new Error("GISの初期化に失敗しました（読み込み待ち）。少し待ってからもう一度お試しください。"));
        return;
      }
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
        callback: (resp) => {
          if (!resp?.access_token) reject(new Error("Googleの認証に失敗しました。"));
          else {
            cacheAccessToken(resp.access_token as string, typeof resp.expires_in === "number" ? resp.expires_in : null);
            resolve(resp.access_token as string);
          }
        },
        error_callback: (e) => {
          const t = (e?.type ?? "").trim();
          // GIS が返す type: popup_failed_to_open / popup_closed / unknown
          reject(new Error(t ? `gis_error:${t}` : "gis_error:unknown"));
        },
      });
      tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  async function requestGoogleAccessTokenViaRedirect(): Promise<never> {
    await ensureGisLoaded();
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID が設定されていません。");
    const oauth2 = (window as GisWindow).google?.accounts?.oauth2;
    if (!oauth2) throw new Error("GISの初期化に失敗しました。");

    const redirectUri = `${window.location.origin}/settings`;
    const state = `gphotos_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem("gphotos_oauth_state", state);
    sessionStorage.setItem("gphotos_oauth_redirect_uri", redirectUri);

    await new Promise<void>((resolve, reject) => {
      const codeClient = oauth2.initCodeClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
        ux_mode: "redirect",
        redirect_uri: redirectUri,
        state,
        error_callback: (e) => reject(new Error(e?.type ? `Google認証に失敗しました: ${e.type}` : "Google認証に失敗しました。")),
      });
      try {
        codeClient.requestCode();
        resolve();
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Google認証の開始に失敗しました。"));
      }
    });

    // redirect されるのでここには戻らない想定（戻ってきたらバグ）
    throw new Error("redirecting");
  }

  useEffect(() => {
    // popup ブロック回避のため、GIS は事前ロードしておく
    ensureGisLoaded().catch(() => {
      // 読み込み失敗時は、実行時に requestGoogleAccessToken 側でエラー表示する
    });
    setPortalReady(true);

    // redirect UX の復帰処理: /settings?code=...&state=...
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expected = sessionStorage.getItem("gphotos_oauth_state");
    const redirectUri = sessionStorage.getItem("gphotos_oauth_redirect_uri") || `${window.location.origin}/settings`;
    if (!code || !state || !expected || state !== expected) return;

    // URLを綺麗にしてから処理（再実行防止）
    url.searchParams.delete("code");
    url.searchParams.delete("scope");
    url.searchParams.delete("state");
    window.history.replaceState({}, "", url.toString());
    sessionStorage.removeItem("gphotos_oauth_state");

    (async () => {
      try {
        const fd = new FormData();
        fd.set("code", code);
        fd.set("redirectUri", redirectUri);
        const { accessToken, expiresIn } = (await exchangeGoogleAuthCodeForPhotosAccessToken(fd)) as {
          accessToken: string;
          expiresIn: number | null;
        };
        cacheAccessToken(accessToken, expiresIn);
        // tokenClient が使えない環境向けに、ここでPickerを起動できるようにしておく
        setGooglePicking(true);
        setGooglePicked(null);
        setGooglePreviewUrl(null);
        await runGooglePhotosPickerInNewTab(accessToken);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Google認証に失敗しました。");
      } finally {
        setGooglePickerUi(null);
        setGooglePicking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!cropOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCropOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cropOpen]);

  useEffect(() => {
    // 「このタブで開く」から戻ってきた場合、保存しておいたセッションから再開する。
    // ブラウザの戻るは BFCache で復元されることがあり、その場合 useEffect([]) が再実行されないため、
    // pageshow/visibilitychange/focus でも再開を試みる。
    let running = false;

    const resumePending = async () => {
      if (running) return;
      const pending = getPendingSession();
      if (!pending) return;
      const token = getCachedAccessToken();
      if (!token) return;
      running = true;
      setGooglePicking(true);
      setGooglePickerUi({ pickerUri: pending.pickerUri });
      try {
        await pollAndFetchPickedItem(token, { id: pending.id });
        clearPendingSession();
      } catch (e) {
        // 失敗時も pending は残す（ユーザーが再試行できるようにする）
        alert(e instanceof Error ? e.message : "Googleフォトの取得に失敗しました。");
      } finally {
        setGooglePickerUi(null);
        setGooglePicking(false);
        running = false;
      }
    };

    // 初回
    void resumePending();

    const onPageShow = () => void resumePending();
    const onFocus = () => void resumePending();
    const onVis = () => {
      if (document.visibilityState === "visible") void resumePending();
    };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const formatHttpError = async (res: Response) => {
    let body = "";
    try {
      body = (await res.text()).trim();
    } catch {
      body = "";
    }
    const snippet = body.length > 600 ? body.slice(0, 600) + "…" : body;
    return `status=${res.status} ${res.statusText}${snippet ? ` body=${snippet}` : ""}`;
  };

  const parseDurationMs = (d?: string) => {
    if (!d) return null;
    const m = /^(\d+(?:\.\d+)?)s$/.exec(d);
    if (!m) return null;
    return Math.max(0, Math.round(Number(m[1]) * 1000));
  };

  async function createGooglePhotosPickerSession(accessToken: string) {
    // 以後はサーバ（NextAuth の Google トークン）経由でセッション作成する
    const createRes = await fetch("/api/google-photos/picker/session", { method: "POST" });
    if (!createRes.ok) {
      let message = `Google Photos Picker の開始に失敗しました（${await formatHttpError(createRes)}）`;
      try {
        const j = (await createRes.json()) as { message?: string };
        if (j?.message) message = j.message;
      } catch {
        // noop
      }
      throw new Error(message);
    }
    const session = (await createRes.json()) as { sessionId: string; pickerUri: string; pollingConfig?: { pollInterval?: string; timeoutIn?: string } };
    const rawPickerUri = String(session.pickerUri ?? "").trim();
    if (!rawPickerUri.startsWith("http")) {
      throw new Error(`Google Photos Picker のURLが不正です: ${rawPickerUri || "（空）"}`);
    }
    const pickerUri = rawPickerUri.replace(/\/$/, "");
    return { id: session.sessionId, pickerUri, pollingConfig: session.pollingConfig };
  }

  async function pollAndFetchPickedItem(accessToken: string, session: { id: string; pollingConfig?: { pollInterval?: string; timeoutIn?: string } }) {
    const startedAt = Date.now();
    let pollIntervalMs = parseDurationMs(session.pollingConfig?.pollInterval) ?? 1200;
    let timeoutMs = parseDurationMs(session.pollingConfig?.timeoutIn) ?? 90_000;

    while (true) {
      const pollRes = await fetch(`/api/google-photos/picker/session?sessionId=${encodeURIComponent(session.id)}`);
      if (!pollRes.ok) throw new Error(`Google Photos Picker の状態取得に失敗しました（${await formatHttpError(pollRes)}）`);
      const polled = (await pollRes.json()) as { mediaItemsSet?: boolean; pollingConfig?: { pollInterval?: string; timeoutIn?: string } };
      const nextInterval = parseDurationMs(polled.pollingConfig?.pollInterval);
      const nextTimeout = parseDurationMs(polled.pollingConfig?.timeoutIn);
      if (nextInterval != null) pollIntervalMs = nextInterval;
      if (nextTimeout != null) timeoutMs = nextTimeout;

      if (polled.mediaItemsSet) break;
      if (Date.now() - startedAt > timeoutMs) throw new Error("Google Photos Picker がタイムアウトしました。");
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    const listRes = await fetch(`/api/google-photos/picker/media?sessionId=${encodeURIComponent(session.id)}`);
    if (!listRes.ok) throw new Error(`選択した画像の取得に失敗しました（${await formatHttpError(listRes)}）`);
    const list = (await listRes.json()) as { baseUrl: string; mimeType: string; fileName: string };
    const baseUrl = list.baseUrl ?? "";
    const mimeType = list.mimeType ?? "image/jpeg";
    const fileName = list.fileName ?? "google-photos.jpg";
    if (!baseUrl) throw new Error("選択した画像のURLが取得できませんでした。");

    // 画像は選択直後にプレビューできるよう baseUrl を直接使う（適用時のダウンロードはサーバ側で行う）
    // baseUrl はそのままだと巨大な場合があるため、軽いサイズを指定
    // Pickerが返すURLはそのままだとブラウザ直アクセスで見れない場合があるので、
    // NextAuthのトークンを使うサーバ経由でプレビューする
    setGooglePreviewUrl(`/api/google-photos/image?baseUrl=${encodeURIComponent(baseUrl)}&w=512&h=512`);
    setGooglePicked({ accessToken: "", baseUrl, fileName, mimeType });
    setImageDraftFile(null);
    setImageDraftUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function runGooglePhotosPickerInNewTab(accessToken: string) {
    setGooglePickerError(null);
    const session = await createGooglePhotosPickerSession(accessToken);
    const pickerUri = session.pickerUri.replace(/\/$/, "") + "/autoclose";
    setGooglePickerUi({ pickerUri });
    clearPendingSession();
    try {
      window.open(pickerUri, "_blank");
    } catch {
      // popup ブロック環境でも、モーダル内のリンクから開ける
    }
    await pollAndFetchPickedItem(accessToken, session);
  }

  async function runGooglePhotosPickerInThisTab(accessToken: string) {
    setGooglePickerError(null);
    const session = await createGooglePhotosPickerSession(accessToken);
    const pickerUri = session.pickerUri.replace(/\/$/, "");
    // このタブ遷移の場合はアプリ側の JS が止まるので、復帰後に再開できるよう保存してから遷移
    setPendingSession(session.id, pickerUri);
    setGooglePickerUi({ pickerUri });
    window.location.href = pickerUri;
    // 遷移するのでここには戻らない想定
    throw new Error("navigating");
  }

  async function pickFromGooglePhotos() {
    if (googlePicking) return;
    setGooglePicking(true);
    setGooglePickerError(null);
    const forceRedirect = sessionStorage.getItem("gphotos_force_redirect") === "1";
    try {
      let accessToken: string;
      const cached = getCachedAccessToken();
      if (cached) {
        await runGooglePhotosPickerInNewTab(cached);
        return;
      }
      if (forceRedirect) {
        await requestGoogleAccessTokenViaRedirect();
      }
      try {
        accessToken = await requestGoogleAccessToken();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        // ポップアップが開けない/閉じられた場合は redirect UX に切替（以後は固定）
        if (msg.includes("gis_error:popup_failed_to_open") || msg.includes("gis_error:popup_closed") || msg.includes("gis_error:")) {
          sessionStorage.setItem("gphotos_force_redirect", "1");
          await requestGoogleAccessTokenViaRedirect();
        }
        throw e;
      }
      await runGooglePhotosPickerInNewTab(accessToken);
    } catch (e) {
      setGooglePickerError(e instanceof Error ? e.message : "Googleフォトの起動に失敗しました。");
      throw e;
    } finally {
      setGooglePickerUi(null);
      setGooglePicking(false);
    }
  }

  return (
    <>
      {googlePickerUi ? (
        <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setGooglePickerUi(null);
              setGooglePicking(false);
            }}
          />
          <div className="relative w-full max-w-lg rounded-t-3xl border border-black/10 bg-white p-5 shadow-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-semibold text-neutral-950">Googleフォトで画像を選択</div>
                <div className="mt-1 text-sm text-black/60">
                  Google 側はセキュリティ上、ページをこの画面内に埋め込めないため、別タブで開きます。
                </div>
              </div>
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-full text-black/60 hover:bg-black/[0.06] hover:text-black"
                aria-label="閉じる"
                title="閉じる"
                onClick={() => {
                  setGooglePickerUi(null);
                  setGooglePicking(false);
                }}
              >
                <IconX className="size-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {googlePickerError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <div className="font-medium">Google連携の再認可が必要です</div>
                  <div className="mt-1 text-xs text-red-700">{googlePickerError}</div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700"
                      onClick={() => {
                        // refresh_token を得るため、offline + consent を明示して Google 再認可へ
                        void signIn(
                          "google",
                          { callbackUrl: "/settings" },
                          { prompt: "consent", access_type: "offline", include_granted_scopes: "true" },
                        );
                      }}
                    >
                      Googleで再ログイン（権限更新）
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-800 hover:bg-red-50"
                      onClick={() => setGooglePickerError(null)}
                    >
                      いったん閉じる
                    </button>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-black/90"
                onClick={() => window.open(googlePickerUi.pickerUri, "_blank")}
              >
                別タブで開く（推奨）
              </button>
              <button
                type="button"
                className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                onClick={async () => {
                  try {
                    const token = getCachedAccessToken() ?? (await requestGoogleAccessToken());
                    await runGooglePhotosPickerInThisTab(token);
                  } catch (e) {
                    setGooglePickerError(e instanceof Error ? e.message : "Googleフォトの起動に失敗しました。");
                  }
                }}
              >
                このタブで開く（戻ってきたら自動反映）
              </button>
              <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-xs text-black/60">
                別タブで選択して「完了」すると、この画面が自動で更新されます（このモーダルは開いたままにしてください）。
              </div>
              <div className="rounded-xl border border-black/10 bg-white p-3">
                <div className="text-xs font-medium text-black/60">開くURL</div>
                <div className="mt-1 break-all font-mono text-[11px] text-black/70">{googlePickerUi.pickerUri}</div>
              </div>
              <button
                type="button"
                className="w-full rounded-xl border border-black/15 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                onClick={() => {
                  setGooglePickerUi(null);
                  setGooglePicking(false);
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setInviteUrl(null);
          setCopyDone(false);
        }}
        className="flex w-full items-center gap-4 rounded-2xl border border-black/10 bg-white p-4 text-left shadow-sm transition hover:bg-black/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
      >
        <Avatar name={user.name} email={user.email} image={user.image} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-neutral-950">{displayName}</div>
          <div className="truncate text-sm text-black/55">{household.name}</div>
          <div className="mt-1 text-xs text-black/45">タップしてプロフィール・共有・招待</div>
        </div>
        <span className="shrink-0 text-black/35" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" className="size-5">
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label="閉じる"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-black/10 bg-white shadow-lg sm:rounded-3xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-user-dialog-title"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-black/10 bg-white px-5 py-4">
              <h2 id="settings-user-dialog-title" className="text-lg font-semibold text-neutral-950">
                アカウントと家計簿
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-black/60 hover:bg-black/[0.05] hover:text-black"
              >
                閉じる
              </button>
            </div>

            <div className="app-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingImage(true);
                    setEditingName(false);
                  }}
                  className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                  aria-label="アイコン画像を変更"
                  title="アイコン画像を変更"
                >
                  <Avatar name={user.name} email={user.email} image={user.image} size="lg" />
                </button>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingName(true);
                      setEditingImage(false);
                    }}
                    className="block w-full truncate text-left font-medium text-neutral-900 underline decoration-black/20 underline-offset-4"
                    aria-label="表示名を編集"
                    title="表示名を編集"
                  >
                    {displayName}
                  </button>
                  <div className="truncate text-sm text-black/55">{user.email ?? "—"}</div>
                  <div className="text-xs text-black/45">あなたの権限: {roleLabel(membershipRole)}</div>
                </div>
              </div>

              {editingName ? (
                <section className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-4">
                  <h3 className="text-sm font-medium text-neutral-900">表示名を編集</h3>
                  <form action={updateProfileDisplayName} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <input
                      name="displayName"
                      defaultValue={user.name ?? ""}
                      placeholder="未設定の場合はメールを表示します"
                      className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-neutral-900 outline-none focus:border-black/40"
                      maxLength={80}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingName(false)}
                        className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                      >
                        キャンセル
                      </button>
                      <button type="submit" className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">
                        保存
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}

              {editingImage ? (
                <section className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-neutral-900">アイコン画像を変更</h3>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingImage(false);
                        setImageDraftFile(null);
                        setImageDraftUrl(null);
                        setGooglePicked(null);
                        setGooglePreviewUrl(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="inline-flex size-8 items-center justify-center rounded-full text-black/60 hover:bg-black/[0.06] hover:text-black"
                      aria-label="閉じる"
                      title="閉じる"
                    >
                      <IconX className="size-4" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} email={user.email} image={imagePreviewSrc ?? null} size="lg" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-black/60">プレビュー（サンプル）</div>
                        <div className="text-[11px] text-black/45">選択した画像が、この家計簿内でのみ表示されます（最大5MB）。</div>
                      </div>
                    </div>
                  </div>

                  <form ref={uploadFormRef} action={uploadProfileImage} className="flex flex-col gap-2 sm:flex-row">
                    <input
                      ref={fileInputRef}
                      name="file"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setImageDraftFile(f);
                        if (f) setImageDraftUrl(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                    >
                      <svg viewBox="0 0 24 24" fill="none" className="size-5 text-black/70" aria-hidden>
                        <path
                          d="M12 16v-8m0 0 3 3m-3-3-3 3M6 16.5a3.5 3.5 0 0 1 0-7h.6A5 5 0 0 1 16.5 7.5 4 4 0 0 1 18 15.2"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      画像を選択（ローカル）
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await pickFromGooglePhotos();
                        } catch (e) {
                          alert(e instanceof Error ? e.message : "Googleフォトの起動に失敗しました。");
                        }
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                      aria-label="GoogleフォトのURLから選択"
                      title="GoogleフォトのURLから選択"
                      disabled={googlePicking}
                    >
                      <img src="/image.png" alt="" className="size-5" />
                      {googlePicking ? "起動中…" : "Googleフォト"}
                    </button>
                  </form>

                  <div className="rounded-xl border border-black/10 bg-white p-3">
                    <div className="text-xs font-medium text-black/60">選択中の画像</div>
                    <div className="mt-2 flex items-start gap-3">
                      <button
                        type="button"
                        className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                        title="クリックしてサイズ・位置を調整"
                        aria-label="画像を調整"
                        onClick={() => {
                          setCropError(null);
                          setCropZoom(1.2);
                          setCropOffset({ x: 0, y: 0 });
                          setCropOpen(true);
                        }}
                      >
                        <img
                          src={imagePreviewSrc ?? ""}
                          alt=""
                          className="size-24 rounded-2xl border border-black/10 object-cover bg-black/[0.02]"
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-neutral-900">
                          {googlePicked
                            ? `Googleフォト: ${googlePicked.fileName}`
                            : imageDraftFile
                              ? imageDraftFile.name
                              : imageDraftUrl
                                ? "URLから選択"
                                : "現在の画像"}
                        </div>
                        <div className="mt-1 text-[11px] text-black/45">
                          {imageDraftFile ? `ファイルサイズ: ${Math.round(imageDraftFile.size / 1024)}KB` : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setImageDraftFile(null);
                              setImageDraftUrl(null);
                              setGooglePicked(null);
                              setGooglePreviewUrl(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-black/[0.03]"
                          >
                            選択をクリア
                          </button>
                          <button
                            type="button"
                            disabled={!googlePicked && !imageDraftFile && !((imageDraftUrl ?? "").trim())}
                            onClick={() => {
                              if (googlePicked) {
                                googleFormRef.current?.requestSubmit();
                              } else if (imageDraftFile) {
                                uploadFormRef.current?.requestSubmit();
                              } else if ((imageDraftUrl ?? "").trim()) {
                                urlFormRef.current?.requestSubmit();
                              }
                            }}
                            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/90 disabled:opacity-40"
                          >
                            アップロードして適用
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <form ref={urlFormRef} action={updateProfileImage} className="hidden">
                    <input type="hidden" name="imageUrl" value={(imageDraftUrl ?? "").trim()} />
                  </form>
                  <form ref={googleFormRef} action={uploadProfileImageFromGooglePhotos} className="hidden">
                    <input type="hidden" name="accessToken" value={googlePicked?.accessToken ?? ""} />
                    <input type="hidden" name="baseUrl" value={googlePicked?.baseUrl ?? ""} />
                    <input type="hidden" name="fileName" value={googlePicked?.fileName ?? ""} />
                    <input type="hidden" name="mimeType" value={googlePicked?.mimeType ?? ""} />
                  </form>
                </section>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-medium text-neutral-900">家計簿のレイヤー</h3>
                <p className="text-xs text-black/45">
                  レイヤーで明細・レシート・取込を分けられます。一覧や入力の対象は「作業中のレイヤー」です（切り替え後にダッシュボード等が更新されます）。
                </p>
                <form action={setPreferredLayerFromForm} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <select
                    name="preferredLayerId"
                    defaultValue={activeLayerId}
                    className="min-w-0 flex-1 rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-neutral-900"
                  >
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
                  >
                    作業レイヤーを切り替え
                  </button>
                </form>
                {isOwner ? (
                  <div className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-2">
                    <form action={createHouseholdLayer} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input
                        name="layerName"
                        placeholder="新しいレイヤー名"
                        required
                        maxLength={40}
                        className="min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-xs text-neutral-900"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-lg border border-black/15 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 hover:bg-black/[0.03]"
                      >
                        レイヤーを追加
                      </button>
                    </form>
                    <ul className="space-y-1.5">
                      {layers.map((l) => (
                        <li
                          key={l.id}
                          className="flex flex-col gap-2 rounded-lg border border-black/10 bg-white p-1.5 sm:flex-row sm:items-end"
                        >
                          <form action={renameHouseholdLayer} className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                            <input type="hidden" name="layerId" value={l.id} />
                            <input
                              name="layerName"
                              defaultValue={l.name}
                              maxLength={40}
                              required
                              className="min-w-0 flex-1 rounded-lg border border-black/15 bg-white px-2 py-1.5 text-xs"
                            />
                            <button
                              type="submit"
                              className="shrink-0 rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-black/90"
                            >
                              名前を保存
                            </button>
                          </form>
                          {layers.length > 1 ? (
                            <form action={deleteHouseholdLayer} className="shrink-0">
                              <input type="hidden" name="layerId" value={l.id} />
                              <button
                                type="submit"
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
                              >
                                削除
                              </button>
                            </form>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-black/45">
                      削除は、そのレイヤーに明細・レシート・定期登録がない場合のみ可能です。
                    </p>
                  </div>
                ) : null}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-medium text-neutral-900">メンバー</h3>
                <ul className="divide-y divide-black/10 rounded-xl border border-black/10">
                  {members.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                      <Avatar name={m.name} email={m.email} image={m.image} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-neutral-900">
                          {(m.name ?? "").trim() || m.email || "（名称未設定）"}
                        </div>
                        <div className="truncate text-xs text-black/50">{m.email}</div>
                      </div>
                      {isOwner && m.role !== "owner" ? (
                        <div className="flex items-center gap-2">
                          <form action={updateMemberRole} className="flex items-center gap-2">
                            <input type="hidden" name="userId" value={m.id} />
                            <select
                              name="role"
                              defaultValue={m.role}
                              className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-xs"
                            >
                              <option value="editor">編集者</option>
                              <option value="viewer">閲覧</option>
                            </select>
                            <button
                              type="submit"
                              className="rounded-lg bg-black px-2.5 py-1.5 text-xs font-medium text-white hover:bg-black/90"
                            >
                              保存
                            </button>
                          </form>
                          <form action={removeMember}>
                            <input type="hidden" name="userId" value={m.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
                            >
                              削除
                            </button>
                          </form>
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-black/[0.06] px-2 py-0.5 text-xs font-medium text-black/70">
                          {roleLabel(m.role)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              {isOwner ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-medium text-neutral-900">承認待ち</h3>
                  {joinRequests.length ? (
                    <ul className="space-y-2">
                      {joinRequests.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white p-2">
                          <Avatar name={r.user.name} email={r.user.email} image={r.user.image} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-neutral-900">
                              {(r.user.name ?? "").trim() || r.user.email || "（名称未設定）"}
                            </div>
                            <div className="truncate text-xs text-black/55">{r.user.email}</div>
                            <div className="text-[11px] text-black/45">希望権限: {roleLabel(r.requestedRole)}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <form action={approveJoinRequest}>
                              <input type="hidden" name="requestId" value={r.id} />
                              <button
                                type="submit"
                                aria-label="承認"
                                title="承認"
                                className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                <IconCheck className="size-5" />
                              </button>
                            </form>
                            <form action={rejectJoinRequest}>
                              <input type="hidden" name="requestId" value={r.id} />
                              <button
                                type="submit"
                                aria-label="却下"
                                title="却下"
                                className="inline-flex size-9 items-center justify-center rounded-xl bg-red-600 text-white hover:bg-red-700"
                              >
                                <IconX className="size-5" />
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-black/60">
                      承認待ちの申請はありません。
                    </div>
                  )}
                </section>
              ) : null}

              {isOwner ? (
                <section className="space-y-3 rounded-xl border border-black/10 bg-black/[0.02] p-4">
                  <h3 className="text-sm font-medium text-neutral-900">招待リンク</h3>
                  <p className="text-xs text-black/55">
                    有効期限は7日間です。相手がログイン後、「参加を申請する」を押すと申請が作成され、オーナーが承認すると参加できます。
                    オーナー権限の付与はできません。
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-medium text-black/60">参加時の権限</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as MembershipRole)}
                      className="rounded-lg border border-black/15 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="editor">編集者</option>
                      <option value="viewer">閲覧</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={inviteBusy}
                      onClick={async () => {
                        setInviteBusy(true);
                        setCopyDone(false);
                        try {
                          const url = await createHouseholdInviteLink(inviteRole);
                          setInviteUrl(url);
                        } finally {
                          setInviteBusy(false);
                        }
                      }}
                      className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-black/[0.03] disabled:opacity-50"
                    >
                      {inviteBusy ? "発行中…" : "招待リンクを発行"}
                    </button>
                    {inviteUrl ? (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(inviteUrl);
                          setCopyDone(true);
                        }}
                        className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
                      >
                        {copyDone ? "コピーしました" : "リンクをコピー"}
                      </button>
                    ) : null}
                  </div>
                  {inviteUrl ? (
                    <div className="break-all rounded-lg border border-black/10 bg-white px-3 py-2 font-mono text-xs text-neutral-800">
                      {inviteUrl}
                    </div>
                  ) : null}

                  {invites.length ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowIssuedInvites((v) => !v)}
                        className="text-left text-xs font-medium text-black/60 underline underline-offset-2"
                      >
                        {showIssuedInvites ? "発行済みリンク（有効）を隠す" : `発行済みリンク（有効）を表示（${invites.length}）`}
                      </button>
                      <form action={revokeAllHouseholdInvites}>
                        <button
                          type="submit"
                          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
                        >
                          招待リンクを一括無効化
                        </button>
                      </form>
                      {showIssuedInvites ? (
                        <>
                          <ul className="space-y-2">
                            {invites.map((inv) => (
                              <li
                                key={inv.id}
                                className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-2 sm:flex-row sm:items-center"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-neutral-900">権限: {roleLabel(inv.role)}</div>
                                  <div className="text-[11px] text-black/55">
                                    期限: {new Date(inv.expiresAt).toLocaleString("ja-JP")}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const base = window.location.origin.replace(/\/$/, "");
                                      const url = `${base}/join?invite=${encodeURIComponent(inv.token)}`;
                                      await navigator.clipboard.writeText(url);
                                    }}
                                    className="rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-900 hover:bg-black/[0.03]"
                                  >
                                    リンクをコピー
                                  </button>
                                  <form action={revokeHouseholdInvite}>
                                    <input type="hidden" name="inviteId" value={inv.id} />
                                    <button
                                      type="submit"
                                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100"
                                    >
                                      無効化
                                    </button>
                                  </form>
                                </div>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-black/45">リンクが流出した場合は「無効化」してください。</p>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {cropOpen && portalReady
        ? createPortal(
            <div className="fixed inset-0 z-[120] flex items-end justify-center p-3 sm:items-center sm:p-6">
              <div
                className="fixed inset-0 bg-black/50"
                role="button"
                aria-label="閉じる"
                tabIndex={-1}
                onClick={() => setCropOpen(false)}
              />
              <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-black/10 bg-white shadow-lg">
                <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-neutral-950">画像を調整</div>
                    <div className="mt-1 text-sm text-black/60">ドラッグで位置、スライダーで拡大縮小できます。</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex size-9 items-center justify-center rounded-full text-black/60 hover:bg-black/[0.06] hover:text-black"
                    aria-label="閉じる"
                    title="閉じる"
                    onClick={() => setCropOpen(false)}
                  >
                    <IconX className="size-4" />
                  </button>
                </div>
                <div className="app-scrollbar max-h-[80dvh] space-y-3 overflow-y-auto px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-neutral-900">プレビュー</div>
                <div className="mt-0.5 text-xs text-black/50">円の中が最終的なアイコンになります。</div>
              </div>
            </div>

            {cropError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{cropError}</div>
            ) : null}

            <div className="flex items-center justify-center">
              <div
                className="relative size-[260px] overflow-hidden rounded-full border border-black/10 bg-black/[0.02]"
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                  cropPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                  if (cropPointersRef.current.size === 2) {
                    const pts = Array.from(cropPointersRef.current.values());
                    const dx = pts[0]!.x - pts[1]!.x;
                    const dy = pts[0]!.y - pts[1]!.y;
                    cropPinchRef.current = { startDist: Math.hypot(dx, dy), startZoom: cropZoom };
                  } else {
                  cropDragRef.current = { sx: e.clientX, sy: e.clientY, ox: cropOffset.x, oy: cropOffset.y };
                  }
                }}
                onPointerMove={(e) => {
                  if (cropPointersRef.current.has(e.pointerId)) {
                    cropPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
                  }
                  // 2点ならピンチズーム（タッチ操作）
                  if (cropPointersRef.current.size === 2 && cropPinchRef.current) {
                    const pts = Array.from(cropPointersRef.current.values());
                    const dx = pts[0]!.x - pts[1]!.x;
                    const dy = pts[0]!.y - pts[1]!.y;
                    const dist = Math.hypot(dx, dy);
                    const ratio = cropPinchRef.current.startDist > 0 ? dist / cropPinchRef.current.startDist : 1;
                    const next = Math.max(1, Math.min(3, cropPinchRef.current.startZoom * ratio));
                    setCropZoom(next);
                    return;
                  }
                  const d = cropDragRef.current;
                  if (!d) return;
                  setCropOffset({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) });
                }}
                onPointerUp={() => {
                  cropDragRef.current = null;
                  cropPinchRef.current = null;
                  cropPointersRef.current.clear();
                }}
                onPointerCancel={() => {
                  cropDragRef.current = null;
                  cropPinchRef.current = null;
                  cropPointersRef.current.clear();
                }}
                onWheel={(e) => {
                  // トラックパッド/マウスホイールでズーム（画面操作）
                  e.preventDefault();
                  const delta = e.deltaY;
                  // 速すぎないように緩める
                  const factor = Math.exp(-delta * 0.0015);
                  setCropZoom((z) => Math.max(1, Math.min(3, z * factor)));
                }}
                style={{ touchAction: "none" }}
              >
                <img
                  src={imagePreviewSrc ?? ""}
                  alt=""
                  className="h-full w-full select-none object-cover"
                  draggable={false}
                  style={{
                    transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropZoom})`,
                    transformOrigin: "center",
                  }}
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-black/60">拡大</div>
                <div className="text-xs tabular-nums text-black/45">{Math.round(cropZoom * 100)}%</div>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                onClick={() => {
                  setCropZoom(1.2);
                  setCropOffset({ x: 0, y: 0 });
                }}
              >
                リセット
              </button>
              <button
                type="button"
                disabled={cropBusy}
                className="ml-auto rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90 disabled:opacity-40"
                onClick={() => void cropApply()}
              >
                この切り抜きで適用
              </button>
            </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
