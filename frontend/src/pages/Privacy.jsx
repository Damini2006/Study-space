export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">What we collect</h2>
        <p>
          We store the email, study spaces, uploaded documents, notes, flashcards, focus sessions and
          vision-board items you create. We do not sell personal data.
        </p>
        <h2 className="text-lg font-semibold text-foreground">How it’s protected</h2>
        <p>
          All data is scoped to your account with Row Level Security in Supabase. API access uses
          short-lived JWT tokens. Uploads are validated and stored in private buckets.
        </p>
        <h2 className="text-lg font-semibold text-foreground">AI processing</h2>
        <p>
          When you use AI features, the relevant text may be sent to the configured LLM provider
          to generate a response. We do not train models on your private content.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>
          Questions? Email <a className="text-primary" href="mailto:privacy@studyspace.app">privacy@studyspace.app</a>{" "}
          or write to: 14 Innovation Drive, Bengaluru, Karnataka 560103, India.
        </p>
      </div>
    </div>
  );
}
