/**
 * Ambient sound mixer — generated in-browser with WebAudio (no assets).
 * Restores the prototype's ambient music, upgraded to a multi-channel mixer
 * with saved volume levels in localStorage.
 */
import { useEffect, useRef, useState } from "react";

const CHANNELS = [
  { id: "rain", label: "Rain", desc: "Soft filtered noise" },
  { id: "white", label: "White noise", desc: "Steady hiss" },
  { id: "drone", label: "Drone", desc: "Gentle sine pad" },
];

const STORAGE_KEY = "studyspace.ambient.v1";

function loadVolumes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export default function AmbientMixer() {
  const [volumes, setVolumes] = useState(() => ({ rain: 0, white: 0, drone: 0, ...loadVolumes() }));
  const ctxRef = useRef(null);
  const nodesRef = useRef({});

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(volumes));
    Object.entries(volumes).forEach(([id, v]) => {
      const gain = nodesRef.current[id]?.gain;
      if (gain) gain.gain.setTargetAtTime(v * 0.35, ctxRef.current.currentTime, 0.05);
    });
  }, [volumes]);

  const ensureGraph = () => {
    if (ctxRef.current) return ctxRef.current;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    // rain / white noise share a noise buffer with different filters
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noiseSrc = (type, freq) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(master);
      src.start();
      return { src, gain };
    };

    nodesRef.current.rain = noiseSrc("lowpass", 800);
    nodesRef.current.white = noiseSrc("highpass", 1500);

    // drone: two detuned sines
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.value = 220;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = 261.6;
    o1.connect(gain);
    o2.connect(gain);
    gain.connect(master);
    o1.start();
    o2.start();
    nodesRef.current.drone = { gain };

    ctxRef.current = ctx;
    return ctx;
  };

  const setVolume = (id, v) => {
    ensureGraph(); // first user gesture creates the graph
    if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
    setVolumes((prev) => ({ ...prev, [id]: v }));
  };

  const toggleAll = () => {
    const anyOn = Object.values(volumes).some((v) => v > 0);
    if (anyOn) {
      setVolumes({ rain: 0, white: 0, drone: 0 });
    } else {
      ensureGraph();
      if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
      setVolumes({ rain: 0.5, white: 0.2, drone: 0.3 });
    }
  };

  // stop everything on unmount
  useEffect(() => {
    return () => {
      try {
        ctxRef.current?.close();
      } catch {
        // AudioContext can throw if it was already closed by the browser.
      }
      ctxRef.current = null;
    };
  }, []);

  const anyOn = Object.values(volumes).some((v) => v > 0);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Ambient sounds</h3>
          <p className="text-xs text-muted-foreground">Mix your soundscape — levels are remembered.</p>
        </div>
        <button
          type="button"
          onClick={toggleAll}
          aria-label={anyOn ? "Mute all" : "Play all"}
          className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {anyOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {CHANNELS.map((c) => (
          <div key={c.id} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor={`vol-${c.id}`}>{c.label}</Label>
              <span className="text-[11px] text-muted-foreground">{c.desc}</span>
            </div>
            <input
              id={`vol-${c.id}`}
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volumes[c.id] ?? 0}
              onChange={(e) => setVolume(c.id, Number(e.target.value))}
              className="w-full accent-primary"
              aria-label={`${c.label} volume`}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
