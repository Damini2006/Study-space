import { Suspense, lazy, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import SceneFallback from "./SceneFallback";

const AuthScene = lazy(() => import("./AuthScene"));

const EASE = [0.22, 1, 0.36, 1];

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
 *
 * The decorative stack behind it, back to front:
 *   wash + wash-b  two brand glows on different clocks
 *   auth-grid      rule grid, radially masked
 *   the scene
 *   vignette       melts the card's edges into the page
 *   lit edge       one-pixel inner highlight on top of everything
 *
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
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.12, ease: EASE }}
      className={cn("relative isolate overflow-hidden auth-lit-edge", className)}
    >
      <div className="auth-wash" />
      <div className="auth-wash-b" />
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
      <div className="auth-vignette" />
    </motion.div>
  );
}
