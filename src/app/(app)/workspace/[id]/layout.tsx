import { WorkspaceMobileNav, WorkspaceRail } from "@/components/workspace-nav";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function WorkspaceSectionLayout({ children, params }: Props) {
  const { id } = await params;
  return (
    <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <aside className="sticky top-6 hidden self-start lg:block">
        <WorkspaceRail workspaceId={id} />
      </aside>
      <div>{children}</div>
      <WorkspaceMobileNav workspaceId={id} />
    </div>
  );
}
