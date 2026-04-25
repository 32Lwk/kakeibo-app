import { prisma } from "@/lib/db";

const DEFAULT_CATEGORIES = [
  { name: "未分類", isDefault: true, sortOrder: 0 },
  { name: "食費", isDefault: true, sortOrder: 10 },
  { name: "日用品", isDefault: true, sortOrder: 20 },
  { name: "交通費", isDefault: true, sortOrder: 30 },
  { name: "交際費", isDefault: true, sortOrder: 40 },
  { name: "趣味", isDefault: true, sortOrder: 50 },
  { name: "衣服", isDefault: true, sortOrder: 60 },
  { name: "医療", isDefault: true, sortOrder: 70 },
  { name: "住居", isDefault: true, sortOrder: 80 },
  { name: "臨時", isDefault: true, sortOrder: 90 },
];

export async function ensureDefaultHouseholdForUser(userId: string) {
  const existing = await prisma.membership.findFirst({
    where: { userId },
    select: { householdId: true, role: true },
  });
  if (existing) return existing.householdId;

  const household = await prisma.household.create({
    data: {
      name: "個人帳簿",
      memberships: {
        create: { userId, role: "owner" },
      },
      categories: {
        create: DEFAULT_CATEGORIES,
      },
      layers: {
        create: [{ name: "メイン", sortOrder: 0 }],
      },
    },
    select: { id: true },
  });

  const mainLayer = await prisma.householdLayer.findFirst({
    where: { householdId: household.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (mainLayer) {
    await prisma.user.update({
      where: { id: userId },
      data: { preferredLayerId: mainLayer.id },
    });
  }

  return household.id;
}

