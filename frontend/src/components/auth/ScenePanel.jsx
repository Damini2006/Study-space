import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1];

/**
 * Owns the decorative stack behind the auth caption:
 *   the citation scene  a document and an answer card, typing themselves out
 *   lit edge            one-pixel inner highlight, painted last so it is not
 *                       buried under the scene
 *
 * Everything inside is decorative, so the wrapper is aria-hidden.
 */
export default function ScenePanel({ className }) {
  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.75, delay: 0.12, ease: EASE }}
      className={cn("relative isolate overflow-hidden auth-lit-edge", className)}
    >
      <CitationScene />
    </motion.div>
  );
}
