import { prisma } from "@/lib/db";
import { requireAuthedContext, requireRole } from "@/lib/authz";
import { redirect } from "next/navigation";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(30),
});

const renameSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(30),
});

export default async function CategoriesPage() {
  const ctx = await requireAuthedContext({ onUnauthorized: "redirect" });
  requireRole(ctx, "owner");

  const categories = await prisma.category.findMany({
    where: { householdId: ctx.householdId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">カテゴリ</h1>
          <div className="text-sm text-black/60">カテゴリの追加・名称変更・削除を行います（ownerのみ）。</div>
        </div>
        <a className="text-sm underline" href="/settings">
          設定へ
        </a>
      </div>

      <form
        className="max-w-xl space-y-4 rounded-2xl border border-black/10 bg-white p-6"
        action={async (formData) => {
          "use server";
          const ctx = await requireAuthedContext();
          requireRole(ctx, "owner");

          const parsed = createSchema.safeParse({ name: String(formData.get("name") ?? "") });
          if (!parsed.success) throw new Error("入力が不正です。");

          const created = await prisma.category.create({
            data: {
              householdId: ctx.householdId,
              name: parsed.data.name,
              sortOrder: 999,
              isDefault: false,
            },
            select: { id: true },
          });

          await prisma.auditLog.create({
            data: {
              userId: ctx.userId,
              action: "create",
              entityType: "category",
              entityId: created.id,
            },
          });

          redirect("/categories");
        }}
      >
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="name">
            新しいカテゴリ名
          </label>
          <input
            id="name"
            name="name"
            placeholder="例: 光熱費"
            className="w-full rounded-xl border border-black/15 px-3 py-2"
            required
          />
        </div>
        <button className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/90">追加</button>
      </form>

      <section className="max-w-2xl rounded-2xl border border-black/10 bg-white">
        <div className="border-b border-black/10 px-6 py-4">
          <div className="text-sm font-medium">登録済み</div>
          <div className="text-sm text-black/60">{categories.length}件</div>
        </div>
        <div className="divide-y divide-black/10">
          {categories.map((c) => (
            <div key={c.id} className="px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">
                  {c.name} {c.isDefault ? <span className="ml-2 text-xs font-medium text-black/50">（既定）</span> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    className="flex items-center gap-2"
                    action={async (formData) => {
                      "use server";
                      const ctx = await requireAuthedContext();
                      requireRole(ctx, "owner");

                      const parsed = renameSchema.safeParse({
                        id: String(formData.get("id") ?? ""),
                        name: String(formData.get("name") ?? ""),
                      });
                      if (!parsed.success) throw new Error("入力が不正です。");

                      const current = await prisma.category.findFirst({
                        where: { id: parsed.data.id, householdId: ctx.householdId },
                        select: { id: true },
                      });
                      if (!current) throw new Error("カテゴリが見つかりません。");

                      await prisma.$transaction(async (txPrisma) => {
                        await txPrisma.category.update({
                          where: { id: current.id },
                          data: { name: parsed.data.name },
                        });
                        await txPrisma.auditLog.create({
                          data: {
                            userId: ctx.userId,
                            action: "update",
                            entityType: "category",
                            entityId: current.id,
                          },
                        });
                      });

                      redirect("/categories");
                    }}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      name="name"
                      defaultValue={c.name}
                      className="w-44 rounded-xl border border-black/15 px-3 py-2 text-sm"
                      disabled={c.isDefault}
                    />
                    <button
                      className="rounded-xl border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-40"
                      disabled={c.isDefault}
                    >
                      名称変更
                    </button>
                  </form>
                  <form
                    action={async (formData) => {
                      "use server";
                      const ctx = await requireAuthedContext();
                      requireRole(ctx, "owner");

                      const id = String(formData.get("id") ?? "");
                      if (!id) throw new Error("不正な値です。");

                      const current = await prisma.category.findFirst({
                        where: { id, householdId: ctx.householdId },
                        select: { id: true, isDefault: true },
                      });
                      if (!current) throw new Error("カテゴリが見つかりません。");
                      if (current.isDefault) throw new Error("既定カテゴリは削除できません。");

                      await prisma.$transaction(async (txPrisma) => {
                        await txPrisma.category.delete({ where: { id: current.id } });
                        await txPrisma.auditLog.create({
                          data: {
                            userId: ctx.userId,
                            action: "delete",
                            entityType: "category",
                            entityId: current.id,
                          },
                        });
                      });

                      redirect("/categories");
                    }}
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 hover:bg-red-100 disabled:opacity-40"
                      disabled={c.isDefault}
                    >
                      削除
                    </button>
                  </form>
                </div>
              </div>
              {c.isDefault ? <div className="mt-2 text-xs text-black/50">既定カテゴリは変更/削除不可にしています。</div> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

