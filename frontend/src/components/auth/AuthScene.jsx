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

/* ------------------------------------------------------------------ */
/*  Central flashcard — question <-> cited answer                       */
/* ------------------------------------------------------------------ */
function Flashcard({ mode, dark, lit }) {
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

  useFrame((_, delta) => {
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
    angle.current = THREE.MathUtils.damp(angle.current, target, 3.1, dt);
    if (group.current) group.current.rotation.y = angle.current;
  });

  return (
    <group position={[0, 0, 0]}>
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
function Particles({ count = 120 }) {
  const dot = useMemo(makeDot, []);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 2] = -0.6 - Math.random() * 3.2;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);

  const seeds = useMemo(
    () => Float32Array.from({ length: count }, () => Math.random() * Math.PI * 2),
    [count]
  );

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.06,
        map: dot,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    [dot]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
      dot.dispose();
    },
    [geometry, material, dot]
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const attr = geometry.getAttribute("position");
    for (let i = 0; i < count; i++) {
      attr.array[i * 3 + 1] += Math.sin(t * 0.35 + seeds[i]) * 0.0015;
      attr.array[i * 3] += Math.cos(t * 0.27 + seeds[i]) * 0.0011;
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

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const aspect = Math.max(0.35, size.width / Math.max(1, size.height));
    // fit: horizontal half-extent >= 2.35 world units, vertical >= 1.30
    const base = Math.max(1.3 / HALF_TAN, 2.35 / (HALF_TAN * aspect));
    const wantZ = base + dz;

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
    phaseRef.current += Math.min(delta, 0.05) * 0.22 * speedRef.value;
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
  useEffect(
    () => () => {
      glowA.dispose();
      glowB.dispose();
    },
    [glowA, glowB]
  );

  return (
    <group>
      <ambientLight intensity={0.95} />
      <directionalLight position={[1.5, 3.5, 4]} intensity={1.1} color="#fff8ee" />
      <pointLight position={[-3.4, 2.2, 3]} intensity={28} distance={16} color="#7c79cc" />
      <pointLight position={[3.4, -1.8, 2.4]} intensity={24} distance={16} color="#ffa3c6" />

      {/* soft brand-coloured bloom behind everything */}
      <sprite position={[-1.7, 0.55, -3]} scale={[7, 7, 1]}>
        <spriteMaterial
          map={glowA}
          transparent
          opacity={0.58}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite position={[1.9, -0.9, -3]} scale={[6, 6, 1]}>
        <spriteMaterial
          map={glowB}
          transparent
          opacity={0.46}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
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

      <Particles />
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
