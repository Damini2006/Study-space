export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: October 2026</p>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Use of StudySpace</h2>
        <p>
          StudySpace is a personal study workspace. You may upload your own documents and use the AI
          features for legitimate study purposes.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Your content</h2>
        <p>
          You retain ownership of everything you upload. By uploading content you confirm it is yours
          or you have the right to use it.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Acceptable use</h2>
        <p>
          Don’t abuse rate limits, attempt to access other users’ data, or upload copyrighted
          material you don’t own.
        </p>
        <h2 className="text-lg font-semibold text-foreground">Contact</h2>
        <p>
          Email <a className="text-primary" href="mailto:legal@studyspace.app">legal@studyspace.app</a>{" "}
          or write to: 14 Innovation Drive, Bengaluru, Karnataka 560103, India.
        </p>
      </div>
    </div>
  );
}
