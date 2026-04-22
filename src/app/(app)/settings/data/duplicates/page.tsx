import { requireAuthedContext, requireRole } from "@/lib/authz";
import { DuplicatesClient } from "./DuplicatesClient";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const ctx = await requireAuthedContext();
  requireRole(ctx, "editor");

  return <DuplicatesClient />;
}

