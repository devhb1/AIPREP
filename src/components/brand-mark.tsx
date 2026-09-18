import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
};

const sizes = {
  sm: { img: "h-8 w-8 rounded-lg", title: "text-sm", tag: "text-[10px]" },
  md: { img: "h-10 w-10 rounded-xl", title: "text-base", tag: "text-xs" },
  lg: { img: "h-14 w-14 rounded-2xl", title: "text-lg", tag: "text-sm" },
};

export function BrandMark({
  href,
  size = "md",
  showTagline = true,
  className = "",
}: BrandMarkProps) {
  const s = sizes[size];
  const content = (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/aiprep-logo.jpg"
        alt="AI Prep"
        className={`${s.img} shrink-0 object-cover shadow-sm ring-1 ring-line`}
      />
      <div className="min-w-0">
        <p className={`${s.title} font-bold tracking-tight text-ink`}>AI Prep</p>
        {showTagline ? (
          <p className={`${s.tag} truncate text-muted`}>Your AI Interview Mentor</p>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0">
        {content}
      </Link>
    );
  }
  return content;
}
