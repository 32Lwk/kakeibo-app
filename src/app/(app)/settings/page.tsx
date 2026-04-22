import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAiCallLimitPerMonth, receiptImageKeep, receiptImageRetentionDays } from "@/lib/guardrails";
import { ModalSelect } from "@/components/ModalSelect";
import { ThemeAccentSelect } from "@/components/ThemeAccentSelect";
import { DangerZone } from "@/components/DangerZone";
import { requireAuthedContext, requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      weekStartsOn: true,
      email: true,
      theme: true,
      accent: true,
      transactionSort: true,
      summaryOrder: true,
      carryoverEnabled: true,
      carryoverNote: true,
      recurringAutoApply: true,
    },
  });
  if (!user) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">設定</h1>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">データ設定</div>
              <div className="text-sm text-black/60">CSVの取込/エクスポート、現在のデータ状況をまとめて管理します。</div>
            </div>
            <a
              href="/settings/data"
              className="shrink-0 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90"
            >
              開く
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">カテゴリ</div>
              <div className="text-sm text-black/60">カテゴリの追加・名称変更・削除を行います（ownerのみ）。</div>
            </div>
            <a
              href="/categories"
              className="shrink-0 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/80 hover:bg-black/[0.05] hover:text-black"
            >
              開く
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">レシート</div>
              <div className="text-sm text-black/60">画像をアップロードして解析し、明細として登録します。</div>
            </div>
            <a
              href="/receipts"
              className="shrink-0 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/80 hover:bg-black/[0.05] hover:text-black"
            >
              開く
            </a>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <form
          className="rounded-2xl border border-black/10 bg-white p-6"
          action={async (formData) => {
            "use server";
            const theme = String(formData.get("theme") ?? "system");
            const accent = String(formData.get("accent") ?? "").trim() || null;
            const transactionSort = String(formData.get("transactionSort") ?? "date_desc");
            const summaryOrder = String(formData.get("summaryOrder") ?? "expense_first");
            const carryoverEnabled = String(formData.get("carryoverEnabled") ?? "off") === "on";
            const carryoverNote = String(formData.get("carryoverNote") ?? "").trim() || null;
            const recurringAutoApply = String(formData.get("recurringAutoApply") ?? "off") === "on";
            const weekStartsOn = Number(formData.get("weekStartsOn"));

            if (!["system", "light", "dark"].includes(theme)) throw new Error("不正な値です。");
            if (!["date_desc", "date_asc", "amount_desc", "amount_asc"].includes(transactionSort))
              throw new Error("不正な値です。");
            if (!["expense_first", "income_first"].includes(summaryOrder)) throw new Error("不正な値です。");
            if (![0, 1, 2, 3, 4, 5, 6].includes(weekStartsOn)) throw new Error("不正な値です。");

            await prisma.user.update({
              where: { id: userId },
              data: {
                theme,
                accent,
                transactionSort,
                summaryOrder,
                carryoverEnabled,
                carryoverNote,
                recurringAutoApply,
                weekStartsOn,
              },
            });
            redirect("/settings");
          }}
        >
          <div className="text-sm text-black/60">ログイン中: {user.email}</div>

          <div className="mt-4 grid gap-4">
            <ThemeAccentSelect theme={user.theme} accent={user.accent ?? null} />

            <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">カテゴリ管理</div>
                  <div className="text-xs text-black/50">カテゴリの追加・名称変更・削除を行います（ownerのみ）。</div>
                </div>
                <a
                  href="/categories"
                  className="shrink-0 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/80 hover:bg-black/[0.05] hover:text-black"
                >
                  開く
                </a>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="weekStartsOn">
                カレンダー開始曜日
              </label>
              <select
                id="weekStartsOn"
                name="weekStartsOn"
                defaultValue={String(user.weekStartsOn)}
                className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
              >
                <option value="0">日曜</option>
                <option value="1">月曜</option>
                <option value="2">火曜</option>
                <option value="3">水曜</option>
                <option value="4">木曜</option>
                <option value="5">金曜</option>
                <option value="6">土曜</option>
              </select>
              <div className="text-xs text-black/50">表示のみ（ユーザー単位）です。</div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="transactionSort">
                明細の並び順
              </label>
              <select
                id="transactionSort"
                name="transactionSort"
                defaultValue={user.transactionSort}
                className="w-full rounded-xl border border-black/15 bg-white px-3 py-2"
              >
                <option value="date_desc">日付（新しい順）</option>
                <option value="date_asc">日付（古い順）</option>
                <option value="amount_desc">金額（高い順）</option>
                <option value="amount_asc">金額（低い順）</option>
              </select>
            </div>

            <ModalSelect
              name="summaryOrder"
              label="収支の並び順（ダッシュボード）"
              value={user.summaryOrder}
              options={[
                { value: "expense_first", label: "支出 → 収入", description: "支出を先に表示します（おすすめ）。" },
                { value: "income_first", label: "収入 → 支出", description: "収入を先に表示します。" },
              ]}
            />

            <div className="space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="recurringAutoApply"
                  defaultChecked={user.recurringAutoApply}
                  className="mt-1 size-4 rounded border-black/20"
                />
                <div>
                  <div className="text-sm font-medium">固定費・定期収入を自動反映</div>
                  <div className="text-xs text-black/50">
                    月を開いたタイミングで、その月に必要な分だけ自動生成します（軽量）。
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="carryoverEnabled"
                  defaultChecked={user.carryoverEnabled}
                  className="mt-1 size-4 rounded border-black/20"
                />
                <div>
                  <div className="text-sm font-medium">繰越を有効にする（MVP）</div>
                  <div className="text-xs text-black/50">
                    ルール実装前のため、現状は“設定メモ”として保持します（後で繰越ロジックに反映します）。
                  </div>
                </div>
              </label>
              <input
                name="carryoverNote"
                defaultValue={user.carryoverNote ?? ""}
                placeholder="例: 月末残高を翌月に繰り越す / 現金のみ繰越 など"
                className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
              />
            </div>

          </div>

          <div className="mt-5 flex items-center justify-end">
            <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">
              保存
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-black/10 bg-white p-6">
          <div className="text-sm font-medium">固定費・定期収入</div>
          <div className="mt-1 text-sm text-black/60">
            毎月の定期入力をまとめて管理します（固定費 / 定期収入）。
          </div>
          <div className="mt-4">
            <a
              href="/settings/recurring"
              className="inline-flex rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-black/80 hover:bg-black/[0.05] hover:text-black"
            >
              管理する
            </a>
          </div>
          <div className="mt-6 text-sm font-medium">入力の既定値（今後追加）</div>
          <div className="mt-1 text-sm text-black/60">
            入力画面の初期値（口座/支出・収入の初期表示など）をここに集約予定です。
          </div>

          <div className="mt-6 text-sm font-medium">運用ガード（MVP）</div>
          <div className="mt-1 text-sm text-black/60">
            コストやプライバシーのため、解析上限や画像保持は環境変数で制御しています（後でユーザー設定に拡張予定）。
          </div>
          <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="text-black/70">解析上限（回/月）</div>
              <div className="font-medium tabular-nums">{getAiCallLimitPerMonth()}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="text-black/70">画像保持</div>
              <div className="font-medium">{receiptImageKeep() ? "ON" : "OFF"}</div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <div className="text-black/70">保持期間（日）</div>
              <div className="font-medium tabular-nums">{receiptImageRetentionDays()}</div>
            </div>
            <div className="mt-3 text-xs text-black/50">
              変更したい場合は `.env`（またはデプロイ先の環境変数）で次を設定してください:
              <div className="mt-1 font-mono">AI_CALL_LIMIT_PER_MONTH / RECEIPT_IMAGE_KEEP / RECEIPT_IMAGE_RETENTION_DAYS</div>
            </div>
          </div>

          <div className="mt-6">
            <DangerZone
              disabledDeleteData={false}
              onDeleteData={async () => {
                "use server";
                const ctx = await requireAuthedContext();
                requireRole(ctx, "owner");

                // Delete household data (MVP)
                await prisma.$transaction(async (tx) => {
                  await tx.import.deleteMany({ where: { householdId: ctx.householdId } });
                  await tx.receipt.deleteMany({ where: { householdId: ctx.householdId } });
                  await tx.attachment.deleteMany({ where: { householdId: ctx.householdId } });
                  await tx.refund.deleteMany({
                    where: {
                      OR: [
                        { originalTransaction: { householdId: ctx.householdId } },
                        { refundTransaction: { householdId: ctx.householdId } },
                      ],
                    },
                  });
                  await tx.transaction.deleteMany({ where: { householdId: ctx.householdId } });
                  await tx.category.deleteMany({ where: { householdId: ctx.householdId, isDefault: false } });
                  await tx.auditLog.create({
                    data: { userId: ctx.userId, action: "delete_data", entityType: "household", entityId: ctx.householdId },
                  });
                });
                redirect("/dashboard");
              }}
              onDeleteAccount={async (emailConfirm) => {
                "use server";
                const session = await getSession();
                const uid = (session?.user as any)?.id as string | undefined;
                if (!uid) throw new Error("Unauthorized");
                const current = await prisma.user.findUnique({ where: { id: uid }, select: { email: true } });
                if (!current?.email) throw new Error("メールアドレスが設定されていません。");
                if (current.email.toLowerCase() !== String(emailConfirm ?? "").toLowerCase()) {
                  throw new Error("メールアドレスが一致しません。");
                }
                await prisma.user.delete({ where: { id: uid } });
                redirect("/signup");
              }}
            />
            <div className="mt-2 text-xs text-black/50">※ 家計簿データ削除は owner 権限が必要です。</div>
          </div>
        </div>
      </div>
    </div>
  );
}

