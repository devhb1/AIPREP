export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="h-4 w-24 animate-pulse rounded bg-line" />
      <div className="h-10 w-72 animate-pulse rounded bg-line" />
      <div className="h-28 animate-pulse rounded-[var(--radius-card)] border border-line bg-panel" />
    </main>
  );
}
