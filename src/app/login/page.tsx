import { LoginForm } from "./login-form";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

function safeNextPath(raw?: string) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/login") || raw.startsWith("/signup")) return "/dashboard";
  return raw;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  return <LoginForm next={safeNextPath(params.next)} />;
}
