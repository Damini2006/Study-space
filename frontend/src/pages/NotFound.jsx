import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4">
      <p className="text-6xl font-black tracking-tight brand-text">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The page you’re looking for moved, or the link is wrong. Head back to your workspace.
      </p>
      <div className="flex gap-2">
        <Link to="/"><Button variant="outline">Home</Button></Link>
        <Link to="/app/dashboard"><Button>Go to Dashboard</Button></Link>
      </div>
    </div>
  );
}
