import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    id: "use-of-studyspace",
    title: "Use of StudySpace",
    body: (
      <>
        StudySpace is a personal study workspace. You may upload your own documents and use the AI
        features for legitimate study purposes.
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <>
        You retain ownership of everything you upload. By uploading content you confirm it is yours
        or you have the right to use it.
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        Don’t abuse rate limits, attempt to access other users’ data, or upload copyrighted
        material you don’t own.
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        Email{" "}
        <a className="text-primary" href="mailto:legal@studyspace.app">
          legal@studyspace.app
        </a>{" "}
        or write to: 14 Innovation Drive, Bengaluru, Karnataka 560103, India.
      </>
    ),
  },
];

const pad = (n) => String(n).padStart(2, "0");

export default function Terms() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const listRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  // Keep the selected chip in view on narrow screens where the nav scrolls sideways.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>

      {/* Numbered section chips — horizontally scrollable on mobile */}
      <nav
        aria-label="Terms sections"
        className="sticky top-14 z-10 -mx-4 mt-6 border-y border-border bg-background/85 px-4 py-2 backdrop-blur"
      >
        <ul ref={listRef} className="flex gap-2 overflow-x-auto scrollbar-thin">
          {SECTIONS.map((s, i) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                data-active={active === s.id}
                aria-current={active === s.id ? "true" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
                  active === s.id
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground"
                )}
              >
                <span className="font-mono text-[10px] opacity-70">{pad(i + 1)}</span>
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground">
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-32">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs text-primary">{pad(i + 1)}</span>
              <h2 className="text-lg font-semibold text-foreground">{s.title}</h2>
            </div>
            <p className="mt-2">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
