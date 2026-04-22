"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Tx = { id: string; purchaseDate: string; createdAt: string; type: string; totalAmount: number; memo: string | null };
type Group = { key: string; label?: string; ignoreKey: string; count: number; txs: Tx[] };

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function toYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pickKeepFromTxs(txs: Tx[]): Tx {
  const sorted = [...txs].sort((a, b) => {
    const am = (a.memo ?? "").trim().length;
    const bm = (b.memo ?? "").trim().length;
    if (am !== bm) return bm - am;
    if (a.purchaseDate !== b.purchaseDate) return a.purchaseDate.localeCompare(b.purchaseDate);
    return a.createdAt.localeCompare(b.createdAt);
  });
  return sorted[0];
}

/** 同一グループで全件が削除対象になった場合は必ず1件を残す（手動全選択の取り違え防止）。 */
function computeSafeDeleteIds(selectedIds: string[], groups: Group[]): { deleteIds: string[]; keepIds: string[] } {
  const sel = new Set(selectedIds);
  const keepIds: string[] = [];
  for (const g of groups) {
    if (g.txs.length < 2) continue;
    const allInGroup = g.txs.every((t) => sel.has(t.id));
    if (allInGroup) {
      const keep = pickKeepFromTxs(g.txs);
      keepIds.push(keep.id);
      sel.delete(keep.id);
    }
  }
  return { deleteIds: [...sel], keepIds };
}

async function readJsonSafe(res: Response): Promise<{ ok: boolean; json: any; text: string }> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  if (!text) return { ok: res.ok, json: null, text: "" };
  if (ct.includes("application/json")) {
    try {
      return { ok: res.ok, json: JSON.parse(text), text };
    } catch {
      return { ok: res.ok, json: null, text };
    }
  }
  // HTML or plain text (e.g. error pages)
  try {
    return { ok: res.ok, json: JSON.parse(text), text };
  } catch {
    return { ok: res.ok, json: null, text };
  }
}

export function DuplicatesClient() {
  const [matchAmount, setMatchAmount] = useState(true);
  const [matchDatetime, setMatchDatetime] = useState(true);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string>("");

  const [selectedTx, setSelectedTx] = useState<Record<string, boolean>>({});
  const [selectedIgnore, setSelectedIgnore] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [pendingKeepId, setPendingKeepId] = useState<string>("");
  const [pendingKeepIds, setPendingKeepIds] = useState<string[]>([]);
  const [pendingDeletePreview, setPendingDeletePreview] = useState<Tx[]>([]);
  const [autoOpenFor, setAutoOpenFor] = useState<Group | null>(null);
  const [autoProgress, setAutoProgress] = useState(0); // 0-100
  const [autoPhase, setAutoPhase] = useState<"idle" | "rules" | "ai" | "ready">("idle");
  const [autoUsedAi, setAutoUsedAi] = useState(false);
  const [autoReason, setAutoReason] = useState<string>("");

  const selectedTxIds = useMemo(() => Object.entries(selectedTx).filter(([, v]) => v).map(([k]) => k), [selectedTx]);
  const selectedIgnoreKeys = useMemo(
    () => Object.entries(selectedIgnore).filter(([, v]) => v).map(([k]) => k),
    [selectedIgnore],
  );

  const mode = useMemo<"amount" | "datetime" | "both">(() => {
    if (matchAmount && matchDatetime) return "both";
    if (matchDatetime) return "datetime";
    return "amount";
  }, [matchAmount, matchDatetime]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/duplicates/groups?mode=${encodeURIComponent(mode)}&q=${encodeURIComponent(q)}&limit=30`,
        { cache: "no-store" },
      );
      const { json, text } = await readJsonSafe(res);
      if (!res.ok) throw new Error(String(json?.error ?? res.statusText ?? "取得に失敗しました。"));
      if (!json) throw new Error(text ? `不正なレスポンス: ${text.slice(0, 200)}` : "不正なレスポンスです。");
      setGroups((json.groups ?? []) as Group[]);
      setSelectedTx({});
      setSelectedIgnore({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [mode, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleAllTxInGroup = useCallback((g: Group, v: boolean) => {
    setSelectedTx((prev) => {
      const next = { ...prev };
      for (const t of g.txs) next[t.id] = v;
      return next;
    });
  }, []);

  const applyRuleBasedSelection = useCallback((g: Group) => {
    const keep = pickKeepFromTxs(g.txs);
    const delIds = g.txs.filter((t) => t.id !== keep.id).map((t) => t.id);
    setSelectedTx((prev) => {
      const next = { ...prev };
      for (const t of g.txs) next[t.id] = delIds.includes(t.id);
      return next;
    });
    setPendingDeleteIds(delIds);
    setPendingKeepId(keep.id);
    setPendingKeepIds([keep.id]);
    setPendingDeletePreview(g.txs.filter((t) => delIds.includes(t.id)));
    return { keepId: keep.id, deleteIds: delIds };
  }, []);

  const isTriviallyIdenticalGroup = useCallback((g: Group) => {
    if (g.txs.length < 2) return true;
    const base = g.txs[0];
    for (const t of g.txs.slice(1)) {
      if (t.purchaseDate !== base.purchaseDate) return false;
      if (t.type !== base.type) return false;
      if (t.totalAmount !== base.totalAmount) return false;
      if ((t.memo ?? "").trim() !== (base.memo ?? "").trim()) return false;
    }
    return true;
  }, []);

  const isUncertainByRules = useCallback((g: Group) => {
    // Heuristic: if multiple entries have similarly-informative memos, ask AI.
    const scored = g.txs
      .map((t) => ({
        id: t.id,
        memo: (t.memo ?? "").trim(),
        memoLen: (t.memo ?? "").trim().length,
      }))
      .sort((a, b) => b.memoLen - a.memoLen);
    const top = scored[0];
    const second = scored[1];
    if (!top || !second) return false;
    if (top.memoLen === 0) return false; // all empty-ish -> not uncertain
    // If top two are close and not identical memo text, it's uncertain
    if (Math.abs(top.memoLen - second.memoLen) <= 2 && top.memo !== second.memo) return true;
    // If many unique non-empty memos exist, it's more likely ambiguous
    const uniqueNonEmpty = new Set(scored.filter((s) => s.memoLen > 0).map((s) => s.memo)).size;
    if (uniqueNonEmpty >= 3) return true;
    return false;
  }, []);

  const ignoreSelected = useCallback(async () => {
    if (selectedIgnoreKeys.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/duplicates/ignore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ignoreKeys: selectedIgnoreKeys }),
      });
      const { json, text } = await readJsonSafe(res);
      if (!res.ok) throw new Error(String(json?.error ?? res.statusText ?? "保存に失敗しました。"));
      if (!json) throw new Error(text ? `不正なレスポンス: ${text.slice(0, 200)}` : "不正なレスポンスです。");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [load, selectedIgnoreKeys]);

  const deleteSelected = useCallback(async () => {
    const raw =
      pendingDeleteIds.length > 0 ? pendingDeleteIds : computeSafeDeleteIds(selectedTxIds, groups).deleteIds;
    const keepBlock = new Set(
      pendingKeepIds.length > 0 ? pendingKeepIds : pendingKeepId ? [pendingKeepId] : [],
    );
    const safeIds = raw.filter((id) => !keepBlock.has(id));
    if (safeIds.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/duplicates/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: safeIds }),
      });
      const { json, text } = await readJsonSafe(res);
      if (!res.ok) throw new Error(String(json?.error ?? res.statusText ?? "削除に失敗しました。"));
      if (!json) throw new Error(text ? `不正なレスポンス: ${text.slice(0, 200)}` : "不正なレスポンスです。");
      setConfirmOpen(false);
      setPendingDeleteIds([]);
      setPendingKeepId("");
      setPendingKeepIds([]);
      setPendingDeletePreview([]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [load, pendingDeleteIds, pendingKeepId, pendingKeepIds, selectedTxIds, groups]);

  const aiRecommendAndSelect = useCallback(
    async (
      g: Group,
    ): Promise<{
      keepId: string;
      reason: string;
      usedAi: boolean;
    }> => {
      if (isTriviallyIdenticalGroup(g)) {
        // AI不要。自動選択で十分。
        const r = applyRuleBasedSelection(g);
        return { keepId: r.keepId, reason: "内容が同一のため、ルールで確定しました。", usedAi: false };
      }
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/duplicates/recommend", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txs: g.txs }),
        });
        const { json, text } = await readJsonSafe(res);
        if (!res.ok) throw new Error(String(json?.error ?? res.statusText ?? "AI推薦に失敗しました。"));
        if (!json) throw new Error(text ? `不正なレスポンス: ${text.slice(0, 200)}` : "不正なレスポンスです。");
        const keepId = String(json.keepId ?? "");
        if (!keepId) throw new Error("keepId が取得できませんでした。");

        const delIds = g.txs.filter((t) => t.id !== keepId).map((t) => t.id);
        setSelectedTx((prev) => {
          const next = { ...prev };
          for (const t of g.txs) next[t.id] = t.id !== keepId;
          return next;
        });
        setPendingDeleteIds(delIds);
        setPendingKeepId(keepId);
        setPendingKeepIds([keepId]);
        setPendingDeletePreview(g.txs.filter((t) => delIds.includes(t.id)));
        return { keepId, reason: String(json.reason ?? ""), usedAi: true };
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [applyRuleBasedSelection, isTriviallyIdenticalGroup],
  );

  const startAutoDuplicateDelete = useCallback(
    async (g: Group) => {
      setAutoOpenFor(g);
      setAutoPhase("rules");
      setAutoProgress(0);
      setAutoUsedAi(false);
      setAutoReason("");
      setPendingKeepId("");
      setPendingKeepIds([]);
      setPendingDeletePreview([]);
      setError("");

      // Step 1: rules
      await new Promise((r) => setTimeout(r, 50));
      const ruleResult = applyRuleBasedSelection(g);
      setSelectedTx((prev) => {
        const next = { ...prev };
        for (const t of g.txs) next[t.id] = ruleResult.deleteIds.includes(t.id);
        return next;
      });
      setPendingDeleteIds(ruleResult.deleteIds);
      setPendingKeepId(ruleResult.keepId);
      setPendingDeletePreview(g.txs.filter((t) => ruleResult.deleteIds.includes(t.id)));
      setAutoProgress(55);

      // Step 2: AI only when needed
      const needsAi = !isTriviallyIdenticalGroup(g) && isUncertainByRules(g);
      if (!needsAi) {
        setAutoPhase("ready");
        setAutoProgress(100);
        setAutoUsedAi(false);
        setAutoReason("ルールで確定しました（AI不要）。");
        return;
      }

      setAutoPhase("ai");
      setAutoUsedAi(true);
      setAutoProgress(70);
      try {
        const rec = await aiRecommendAndSelect(g);
        // aiRecommendAndSelect already set pendingDeleteIds + selectedTx when usedAi.
        setAutoReason(rec.reason || "AIが残す1件を推薦しました。");
        setPendingKeepId(rec.keepId);
      } catch {
        // fallback: keep rule selection
        setAutoUsedAi(false);
        setAutoReason("AI推薦に失敗したため、ルール結果を採用しました。");
      } finally {
        setAutoPhase("ready");
        setAutoProgress(100);
      }
    },
    [aiRecommendAndSelect, applyRuleBasedSelection, isTriviallyIdenticalGroup, isUncertainByRules],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">重複チェック</h1>
        <div className="text-sm text-black/60">
          推奨: <span className="font-medium">日付・収支種別・金額・メモがすべて一致</span> する明細だけを同一グループにします（初期表示はこの厳密モード）。
          チェックを外すと緩い条件（金額のみ／日付のみ）も利用できます。
        </div>
      </div>

      <div className="max-w-3xl space-y-4 rounded-2xl border border-black/10 bg-white p-6">
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
          <div className="space-y-1">
            <div className="text-sm font-medium">検索</div>
            <input
              className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              placeholder="メモ / YYYY-MM-DD / 金額 など"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            <div className="mt-2 flex flex-wrap gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-black/20"
                  checked={matchAmount}
                  onChange={(e) => setMatchAmount(e.target.checked)}
                  disabled={loading}
                />
                <span className={matchAmount ? "font-medium text-black/80" : "text-black/70"}>金額が同じ</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 rounded border-black/20"
                  checked={matchDatetime}
                  onChange={(e) => setMatchDatetime(e.target.checked)}
                  disabled={loading}
                />
                <span className={matchDatetime ? "font-medium text-black/80" : "text-black/70"}>日時が同じ</span>
              </label>
              <div className="text-xs text-black/50">
                {mode === "both"
                  ? "両方ON: 日付・種別・金額・メモが一致する重複のみ"
                  : "片方だけON: 金額または日付だけが一致する候補（メモが違う取引が混ざることがあります）"}
              </div>
            </div>
          </div>
          <div className="flex items-end">
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-50"
                onClick={load}
                disabled={loading}
              >
                {loading ? "更新中…" : "更新"}
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={async () => {
                  // 一括: 表示中グループを上から順に処理（ルール→必要ならAI）
                  if (groups.length === 0) return;
                  // まず最初のグループから処理（長時間になるため段階的に実行）
                  await startAutoDuplicateDelete(groups[0]);
                }}
                disabled={loading || groups.length === 0}
              >
                重複削除（最初のグループ）
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-black/60">
            表示グループ: <span className="font-medium tabular-nums text-black/80">{groups.length}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-50"
              onClick={ignoreSelected}
              disabled={loading || selectedIgnoreKeys.length === 0}
            >
              チェックしたグループを非表示
            </button>
            <button
              type="button"
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              onClick={() => {
                const { deleteIds, keepIds } = computeSafeDeleteIds(selectedTxIds, groups);
                const byId = new Map(groups.flatMap((g) => g.txs).map((t) => [t.id, t] as const));
                setPendingDeleteIds(deleteIds);
                setPendingKeepIds(keepIds);
                setPendingKeepId(keepIds[0] ?? "");
                setPendingDeletePreview(deleteIds.map((id) => byId.get(id)).filter(Boolean) as Tx[]);
                setConfirmOpen(true);
              }}
              disabled={loading || selectedTxIds.length === 0}
            >
              選択した明細を削除
            </button>
          </div>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        {groups.length === 0 ? (
          <div className="text-sm text-black/60">重複候補がありません（または非表示設定済み）。</div>
        ) : (
          <div className="divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/10">
            {groups.map((g) => (
              <div key={g.ignoreKey} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 rounded border-black/20"
                      checked={Boolean(selectedIgnore[g.ignoreKey])}
                      onChange={(e) => setSelectedIgnore((p) => ({ ...p, [g.ignoreKey]: e.target.checked }))}
                    />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {g.label ?? g.key}
                      </div>
                      <div className="text-xs text-black/50 tabular-nums">{g.count} 件</div>
                    </div>
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03] disabled:opacity-50"
                      onClick={() => void startAutoDuplicateDelete(g)}
                      disabled={loading}
                    >
                      重複削除…
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03]"
                      onClick={() => toggleAllTxInGroup(g, true)}
                    >
                      このグループを全選択
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-black/15 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03]"
                      onClick={() => toggleAllTxInGroup(g, false)}
                    >
                      全解除
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {g.txs.map((t) => (
                    <div key={t.id} className="flex items-start gap-3 rounded-xl border border-black/10 bg-black/[0.02] p-3">
                      <input
                        type="checkbox"
                        className="mt-1 size-4 rounded border-black/20"
                        checked={Boolean(selectedTx[t.id])}
                        onChange={(e) => setSelectedTx((p) => ({ ...p, [t.id]: e.target.checked }))}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="text-sm text-black/70 tabular-nums">{toYmd(t.purchaseDate)}</div>
                          <div className="flex items-center gap-3">
                            <a
                              href={`/transactions/${t.id}?back=${encodeURIComponent("/settings/data/duplicates")}`}
                              className="text-xs text-black/50 hover:underline"
                            >
                              詳細
                            </a>
                            <button
                              type="button"
                              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                              onClick={() => {
                                setPendingDeleteIds([t.id]);
                                setPendingKeepIds([]);
                                setPendingKeepId("");
                                setPendingDeletePreview([t]);
                                setConfirmOpen(true);
                              }}
                              disabled={loading}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                        <div className="mt-1 text-sm">
                          {t.type === "expense" ? "-" : "+"}¥{yen(t.totalAmount)} / {t.memo ?? "（メモなし）"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold">削除しますか？</div>
            <div className="mt-2 text-sm text-black/70">
              <span className="font-medium tabular-nums">
                {pendingDeleteIds.length ? pendingDeleteIds.length : computeSafeDeleteIds(selectedTxIds, groups).deleteIds.length}
              </span>{" "}
              件を削除します。取り消しできません。
              {pendingKeepIds.length > 0 ? (
                <div className="mt-2 text-xs text-black/60">
                  同一グループで全件が選ばれていたため、自動で{" "}
                  <span className="tabular-nums">{pendingKeepIds.length}</span> 件は残すようにしました。
                </div>
              ) : null}
            </div>
            <div className="mt-3 max-h-[240px] overflow-auto rounded-xl border border-black/10 bg-black/[0.02] p-3 text-xs text-black/70">
              <div className="text-xs font-medium text-black/60">削除される明細（上位20件）</div>
              <div className="mt-2 grid gap-1">
                {(pendingDeletePreview.length ? pendingDeletePreview : [])
                  .slice(0, 20)
                  .map((t) => (
                    <a key={t.id} href={`/transactions/${t.id}`} className="hover:underline">
                      {toYmd(t.purchaseDate)} / {t.type} / ¥{yen(t.totalAmount)} / {t.memo ?? "（メモなし）"}
                    </a>
                  ))}
                {pendingDeletePreview.length > 20 ? (
                  <div className="text-black/50">…他 {pendingDeletePreview.length - 20} 件</div>
                ) : null}
              </div>
            </div>
            {pendingKeepIds.length > 0 ? (
              <div className="mt-3 text-xs text-black/60">
                <span className="font-medium text-black/70">残す明細（自動）</span>
                <div className="mt-1 grid gap-1">
                  {pendingKeepIds.slice(0, 5).map((id) => {
                    const t = groups.flatMap((g) => g.txs).find((x) => x.id === id);
                    if (!t) return null;
                    return (
                      <a key={id} href={`/transactions/${id}`} className="hover:underline">
                        {toYmd(t.purchaseDate)} / {t.type} / ¥{yen(t.totalAmount)} / {t.memo ?? "（メモなし）"}
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={deleteSelected}
                disabled={loading}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {autoOpenFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-5">
          <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white p-5 shadow-xl">
            <div className="text-sm font-semibold">重複削除（自動選択）</div>
            <div className="mt-2 text-sm text-black/70">
              {autoPhase === "rules"
                ? "ルールで削除候補を選んでいます…"
                : autoPhase === "ai"
                  ? "迷いがあるためAIで確認しています…"
                  : "削除候補が決まりました。内容を確認してください。"}
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="text-black/60">進捗</div>
                <div className="tabular-nums text-black/70">{autoProgress}%</div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-black/10">
                <div className="h-full bg-black transition-[width]" style={{ width: `${autoProgress}%` }} />
              </div>
              {autoReason ? <div className="text-xs text-black/60">{autoReason}</div> : null}
            </div>

            <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-black/60">削除候補</div>
                <div className="tabular-nums">{pendingDeleteIds.length} 件</div>
              </div>
              {pendingKeepId ? (
                <div className="mt-2 text-xs text-black/50">
                  残す:{" "}
                  <a className="hover:underline" href={`/transactions/${pendingKeepId}`}>
                    明細を見る
                  </a>
                </div>
              ) : null}
              <div className="mt-1 text-xs text-black/50">
                {autoUsedAi ? "ルール→AI（必要なときのみ）で決定" : "ルールで決定"}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
                onClick={() => setAutoOpenFor(null)}
                disabled={loading}
              >
                閉じる
              </button>
              <button
                type="button"
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={() => {
                  setAutoOpenFor(null);
                  setConfirmOpen(true);
                }}
                disabled={loading || autoPhase !== "ready" || pendingDeleteIds.length === 0}
              >
                削除を確認する
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

