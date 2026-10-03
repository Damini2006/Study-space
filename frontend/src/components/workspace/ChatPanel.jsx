/**
 * Chat panel — centre pane of the Space workspace.
 * Streams answers over SSE, shows the retrieval citations and the
 * verification status for every assistant message.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Square, Trash2 } from "lucide-react";
import { chatApi } from "@/services/api-services";
import { streamSSE } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badges";
import { cn, mdToHtml } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

const SUGGESTIONS = [
  "Summarise this Space in five bullet points.",
  "What are the three ideas I am most likely to forget?",
  "Quiz me on the hardest concept here.",
];

export default function ChatPanel({ spaceId, onSelectPassage }) {
  const qc = useQueryClient();
  const { error: toastError } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [activeThread, setActiveThread] = useState(null);
  const [threadId, setThreadId] = useState(null);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  const { data: threads = [] } = useQuery({
    queryKey: ["chat-threads", spaceId],
    queryFn: () => chatApi.listThreads(spaceId),
  });

  const loadThread = useMutation({
    mutationFn: (id) => chatApi.getThread(spaceId, id),
    onSuccess: (history) => {
      setMessages(history.messages || []);
      setThreadId(history.thread.id);
      setActiveThread(history.thread);
    },
    onError: (e) => toastError(e.message || "Could not load that conversation."),
  });

  const deleteThread = useMutation({
    mutationFn: (id) => chatApi.deleteThread(spaceId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat-threads", spaceId] });
      resetThread();
    },
    onError: (e) => toastError(e.message || "Could not delete that conversation."),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, streamText]);

  const resetThread = () => {
    setMessages([]);
    setThreadId(null);
    setActiveThread(null);
    setStreamText("");
    setStreaming(false);
  };

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "user", content, created_at: new Date().toISOString() }]);
    setStreamText("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    let acc = "";
    let status = null;
    let citations = [];
    try {
      await streamSSE(
        `/spaces/${spaceId}/chat`,
        { message: content, thread_id: threadId },
        (ev) => {
          if (ev.type === "thread" && ev.thread_id && !threadId) {
            setThreadId(ev.thread_id);
            qc.invalidateQueries({ queryKey: ["chat-threads", spaceId] });
          } else if (ev.type === "token") {
            acc += ev.text;
            setStreamText(acc);
          } else if (ev.type === "final" && ev.message) {
            const m = ev.message;
            acc = m.content ?? acc;
            status = m.status ?? null;
            citations = m.citations ?? [];
            setStreamText(acc);
          } else if (ev.type === "error") {
            toastError(ev.detail || "The assistant could not answer that.");
          }
        },
        { signal: controller.signal }
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: acc,
          status: status || "pending",
          citations,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setMessages((prev) => [
          ...prev,
          { id: `e-${Date.now()}`, role: "assistant", content: "Something went wrong while answering. Please try again.", status: "not_found", citations: [], created_at: new Date().toISOString() },
        ]);
      }
    } finally {
      setStreamText("");
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <section aria-label="Chat" className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chat</h2>
          {activeThread && (
            <span className="truncate text-xs text-muted-foreground">· {activeThread.title}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {threads.length > 0 && (
            <select
              aria-label="Switch conversation"
              value={threadId ?? ""}
              onChange={(e) => (e.target.value ? loadThread.mutate(e.target.value) : resetThread())}
              className="max-w-[9rem] truncate rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-foreground"
            >
              <option value="">New chat</option>
              {threads.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
          {threadId && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete conversation"
              title="Delete conversation"
              onClick={() => deleteThread.mutate(threadId)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 scrollbar-thin">
        {messages.length === 0 && !streaming && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium">Ask anything about this Space</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Answers are grounded in your uploaded sources. Every claim is checked and cited, so you can see exactly
              where it came from.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Message key={m.id} message={m} onSelectPassage={onSelectPassage} />
        ))}

        {streaming && (
          <div className="flex gap-2.5">
            <div className="mt-1 size-6 shrink-0 rounded-full brand-gradient" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="prose-sm space-y-2" dangerouslySetInnerHTML={{ __html: mdToHtml(streamText || "…") }} />
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Checking claims against your sources…
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-border p-2.5">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-surface-2/60 p-2 focus-within:border-primary/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            placeholder="Ask a question… (Enter to send)"
            aria-label="Message"
            className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {streaming ? (
            <Button variant="secondary" size="icon-sm" onClick={stop} aria-label="Stop generating" title="Stop">
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              onClick={() => send()}
              disabled={!input.trim()}
              aria-label="Send message"
              title="Send"
            >
              <Send className="size-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Verify important details against the original source.
        </p>
      </footer>
    </section>
  );
}

function Message({ message, onSelectPassage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm text-on-primary">
          {message.content}
        </div>
      </div>
    );
  }

  const citations = message.citations || [];

  return (
    <div className="flex gap-2.5">
      <div className="mt-1 size-6 shrink-0 rounded-full brand-gradient" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="space-y-2 text-sm" dangerouslySetInnerHTML={{ __html: mdToHtml(message.content) }} />

        {citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {citations.map((c) => (
              <button
                key={c.label ?? c.chunk_id}
                type="button"
                onClick={() => onSelectPassage?.(c)}
                title={c.quote}
                className={cn(
                  "rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted-foreground",
                  "transition-colors hover:border-primary/50 hover:text-foreground"
                )}
              >
                {c.label}. {c.source_title || "source"}
                {c.page != null ? ` · p.${c.page}` : ""}
              </button>
            ))}
          </div>
        )}

        {message.status && <StatusBadge status={message.status} className="mt-2" />}
      </div>
    </div>
  );
}
