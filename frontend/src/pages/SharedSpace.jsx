import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, FileText, Layers, RefreshCw, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { spacesApi } from "@/services/api-services";

/**
 * The page behind a share link: `/s/:slug` for a published space,
 * `/spaces/shared/:token` for an invite link. Both endpoints return the
 * same read-only view, so one component serves both routes — the URL
 * decides which credential is spent, nothing else differs.
 *
 * Every state on this page is a real one: loading while the request is
 * out, an honest dead-link message when the credential no longer opens
 * anything, a retry for failures that retrying can fix, and truncation
 * lines whenever the server capped a list ("first 500 of N") — this page
 * never shows a partial list as if it were the whole deck.
 */

function Section({ icon: Icon, title, total, shown, children }) {
  const truncated = shown < total;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="size-4 text-primary" aria-hidden />
          {title}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {total} in this space
        </span>
      </div>
      {truncated ? (
        <p className="text-xs text-muted-foreground">
          Showing the first {shown} of {total}.
        </p>
      ) : null}
      {children}
    </section>
  );
}

function DeadLink({ isPublic }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
        <AlertCircle className="size-7" aria-hidden />
      </span>
      <div>
        <h1 className="text-xl font-semibold">
          {isPublic
            ? "This link doesn't open a space"
            : "This invite link is no longer active"}
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {isPublic
            ? "The page may have been unpublished, or the link was mistyped."
            : "The invite may have been revoked or expired, or the link was mistyped."}
        </p>
      </div>
      <Link to="/">
        <Button variant="outline">StudySpace home</Button>
      </Link>
    </div>
  );
}

function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading space"
      className="mx-auto max-w-3xl space-y-4 px-4 py-12"
    >
      <div className="h-8 w-64 animate-pulse rounded-md bg-surface-2" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded-md bg-surface-2" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      <span className="sr-only">Loading space…</span>
    </div>
  );
}

export default function SharedSpace() {
  const { slug, token } = useParams();
  const isPublic = Boolean(slug);
  const [state, setState] = useState({ status: "loading", data: null, code: 0 });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", data: null, code: 0 });
    (async () => {
      try {
        const data = isPublic
          ? await spacesApi.getPublicSpace(slug)
          : await spacesApi.getSharedSpace(token);
        if (!cancelled) setState({ status: "ready", data, code: 0 });
      } catch (err) {
        if (!cancelled) {
          setState({ status: "error", data: null, code: err?.status ?? 0 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token, isPublic, attempt]);

  if (state.status === "loading") return <Loading />;

  if (state.status === "error") {
    // A dead credential says so; a transport failure gets a retry that
    // actually re-runs the request.
    if (state.code === 404) return <DeadLink isPublic={isPublic} />;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground">
          <AlertCircle className="size-7" aria-hidden />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Couldn't load this space</h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            The request failed — check your connection and try again.
          </p>
        </div>
        <Button onClick={() => setAttempt((a) => a + 1)}>
          <RefreshCw className="size-4" aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  const { space, sources, cards, notes } = state.data;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-8">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isPublic ? "success" : "default"} className="text-xs">
              {isPublic ? "Published · read-only" : "Shared · read-only"}
            </Badge>
            {space.subject ? (
              <Badge variant="default" className="text-xs">
                {space.subject}
              </Badge>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{space.title}</h1>
          {space.description ? (
            <p className="text-sm text-muted-foreground">{space.description}</p>
          ) : null}
          <p className="font-mono text-xs text-muted-foreground">
            {space.source_count} sources · {space.card_count} cards ·{" "}
            {space.note_count} notes
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <Section
          icon={FileText}
          title="Sources"
          total={space.source_count}
          shown={sources.length}
        >
          {sources.length > 0 ? (
            <ul className="space-y-2">
              {sources.map((src) => (
                <li
                  key={`${src.title}-${src.created_at}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {src.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {src.type} · {src.char_count.toLocaleString()} characters ·{" "}
                      {src.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sources in this space.
            </p>
          )}
        </Section>

        <Section
          icon={Layers}
          title="Cards"
          total={space.card_count}
          shown={cards.length}
        >
          {cards.length > 0 ? (
            <ul className="space-y-2">
              {cards.map((card, i) => (
                <li key={`${card.front}-${i}`} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <p className="text-sm font-medium">{card.front}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{card.back}</p>
                  {card.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {card.tags.map((tag) => (
                        <Badge key={tag} variant="default" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No cards yet.</p>
          )}
        </Section>

        <Section
          icon={StickyNote}
          title="Notes"
          total={space.note_count}
          shown={notes.length}
        >
          {notes.length > 0 ? (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={`${note.title}-${note.content_text.slice(0, 24)}`} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <p className="text-sm font-medium">
                    {note.title}
                    {note.pinned ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        pinned
                      </span>
                    ) : null}
                  </p>
                  {note.content_text ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {note.content_text}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          )}
        </Section>
      </main>

      <footer className="border-t border-border px-4 py-6 text-center">
        <Link to="/" className="text-sm text-primary hover:underline">
          StudySpace — build your own workspace
        </Link>
      </footer>
    </div>
  );
}
