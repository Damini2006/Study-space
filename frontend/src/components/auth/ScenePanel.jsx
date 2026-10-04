import { Suspense, lazy, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import SceneFallback from "./SceneFallback";

const AuthScene = lazy(() => import("./AuthScene"));

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function Skeleton() {
  return <div className="auth-scene-skeleton absolute inset-0" aria-hidden="true" />;
}

/**
 * Owns the decision of what to render behind the auth caption:
 *  - the React Three Fiber scene when it is safe to run,
 *  - a static illustration on mobile / low-power / reduced-motion,
 *  - a shimmering skeleton while the 3D chunk is still arriving.
 * Everything inside is decorative, so the wrapper is aria-hidden.
 */
export default function ScenePanel({ mode = "signin", dark = false, className }) {
  const [kind, setKind] = useState("scene");

  useEffect(() => {
    const decide = () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const narrow = window.innerWidth < 1024;
      const cores = navigator.hardwareConcurrency ?? 8;
      const mem = navigator.deviceMemory ?? 8;
      const lowPower = cores <= 4 || mem <= 4;
      setKind(!reduced && !narrow && !lowPower && hasWebGL() ? "scene" : "static");
    };
    decide();
    window.addEventListener("resize", decide);
    return () => window.removeEventListener("resize", decide);
  }, []);

  return (
    <div aria-hidden="true" className={cn("relative isolate overflow-hidden", className)}>
      <div className="auth-wash" />
      <div
        className="auth-grid absolute inset-0"
        style={{
          maskImage:
            "radial-gradient(78% 70% at 50% 48%, #000 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(78% 70% at 50% 48%, #000 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
        }}
      />
      {kind === "scene" ? (
        <Suspense fallback={<Skeleton />}>
          <AuthScene mode={mode} dark={dark} />
        </Suspense>
      ) : kind === "static" ? (
        <SceneFallback mode={mode} />
      ) : (
        <Skeleton />
      )}
    </div>
  );
}
