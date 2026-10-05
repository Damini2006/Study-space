
export default function ThankYou() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4">
      <CheckCircle2 className="size-14 text-success" />
      <h1 className="text-2xl font-bold">You’re all set 🎉</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Thanks for getting started with StudySpace. Your demo workspace is seeded and ready — dive in and explore.
      </p>
      <Link to="/app/dashboard"><Button size="lg">Go to my workspace</Button></Link>
    </div>
  );
}
