import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function ChatRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/workspace/${id}/learn`);
}
