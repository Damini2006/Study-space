import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * The StudySpace lockup: the "SS" gradient tile plus the "StudySpace"
 * wordmark, linking back to the landing page.
 */
export function StudySpaceLogo({ size = 28, className, label = "StudySpace home" }) {
  return (
    <Link
      to="/"
      aria-label={label}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-lg outline-none transition-transform duration-200",
        "hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-4",
        className
      )}
    >
      <span
        className="brand-gradient flex shrink-0 items-center justify-center rounded-md font-bold text-white"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
        aria-hidden="true"
      >
        SS
      </span>
      <span className="text-[15px] font-semibold leading-none tracking-tight">
        StudySpace
      </span>
    </Link>
  );
}

export default StudySpaceLogo;
