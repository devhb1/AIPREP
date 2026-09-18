import { redirect } from "next/navigation";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DrillRedirect({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (typeof value === "string") usp.set(key, value);
  }
  const suffix = usp.toString();
  redirect(`/workspace/${id}/interview/mock${suffix ? `?${suffix}` : ""}`);
}
