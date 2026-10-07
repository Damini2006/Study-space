import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Loader2, Mail, MapPin, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import ThemeToggle from "@/components/ui/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TOPICS = ["Bug report", "Security report", "Partnership", "Press", "Something else"];

export default function Contact() {
  const [topic, setTopic] = useState(TOPICS[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [sent, setSent] = useState(false);
  const { error, success } = useToast();

  const validate = () => {
    const e = {};
    if (name.trim().length < 2) e.name = "Please tell us what to call you.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) e.email = "Enter a valid e-mail address.";
    if (message.trim().length < 20) e.message = "Give us at least 20 characters to work with.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Validate a single field once the user leaves it, so mistakes surface early
  // instead of only on submit.
  const validateField = (field) => {
    const e = {};
    if (field === "name" && name.trim().length < 2) e.name = "Please tell us what to call you.";
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()))
      e.email = "Enter a valid e-mail address.";
    if (field === "message" && message.trim().length < 20)
      e.message = "Give us at least 20 characters to work with.";
    setErrors((prev) => {
      const next = { ...prev };
      if (e[field]) next[field] = e[field];
      else delete next[field];
      return next;
    });
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      // Send focus to the first field that failed so keyboard users aren't stranded.
      requestAnimationFrame(() => {
        document.querySelector("[aria-invalid='true']")?.focus();
      });
      return;
    }
    setBusy(true);
    try {
      // Falls back to the visitor's own mail client so the form always works.
      const subject = encodeURIComponent(`[${topic}] ${name.trim()}`);
      const body = encodeURIComponent(`${message.trim()}\n\n— ${name.trim()} (${email.trim()})`);
      window.location.href = `mailto:neelamrishikadamini@gmail.com?subject=${subject}&body=${body}`;
      setSent(true);
      success("Your mail client is opening with the message ready to send.");
    } catch (err) {
      error(err.message || "Could not open your mail client. E-mail us directly instead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle size="sm" />
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Contact</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-14 sm:px-6 sm:py-20">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="max-w-2xl">
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="text-primary">00</span>
            <span className="h-px w-8 bg-border" />
            <span>Get in touch</span>
          </div>
          <h1 className="mt-6 text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl">
            Talk to a human
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Bug reports, security disclosures and partnership enquiries all land in the same inbox and are
            answered in the order they arrive.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-10 lg:grid-cols-12">
          {/* details */}
          <div className="space-y-6 lg:col-span-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <Mail className="size-4 text-primary" />
              <h2 className="mt-3 text-[13px] font-semibold">E-mail</h2>
              <a href="mailto:neelamrishikadamini@gmail.com" className="mt-1 block break-all text-[13px] text-primary hover:underline">
                neelamrishikadamini@gmail.com
              </a>
              <p className="mt-2 text-[12px] text-muted-foreground">Typical reply: within 2 working days.</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <MapPin className="size-4 text-primary" />
              <h2 className="mt-3 text-[13px] font-semibold">Registered address</h2>
              <address className="mt-1 not-italic text-[13px] leading-relaxed text-muted-foreground">
                StudySpace<br />
                14 Innovation Drive<br />
                Bengaluru 560103<br />
                Karnataka, India
              </address>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <MessageSquare className="size-4 text-primary" />
              <h2 className="mt-3 text-[13px] font-semibold">Security issues</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Please do not open a public issue. E-mail with reproduction steps and we will acknowledge
                within three working days.
              </p>
              <Link to="/security" className="mt-2 inline-block text-[13px] text-primary hover:underline">
                Read the hardening checklist
              </Link>
            </div>
          </div>

          {/* form */}
          <div className="lg:col-span-8">
            <div className="rounded-xl border border-border bg-card p-6">
              {sent ? (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="py-8 text-center">
                  <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                    <Check className="size-5 text-primary" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold">Your message is ready to send</h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    Your mail client should have opened with everything filled in. If it did not, e-mail us
                    directly at neelamrishikadamini@gmail.com.
                  </p>
                  <Button variant="outline" className="mt-5" onClick={() => { setSent(false); setMessage(""); }}>
                    Write another
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={submit} noValidate>
                  <fieldset>
                    <legend className="text-[13px] font-medium">What is this about?</legend>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {TOPICS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTopic(t)}
                          aria-pressed={topic === t}
                          className={
                            "rounded-full border px-3 py-1.5 text-[12px] transition-colors " +
                            (topic === t
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground")
                          }
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="c-name">Name</Label>
                      <Input
                        id="c-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => validateField("name")}
                        placeholder="Ada Lovelace"
                        aria-invalid={!!errors.name}
                        aria-describedby={errors.name ? "c-name-err" : undefined}
                      />
                      {errors.name && <p id="c-name-err" role="alert" className="text-xs text-destructive">{errors.name}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="c-email">E-mail</Label>
                      <Input
                        id="c-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => validateField("email")}
                        placeholder="you@school.edu"
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? "c-email-err" : undefined}
                      />
                      {errors.email && <p id="c-email-err" role="alert" className="text-xs text-destructive">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <Label htmlFor="c-message">Message</Label>
                    <textarea
                      id="c-message"
                      rows={6}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onBlur={() => validateField("message")}
                      placeholder="Steps to reproduce, what you expected, what happened."
                      aria-invalid={!!errors.message}
                      aria-describedby={errors.message ? "c-msg-err" : "c-msg-hint"}
                      className="flex w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-hidden ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                    <div className="flex items-start justify-between gap-4">
                      {errors.message ? (
                        <p id="c-msg-err" role="alert" className="text-xs text-destructive">{errors.message}</p>
                      ) : (
                        <p id="c-msg-hint" className="text-xs text-muted-foreground">Never include passwords or access tokens.</p>
                      )}
                      <span
                        aria-live="polite"
                        className={cn(
                          "shrink-0 font-mono text-[11px]",
                          message.trim().length >= 20 ? "text-success" : "text-muted-foreground"
                        )}
                      >
                        {message.trim().length}/20
                      </span>
                    </div>
                  </div>

                  <Button type="submit" className="mt-6 w-full sm:w-auto" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                    Send message
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>

        <nav className="mt-12 flex flex-wrap gap-6 border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy policy</Link>
          <Link to="/terms" className="transition-colors hover:text-foreground">Terms of service</Link>
          <Link to="/security" className="transition-colors hover:text-foreground">Security</Link>
        </nav>
      </main>
    </div>
  );
}
