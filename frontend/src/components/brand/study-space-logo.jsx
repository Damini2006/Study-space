import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

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
      <img
        src="/logo-mark.svg"
        alt=""
        aria-hidden="true"
        width={438}
        height={362}
        className="w-auto shrink-0 drop-shadow-sm transition-transform duration-200 group-hover:-rotate-3"
        style={{ height: size }}
      />
      <span className="text-[15px] font-semibold leading-none tracking-tight">
        StudySpace
      </span>
    </Link>
  );
}

export default StudySpaceLogo;
