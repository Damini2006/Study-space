import { useEffect, useRef, useState } from "react";

/**
 * The decorative scene behind the auth caption.
 *
 * A source document floats top-left, an answer card floats bottom-right and a
 * few degrees closer to the viewer. The answer types itself out one clause at
 * a time; each clause it finishes lights the passage it is citing in the
 * document and pops that citation's chip in the text. When the second claim
 * lands the badge reports "2 of 2 claims verified" and the loop restarts.
 *
 * Deliberately DOM-and-CSS. The WebGL version of this panel never drew on
 * roughly half the machines that reached it, and a scene that renders is
 * worth more than a scene that is technically prettier. It also means
 * prefers-reduced-motion degrades to a single static final frame for free —
 * the loop simply never starts, which is the whole illustration.
 */

const CLAIM = "Because no heat crosses the boundary,";
const CLAUSE = " the gas does work using its own internal energy.";

const EMPTY = {
  text: "",
  chip1: false,
  chip2: false,
  hl1: false,
  hl2: false,
  verified: false,
};

const FULL = {
  text: CLAIM + CLAUSE,
  chip1: true,
  chip2: true,
  hl1: true,
  hl2: true,
  verified: true,
};

const PASSAGES = [
  { id: "hl1", text: "No heat crosses the system boundary.", page: "p.14" },
  { id: "hl2", text: "Work comes from internal energy.", page: "p.21" },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function CitationScene() {
  const stageRef = useRef(null);
  const [reduce, setReduce] = useState(prefersReducedMotion);
  const [s, setS] = useState(() => (prefersReducedMotion() ? FULL : EMPTY));

  /* Follow the setting live — flipping it in the OS should settle the panel
     onto its final frame without a reload. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduce) {
      setS(FULL);
      return undefined;
    }

    let cancelled = false;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const patch = (next) => {
      if (!cancelled) setS((prev) => ({ ...prev, ...next }));
    };
    const type = async (base, chunk) => {
      for (let i = 1; i <= chunk.length; i += 1) {
        if (cancelled) return;
        patch({ text: base + chunk.slice(0, i) });
        await wait(26);
      }
    };

    (async () => {
      while (!cancelled) {
        setS(EMPTY);
        await wait(700);
        if (cancelled) return;

        await type("", CLAIM);
        if (cancelled) return;
        patch({ chip1: true, hl1: true });
        await wait(500);
        if (cancelled) return;

        await type(CLAIM, CLAUSE);
        if (cancelled) return;
        patch({ chip2: true, hl2: true });
        await wait(500);
        if (cancelled) return;

        patch({ verified: true });
        await wait(3200);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reduce]);

  /* Pointer tilt, written straight to the node so the typing loop and the
     pointer never have to trade re-renders. The same coordinates feed the
     spotlight's `--mx`/`--my`, so light and depth track together. */
  const tilt = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    event.currentTarget.style.setProperty("--mx", `${px}px`);
    event.currentTarget.style.setProperty("--my", `${py}px`);
    if (reduce || !stageRef.current) return;
    const x = px / box.width - 0.5;
    const y = py / box.height - 0.5;
    stageRef.current.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(
      -y * 8
    ).toFixed(2)}deg)`;
  };
  const settle = () => {
    if (stageRef.current) stageRef.current.style.transform = "";
  };

  const head = s.text.slice(0, CLAIM.length);
  const tail = s.text.slice(CLAIM.length);
  const progress = Math.min(1, s.text.length / (CLAIM.length + CLAUSE.length));

  return (
    <div className="src-scene" onMouseMove={tilt} onMouseLeave={settle}>
      <div className="src-grid" />
      <div className="src-blob src-blob-a" />
      <div className="src-blob src-blob-b" />
      <span className="src-dot" style={{ left: "12%", top: "70%", width: 7, height: 7 }} />
      <span
        className="src-dot"
        style={{
          left: "80%",
          top: "18%",
          width: 5,
          height: 5,
          background: "var(--accent)",
          animationDelay: "-2s",
        }}
      />
      <span
        className="src-dot"
        style={{ left: "90%", top: "56%", width: 9, height: 9, animationDelay: "-4s" }}
      />
      <span
        className="src-dot"
        style={{
          left: "16%",
          top: "86%",
          width: 6,
          height: 6,
          background: "var(--accent)",
          animationDelay: "-3.4s",
        }}
      />
      <span
        className="src-dot"
        style={{ left: "78%", top: "14%", width: 7, height: 7, animationDelay: "-1.2s" }}
      />
      <div className="src-spot" />

      <div className="src-stage" ref={stageRef}>
        {/* the source document, sitting a little behind and to the left */}
        <div className="src-doc">
          <div className="src-doc-head">
            <FileText aria-hidden="true" />
            <span>Thermodynamics, lecture 04</span>
          </div>
          <div className="src-bar" style={{ width: "92%" }} />
          <p className={`src-hl${s.hl1 ? " on" : ""}`}>
            {PASSAGES[0].text}
            <span className="src-pg">{PASSAGES[0].page}</span>
          </p>
          <div className="src-bar" style={{ width: "84%" }} />
          <p className={`src-hl${s.hl2 ? " on" : ""}`}>
            {PASSAGES[1].text}
            <span className="src-pg">{PASSAGES[1].page}</span>
          </p>
          <div className="src-bar" style={{ width: "70%" }} />
        </div>

        {/* the answer, closer to the viewer, typing itself in */}
        <div className={`src-ans${s.verified ? " verified" : ""}`}>
          <div className="src-ans-head">
            <Sparkles aria-hidden="true" />
            <span>Answer from your notes</span>
          </div>
          <div className="src-rail" aria-hidden="true">
            <span
              className={s.verified ? "done" : ""}
              style={{ transform: `scaleX(${progress})` }}
            />
          </div>
          <p className="src-t">
            {head}
            {!s.chip1 && !s.verified && <span className="src-caret" />}
            <span className={`src-chip${s.chip1 ? " on" : ""}`}>1</span>
            {tail}
            {s.chip1 && !s.verified && <span className="src-caret" />}
            <span className={`src-chip${s.chip2 ? " on" : ""}`}>2</span>
          </p>
          <div className={`src-verified${s.verified ? " on" : ""}`}>
            <CheckCircle2 aria-hidden="true" />
            <span>2 of 2 claims verified</span>
          </div>
        </div>
      </div>
    </div>
  );
}
