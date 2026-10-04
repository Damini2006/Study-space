import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import {
  FEATURE_CARDS,
  MODE_CARD_TINT,
  createCardTextures,
  createFeatureTexture,
  paintAnswer,
} from "./scene-textures";

/* Half-angle of a 32° vertical FOV, used by the framing maths below. */
const HALF_TAN = Math.tan(THREE.MathUtils.degToRad(16));

/* Per-mode dolly. The scene never cuts — it just breathes. */
const CAM = {
  signin: [0, 0],
  signup: [0.3, 0.45],
  forgot: [-0.25, -0.3],
  reset: [-0.25, -0.3],
};

const CARD_W = 3.3;
const CARD_H = 2.08;
const RING_RX = 2.1;
const RING_RY = 1.0;
const RING_TILT = -0.85;
const RING_Z = -0.9;

/* ------------------------------------------------------------------ */
/*  Small canvas helpers                                               */
/* ------------------------------------------------------------------ */
function makeDot() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function makeGlow(stops) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([p, col]) => g.addColorStop(p, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function blurCanvas(src, px) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  return c;
}

/* Soft dark ellipse the flashcard sits on. Offset down-right so the card
   reads as lifted off the backdrop rather than floating in a void. */
function makeShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(8,7,28,0.9)");
  g.addColorStop(0.5, "rgba(8,7,28,0.4)");
  g.addColorStop(1, "rgba(8,7,28,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ */
/*  Breathing brand bloom — fades up on entry, then pulses forever      */
/* ------------------------------------------------------------------ */
function GlowSprite({ map, position, scale, opacity, speed = 1, phase = 0 }) {
  const ref = useRef();

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const intro = Math.min(1, t / 1.3);
    const pulse = 0.84 + Math.sin(t * speed + phase) * 0.16;
    const grow = 0.95 + Math.sin(t * speed * 0.63 + phase) * 0.07;
    m.material.opacity = opacity * pulse * intro;
    m.scale.set(scale[0] * grow, scale[1] * grow, 1);
  });

  return (
    <sprite ref={ref} position={position} scale={scale}>
      <spriteMaterial
        map={map}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
}

/* ------------------------------------------------------------------ */
/*  Central flashcard — question <-> cited answer                       */
/* ------------------------------------------------------------------ */
function Flashcard({ mode, dark, lit }) {
  const root = useRef();
  const group = useRef();
  const phase = useRef(0);
  const timer = useRef(0);
  const angle = useRef(0);

  const canvases = useMemo(() => createCardTextures({ mode, dark }), [mode, dark]);

  const frontTex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvases.front);
    t.anisotropy = 4;
    return t;
  }, [canvases]);

  const backTex = useMemo(() => {
    const t = new THREE.CanvasTexture(canvases.back);
    t.anisotropy = 4;
    return t;
  }, [canvases]);

  // repaint only the answer face when a citation chip lights up
  useEffect(() => {
    const tint = (MODE_CARD_TINT[mode] || MODE_CARD_TINT.signin)[dark ? "dark" : "light"];
    paintAnswer(canvases.back.getContext("2d"), {
      tint,
      dark,
      width: canvases.W,
      height: canvases.H,
      lit,
    });
    backTex.needsUpdate = true;
  }, [lit, mode, dark, canvases, backTex]);

  useEffect(
    () => () => {
      frontTex.dispose();
      backTex.dispose();
    },
    [frontTex, backTex]
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    timer.current += dt;
    if (phase.current === 0 && timer.current > 3.6) {
      phase.current = 1;
      timer.current = 0;
    } else if (phase.current === 1 && timer.current > 5.2) {
      phase.current = 0;
      timer.current = 0;
    }
    const target = phase.current === 1 ? Math.PI : 0;
    angle.current = THREE.MathUtils.damp(angle.current, target, 3.4, dt);
    if (group.current) group.current.rotation.y = angle.current;

    // Idle life: a slow bob with a hint of tilt, and the card stepping
    // forward through the middle of its own flip so the turn reads as a
    // real move through space instead of a spinning decal.
    const t = state.clock.elapsedTime;
    const r = root.current;
    if (r) {
      r.position.y = Math.sin(t * 0.62) * 0.07;
      r.position.z = Math.sin(Math.min(angle.current, Math.PI)) * 0.3;
      r.rotation.z = Math.sin(t * 0.41) * 0.022;
      r.rotation.x = Math.sin(t * 0.53 + 1.1) * 0.03;
    }
  });

  // No declarative position on the root group: everything on it is driven
  // from useFrame, so nothing can snap it back to zero mid-animation.
  return (
    <group ref={root}>
      {/* the card's body — gives the sheet real thickness */}
      <RoundedBox args={[CARD_W + 0.06, CARD_H + 0.06, 0.1]} radius={0.04} smoothness={3}>
        <meshStandardMaterial color={dark ? "#171532" : "#ffffff"} roughness={0.72} />
      </RoundedBox>
      <group ref={group}>
        <mesh position-z={0.058}>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshBasicMaterial map={frontTex} transparent />
        </mesh>
        <mesh rotation-y={Math.PI} position-z={-0.058}>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshBasicMaterial map={backTex} transparent />
        </mesh>
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Orbiting feature cards — depth of field faked per texture           */
/* ------------------------------------------------------------------ */
function OrbitCard({ index, total, dark, phaseRef }) {
  const mesh = useRef();
  const bucket = useRef(-1);

  const levels = useMemo(() => {
    const base = createFeatureTexture({ ...FEATURE_CARDS[index], dark });
    return [base, blurCanvas(base, 3), blurCanvas(base, 8)].map((c) => {
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = 4;
      return t;
    });
  }, [index, dark]);

  useEffect(
    () => () => levels.forEach((t) => t.dispose()),
    [levels]
  );

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const a = (index / total) * Math.PI * 2 + phaseRef.current;
    const s = Math.sin(a);
    m.position.set(
      Math.cos(a) * RING_RX,
      s * RING_RY * Math.cos(RING_TILT),
      RING_Z + s * RING_RY * Math.sin(RING_TILT)
    );
    m.quaternion.copy(state.camera.quaternion);

    // three blur levels stand in for depth of field (focus plane = card z 0)
    const d = Math.abs(m.position.z);
    const next = d < 0.45 ? 0 : d < 1.0 ? 1 : 2;
    if (next !== bucket.current) {
      bucket.current = next;
      m.material.map = levels[next];
      m.material.needsUpdate = true;
    }
    // distance fade sells the depth that the blur levels only hint at
    m.material.opacity = THREE.MathUtils.clamp(1.1 - d * 0.34, 0.48, 1);
  });

  return (
    <mesh ref={mesh}>
      <planeGeometry args={[1.3, 0.52]} />
      <meshBasicMaterial map={levels[0]} transparent depthWrite={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Floating particles                                                  */
/* ------------------------------------------------------------------ */
function Particles({ count = 120, size = 0.06, opacity = 0.55, speed = 1, rise = 0.12, zMin = -0.6, zDepth = 3.2 }) {
  const dot = useMemo(makeDot, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 2] = zMin - Math.random() * zDepth;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count, zMin, zDepth]);

  const seeds = useMemo(
    () => Float32Array.from({ length: count }, () => Math.random() * Math.PI * 2),
    [count]
  );

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size,
        map: dot,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    [dot, size, opacity]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      dot.dispose();
    },
    [geometry, material, dot]
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const attr = geometry.getAttribute("position");
    const a = attr.array;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      a[j] += Math.cos(t * 0.27 + seeds[i]) * 0.0011 * speed;
      a[j + 1] += Math.sin(t * 0.35 + seeds[i]) * 0.0015 * speed + rise * dt;
      if (a[j + 1] > 3.2) a[j + 1] = -3.2; // recycle off the top edge
    }
    attr.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} />;
}

/* ------------------------------------------------------------------ */
/*  Rig — framing, mode dolly and mouse parallax                        */
/* ------------------------------------------------------------------ */
function Rig({ mode, speedRef }) {
  const camera = useThree((s) => s.camera);
  const pointer = useThree((s) => s.pointer);
  const size = useThree((s) => s.size);
  const look = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  const { dx, dz } = useMemo(() => {
    const [x, z] = CAM[mode] || CAM.signin;
    return { dx: x, dz: z };
  }, [mode]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
    // fit: horizontal half-extent >= 2.35 world units, vertical >= 1.30
    const base = Math.max(1.3 / HALF_TAN, 2.35 / (HALF_TAN * aspect));
    // Entrance: start pulled back and ease in on a cubic-out over 1.8s, so
    // the panel arrives rather than simply appearing.
    const k = Math.min(1, state.clock.elapsedTime / 1.8);
    const intro = 1 - Math.pow(1 - k, 3);
    const wantZ = base + dz + (1 - intro) * 5;

    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      dx + pointer.x * 0.42,
      3.2,
      dt
    );
    camera.position.y = THREE.MathUtils.damp(camera.position.y, -pointer.y * 0.24, 3.2, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, wantZ, 3.2, dt);
    camera.lookAt(look);

    // orbit eases to a slow drift while the pointer is over the scene
    const want = speedRef.hover ? 0.3 : 1;
    speedRef.value = THREE.MathUtils.damp(speedRef.value, want, 4, dt);
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Scene                                                               */
/* ------------------------------------------------------------------ */
function Scene({ mode, dark }) {
  const speedRef = useRef({ value: 1, hover: false });
  const phaseRef = useRef(0);
  const [lit, setLit] = useState(0);
  const gl = useThree((s) => s.gl);

  // citation chips light up in sequence, then the cycle restarts
  useEffect(() => {
    setLit(0);
    const id = setInterval(() => setLit((n) => (n >= 2 ? 0 : n + 1)), 1200);
    return () => clearInterval(id);
  }, [mode]);

  useFrame((_, delta) => {
    phaseRef.current += Math.min(delta, 0.05) * 0.26 * speedRef.value;
  });

  // hover lives on the canvas element — an empty group is never hit-tested
  useEffect(() => {
    const el = gl.domElement;
    const on = () => {
      speedRef.hover = true;
    };
    const off = () => {
      speedRef.hover = false;
    };
    el.addEventListener("pointerenter", on);
    el.addEventListener("pointerleave", off);
    return () => {
      el.removeEventListener("pointerenter", on);
      el.removeEventListener("pointerleave", off);
    };
  }, [gl]);

  const glowA = useMemo(
    () =>
      makeGlow([
        [0, "rgba(124,121,204,0.85)"],
        [0.5, "rgba(124,121,204,0.28)"],
        [1, "rgba(124,121,204,0)"],
      ]),
    []
  );
  const glowB = useMemo(
    () =>
      makeGlow([
        [0, "rgba(255,163,198,0.8)"],
        [0.5, "rgba(255,163,198,0.25)"],
        [1, "rgba(255,163,198,0)"],
      ]),
    []
  );
  const shadowTex = useMemo(makeShadow, []);
  useEffect(
    () => () => {
      glowA.dispose();
      glowB.dispose();
      shadowTex.dispose();
    },
    [glowA, glowB, shadowTex]
  );

  return (
    <group>
      <ambientLight intensity={0.95} />
      <directionalLight position={[1.5, 3.5, 4]} intensity={1.1} color="#fff8ee" />
      <pointLight position={[-3.4, 2.2, 3]} intensity={28} distance={16} color="#7c79cc" />
      <pointLight position={[3.4, -1.8, 2.4]} intensity={24} distance={16} color="#ffa3c6" />

      {/* soft brand-coloured bloom behind everything, breathing on two clocks */}
      <GlowSprite
        map={glowA}
        position={[-1.7, 0.55, -3]}
        scale={[7, 7, 1]}
        opacity={0.58}
        speed={0.55}
      />
      <GlowSprite
        map={glowB}
        position={[1.9, -0.9, -3]}
        scale={[6, 6, 1]}
        opacity={0.46}
        speed={0.43}
        phase={1.9}
      />

      {/* Contact shadow: sits in front of the blooms so it darkens them
          exactly where the card would block the light, and spills past the
          card's right and bottom edges to lift it off the backdrop. */}
      <sprite position={[0.35, -0.6, -0.5]} scale={[4.4, 3, 1]}>
        <spriteMaterial
          map={shadowTex}
          transparent
          opacity={dark ? 0.5 : 0.26}
          depthWrite={false}
        />
      </sprite>

      <Flashcard mode={mode} dark={dark} lit={lit} />

      {FEATURE_CARDS.map((f, i) => (
        <OrbitCard
          key={f.label}
          index={i}
          total={FEATURE_CARDS.length}
          dark={dark}
          phaseRef={phaseRef}
        />
      ))}

      <Particles count={110} size={0.05} opacity={0.4} speed={0.8} rise={0.1} />
      <Particles
        count={42}
        size={0.115}
        opacity={0.46}
        speed={1.4}
        rise={0.2}
        zMin={-0.2}
        zDepth={1.4}
      />
      <Rig mode={mode} speedRef={speedRef} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Canvas wrapper — pauses when the tab is hidden                      */
/* ------------------------------------------------------------------ */
export default function AuthScene({ mode = "signin", dark = false }) {
  const [visible, setVisible] = useState(
    typeof document === "undefined" ? true : !document.hidden
  );

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, 2]}
      frameloop={visible ? "always" : "never"}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ fov: 32, position: [0, 0, 7], near: 0.5, far: 60 }}
      onCreated={({ gl }) => gl.setClearAlpha(0)}
    >
      <Scene mode={mode} dark={dark} />
    </Canvas>
  );
}
