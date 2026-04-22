import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const userId = (session.user as any)?.id as string | undefined;
  const prefs = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { theme: true, summaryOrder: true },
      })
    : null;

  return (
    <AppChrome email={session.user.email} theme={prefs?.theme} summaryOrder={prefs?.summaryOrder}>
      {children}
    </AppChrome>
  );
}

