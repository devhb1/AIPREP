export default function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-24 animate-pulse">
      <div className="h-4 w-24 rounded bg-[var(--background)]" />
      <div className="h-10 w-64 rounded bg-[var(--background)]" />
      <div className="h-4 w-full max-w-md rounded bg-[var(--background)]" />
      <div className="mt-6 space-y-3 rounded-2xl border border-line bg-panel p-5">
        <div className="h-24 rounded-xl bg-[var(--background)]" />
        <div className="h-16 rounded-xl bg-[var(--background)]" />
        <div className="h-16 rounded-xl bg-[var(--background)]" />
      </div>
    </div>
  );
}
