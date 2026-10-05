import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SECTIONS = [
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        We store the email, study spaces, uploaded documents, notes, flashcards, focus sessions and
        vision-board items you create. We do not sell personal data.
      </>
    ),
  },
  {
    id: "how-its-protected",
    title: "How it’s protected",
    body: (
      <>
        All data is scoped to your account with Row Level Security in Supabase. API access uses
        short-lived JWT tokens. Uploads are validated and stored in private buckets.
      </>
    ),
  },
  {
    id: "ai-processing",
    title: "AI processing",
    body: (
      <>
        When you use AI features, the relevant text may be sent to the configured LLM provider
        to generate a response. We do not train models on your private content.
      </>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        Questions? Email{" "}
        <a className="text-primary" href="mailto:privacy@studyspace.app">
          privacy@studyspace.app
        </a>{" "}
        or write to: 14 Innovation Drive, Bengaluru, Karnataka 560103, India.
      </>
    ),
  },
];

export default function Privacy() {
  const [active, setActive] = useState(SECTIONS[0].id);

  // Scroll-spy: highlight whichever section is currently under the top of the viewport.
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>
      </div>

      <div className="mt-8 gap-10 lg:flex lg:items-start">
        {/* Sticky contents rail (desktop only) */}
        <nav
          aria-label="On this page"
          className="hidden shrink-0 lg:sticky lg:top-8 lg:block lg:w-56"
        >
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            On this page
          </p>
          <ul className="mt-3 space-y-1 border-l border-border">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "true" : undefined}
                  className={cn(
                    "-ml-px block border-l-2 py-1.5 pl-3 text-[13px] transition-colors",
                    active === s.id
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-6 min-w-0 flex-1 space-y-4 text-sm leading-relaxed text-muted-foreground lg:mt-0 lg:max-w-3xl">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-lg font-semibold text-foreground">{s.title}</h2>
              <p>{s.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
