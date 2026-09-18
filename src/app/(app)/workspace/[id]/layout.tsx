import { WorkspaceMobileNav } from "@/components/workspace-nav";

type Props = {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
};

export default async function WorkspaceSectionLayout({ children, params }: Props) {
  const { id } = await params;
  return (
    <>
      {children}
      <WorkspaceMobileNav workspaceId={id} />
    </>
  );
}
