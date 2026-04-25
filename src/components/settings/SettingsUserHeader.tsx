"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
} from "@/app/(app)/settings/actions";

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
  const [imageDraftObjectUrl, setImageDraftObjectUrl] = useState<string | null>(null);
  const [googlePicked, setGooglePicked] = useState<{
    accessToken: string;
    baseUrl: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [googlePreviewUrl, setGooglePreviewUrl] = useState<string | null>(null);
  const [googlePicking, setGooglePicking] = useState(false);
  const uploadFormRef = useRef<HTMLFormElement | null>(null);
  const urlFormRef = useRef<HTMLFormElement | null>(null);
  const googleFormRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inviteRole, setInviteRole] = useState<MembershipRole>("editor");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [showIssuedInvites, setShowIssuedInvites] = useState(false);
  const isOwner = membershipRole === "owner";

  const displayName = (user.name ?? "").trim() || user.email || "ユーザー";

  useEffect(() => {
    if (!imageDraftFile) {
      setImageDraftObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageDraftFile);
    setImageDraftObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageDraftFile]);

  useEffect(() => {
    if (!googlePreviewUrl) return;
    return () => URL.revokeObjectURL(googlePreviewUrl);
  }, [googlePreviewUrl]);

  const imagePreviewSrc = useMemo(() => {
    if (googlePreviewUrl) return googlePreviewUrl;
    if (imageDraftObjectUrl) return imageDraftObjectUrl;
    if ((imageDraftUrl ?? "").trim()) return (imageDraftUrl ?? "").trim();
    return user.image;
  }, [googlePreviewUrl, imageDraftObjectUrl, imageDraftUrl, user.image]);

  async function ensureGisLoaded() {
    if (typeof window === "undefined") return;
    if ((window as any).google?.accounts?.oauth2) return;
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

  async function requestGoogleAccessToken(): Promise<string> {
    await ensureGisLoaded();
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID が設定されていません。");

    return await new Promise<string>((resolve, reject) => {
      const google = (window as any).google;
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
        callback: (resp: any) => {
          if (!resp?.access_token) reject(new Error("Googleの認証に失敗しました。"));
          else resolve(resp.access_token as string);
        },
        error_callback: () => reject(new Error("Googleの認証に失敗しました。")),
      });
      tokenClient.requestAccessToken({ prompt: "" });
    });
  }

  async function pickFromGooglePhotos() {
    if (googlePicking) return;
    setGooglePicking(true);
    try {
      const accessToken = await requestGoogleAccessToken();
      const createRes = await fetch("https://photospicker.googleapis.com/v1/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pickingConfig: {
            maxMediaItems: 1,
          },
        }),
      });
      if (!createRes.ok) throw new Error("Google Photos Picker の開始に失敗しました。");
      const session = (await createRes.json()) as {
        id: string;
        pickerUri: string;
        pollingConfig?: { pollInterval?: string; timeoutIn?: string };
      };
      const pickerUri = `${session.pickerUri}/autoclose`;
      window.open(pickerUri, "_blank", "noopener,noreferrer");

      const startedAt = Date.now();
      let pollIntervalMs = 1200;
      let timeoutMs = 90_000;

      const parseDurationMs = (d?: string) => {
        if (!d) return null;
        const m = /^(\d+(?:\.\d+)?)s$/.exec(d);
        if (!m) return null;
        return Math.max(0, Math.round(Number(m[1]) * 1000));
      };

      while (true) {
        const pollRes = await fetch(`https://photospicker.googleapis.com/v1/sessions/${encodeURIComponent(session.id)}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!pollRes.ok) throw new Error("Google Photos Picker の状態取得に失敗しました。");
        const polled = (await pollRes.json()) as {
          id: string;
          mediaItemsSet?: boolean;
          pollingConfig?: { pollInterval?: string; timeoutIn?: string };
        };
        const nextInterval = parseDurationMs(polled.pollingConfig?.pollInterval);
        const nextTimeout = parseDurationMs(polled.pollingConfig?.timeoutIn);
        if (nextInterval != null) pollIntervalMs = nextInterval;
        if (nextTimeout != null) timeoutMs = nextTimeout;

        if (polled.mediaItemsSet) break;
        if (Date.now() - startedAt > timeoutMs) throw new Error("Google Photos Picker がタイムアウトしました。");
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }

      const listRes = await fetch(`https://photospicker.googleapis.com/v1/mediaItems?sessionId=${encodeURIComponent(session.id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!listRes.ok) throw new Error("選択した画像の取得に失敗しました。");
      const list = (await listRes.json()) as {
        mediaItems?: { id: string; mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string } }[];
      };
      const first = list.mediaItems?.[0]?.mediaFile;
      const baseUrl = first?.baseUrl ?? "";
      const mimeType = first?.mimeType ?? "image/jpeg";
      const fileName = first?.filename ?? "google-photos.jpg";
      if (!baseUrl) throw new Error("選択した画像のURLが取得できませんでした。");

      // プレビュー用に縮小画像をクライアントで取得（Authorization 必須のため）
      const previewRes = await fetch(`${baseUrl}=w256-h256-c`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (previewRes.ok) {
        const blob = await previewRes.blob();
        setGooglePreviewUrl(URL.createObjectURL(blob));
      } else {
        setGooglePreviewUrl(null);
      }

      setGooglePicked({ accessToken, baseUrl, fileName, mimeType });
      setImageDraftFile(null);
      setImageDraftUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setGooglePicking(false);
    }
  }

  return (
    <>
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
            className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-black/10 bg-white shadow-lg sm:rounded-3xl"
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

            <div className="space-y-6 px-5 py-5">
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
                  <h3 className="text-sm font-medium text-neutral-900">アイコン画像を変更</h3>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.name} email={user.email} image={imagePreviewSrc ?? null} size="lg" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-black/60">プレビュー（サンプル）</div>
                        <div className="text-[11px] text-black/45">選択した画像が、この家計簿内でのみ表示されます（最大5MB）。</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingImage(false);
                        setImageDraftFile(null);
                        setImageDraftUrl(null);
                      }}
                      className="shrink-0 rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium text-neutral-900 hover:bg-black/[0.03]"
                    >
                      閉じる
                    </button>
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
                        } catch {
                          // UI上は黙って戻す（既存フォーム送信と同様、詳細は必要なら後でトースト化）
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
                      <img
                        src={imagePreviewSrc ?? ""}
                        alt=""
                        className="size-24 rounded-2xl border border-black/10 object-cover bg-black/[0.02]"
                      />
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
    </>
  );
}
