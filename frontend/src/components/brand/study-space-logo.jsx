import { cn } from "@/lib/utils";

/**
 * Theme-aware bunny mark. Uses CSS variables so it auto-adapts to light/dark.
 */
function BunnyMark({ size, className }) {
  return (
    <svg
      viewBox="0 0 438 362"
      width={438}
      height={362}
      className={cn("w-auto shrink-0", className)}
      style={{ height: size }}
      aria-hidden="true"
    >
      <defs>
        <path id="heart" d="M0 8 C-16 -4 -9 -16 0 -7 C9 -16 16 -4 0 8Z" />
        <path id="spark" d="M0 -1 C0.12 -0.3 0.3 -0.12 1 0 C0.3 0.12 0.12 0.3 0 1 C-0.12 0.3 -0.3 0.12 -1 0 C-0.3 -0.12 -0.12 -0.3 0 -1Z" />
      </defs>
      <rect width="438" height="362" rx="56" fill="var(--surface)" />
      <g transform="translate(-4.3 16.72) scale(1.5 1.4)" strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M128 205 C132 215 118 224 106 217 C94 209 98 194 112 190 C92 184 74 168 70 148 C66 126 76 106 96 96 C72 72 70 30 90 18 C108 8 126 26 132 56 C135 70 138 80 150 90 C162 80 165 70 168 56 C174 26 192 8 210 18 C230 30 228 72 204 96 C224 106 234 126 230 148 C226 168 208 184 188 190 C202 194 206 209 194 217 C182 224 168 215 172 205"
          fill="var(--surface)"
          stroke="var(--primary)"
          strokeWidth="9"
        />
        <ellipse cx="106" cy="58" rx="11" ry="24" transform="rotate(-12 106 58)" fill="var(--accent)" />
        <ellipse cx="194" cy="58" rx="11" ry="24" transform="rotate(12 194 58)" fill="var(--accent)" />
        <path d="M110 134 Q120 122 130 134" fill="none" stroke="var(--primary)" strokeWidth="5" />
        <path d="M170 134 Q180 122 190 134" fill="none" stroke="var(--primary)" strokeWidth="5" />
        <circle cx="98" cy="148" r="9" fill="var(--accent)" />
        <circle cx="202" cy="148" r="9" fill="var(--accent)" />
        <path
          d="M145 140 Q150 136 155 140 Q153 145 150 146 Q147 145 145 140Z"
          fill="var(--primary)"
          stroke="var(--primary)"
          strokeWidth="2"
        />
        <path
          d="M150 147 V150 M150 150 Q143 157 136 150 M150 150 Q157 157 164 150"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="4"
        />
        <use href="#heart" transform="translate(40 108) scale(1.5)" fill="var(--primary)" />
        <use href="#spark" transform="translate(258 112) scale(14)" fill="var(--primary)" />
      </g>
    </svg>
  );
}

/**
 * The StudySpace lockup: the bunny mark cropped from the full artwork
 * plus the "StudySpace" wordmark, linking back to the landing page.
 */
export function StudySpaceLogo({ size = 28, className, label = "StudySpace home" }) {
  return (
    <Link
      to="/"
      aria-label={label}
      title="Back to the StudySpace home page"
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-lg outline-none transition-transform duration-200",
        "hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4",
        className
      )}
    >
      <span className="drop-shadow-sm transition-transform duration-200 group-hover:-rotate-3">
        <BunnyMark size={size} />
      </span>
      <span className="text-[15px] font-semibold leading-none tracking-tight">
        StudySpace
      </span>
    </Link>
  );
}

export default StudySpaceLogo;
