import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { UserMenu } from "@/components/UserMenu";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-3">
          <a href="/dashboard" className="font-semibold tracking-tight">
            家計簿
          </a>
          <nav className="flex items-center gap-3 text-sm text-black/70">
            <a className="hover:text-black" href="/dashboard">
              ダッシュボード
            </a>
            <a className="hover:text-black" href="/transactions">
              明細
            </a>
            <a className="hover:text-black" href="/import">
              CSV取込
            </a>
            <a className="hover:text-black" href="/settings">
              設定
            </a>
          </nav>
          <UserMenu email={session.user.email} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

