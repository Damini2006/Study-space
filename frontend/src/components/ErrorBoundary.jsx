import { Component } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Catches render-time crashes anywhere below it so a single broken view can't
 * white-screen the whole app. Shows a themed fallback with a reload action and
 * (in dev) the component stack for debugging.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface in the console so devtools/dev overlay still shows the stack.
    console.error("[StudySpace] render error:", error, info?.componentStack);
    this._lastInfo = info;
  }

  handleReset = () => {
    this.setState((s) => ({ error: null, key: s.key + 1 }));
  };

  render() {
    const { error, key } = this.state;
    if (!error) {
      return <div key={key}>{this.props.children}</div>;
    }

    const message = error?.message || "Something went wrong while rendering this view.";

    return (
      <div
        role="alert"
        className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <AlertTriangle className="size-6" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">This section hit a snag</h2>
          <p className="text-sm text-muted-foreground">
            The rest of StudySpace still works — try again, or reload the page if it keeps happening.
          </p>
        </div>
        <p className="max-w-full break-words rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-muted-foreground">
          {message}
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={this.handleReset} variant="outline" size="sm">
            <RotateCcw className="size-4" aria-hidden /> Try again
          </Button>
          <Button onClick={() => window.location.reload()} size="sm">
            Reload page
          </Button>
        </div>
        {import.meta.env.DEV && this._lastInfo?.componentStack && (
          <pre className="max-h-40 w-full overflow-auto rounded-lg border border-border bg-surface p-3 text-left text-[10px] leading-relaxed text-muted-foreground">
            {this._lastInfo.componentStack.trim()}
          </pre>
        )}
      </div>
    );
  }
}
