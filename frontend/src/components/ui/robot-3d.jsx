import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ── theme-aware palettes ─────────────────────────────────── */
const DARK = {
  base:   '#161e2c',
  plate:  '#1e2b3e',
  deep:   '#0a1018',
  edge:   '#28374e',
  helmet: '#1a2c1a',   // very dark green helmet in dark mode
  visor:  '#00e0c0',
  glow:   '#57C5B6',
  metal:  '#2e3d50',
}
const LIGHT = {
  base:   '#3a5220',   // olive drab body
  plate:  '#4a6628',   // military green plate
  deep:   '#1e300e',   // dark green recess
  edge:   '#5c7a34',   // lighter olive edge
  helmet: '#4d6b24',   // bright military green helmet
  visor:  '#00e0c0',   // eyes always teal
  glow:   '#57C5B6',
  metal:  '#5a7030',
}

const ROOT_Y = -5.8

/* ── primitive helpers ────────────────────────────────────── */
function B({ p, s, c, m = 0.86, r = 0.12, em, ei = 0, rot = [0,0,0] }) {
  return (
    <mesh position={p} rotation={rot}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} metalness={m} roughness={r}
        emissive={em ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}
function Cy({ p, a, c, m = 0.86, r = 0.12, em, ei = 0, rot = [0,0,0] }) {
  return (
    <mesh position={p} rotation={rot}>
      <cylinderGeometry args={a} />
      <meshStandardMaterial color={c} metalness={m} roughness={r}
        emissive={em ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}
function Sp({ p, r, c, m = 0.92, rg = 0.08, em, ei = 0 }) {
  return (
    <mesh position={p}>
      <sphereGeometry args={[r, 32, 32]} />
      <meshStandardMaterial color={c} metalness={m} roughness={rg}
        emissive={em ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}
function Cap({ p, r, len, c, m = 0.86, rg = 0.12, em, ei = 0, rot = [0,0,0] }) {
  return (
    <mesh position={p} rotation={rot}>
      <capsuleGeometry args={[r, len, 10, 32]} />
      <meshStandardMaterial color={c} metalness={m} roughness={rg}
        emissive={em ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}

/* ── cable / wire muscle ─────────────────────────────────── */
function Cable({ pts, radius = 0.013, c = '#1a1e1a', em, ei = 0 }) {
  const curve = useMemo(() =>
    new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)))
  , [])
  return (
    <mesh>
      <tubeGeometry args={[curve, 18, radius, 6, false]} />
      <meshStandardMaterial color={c} metalness={0.75} roughness={0.28}
        emissive={em ?? '#000'} emissiveIntensity={ei} />
    </mesh>
  )
}

/* ── robot ────────────────────────────────────────────────── */
function Soldier({ isDark }) {
  const C = isDark ? DARK : LIGHT

  const root      = useRef()
  const headGrp   = useRef()
  const eyeL      = useRef()
  const eyeR      = useRef()
  const armL      = useRef()
  const armR      = useRef()
  const chestCore = useRef()
  const coreRing  = useRef()

  useFrame(({ clock, pointer }) => {
    const e = clock.getElapsedTime()

    root.current.position.y = ROOT_Y + Math.sin(e * 0.65) * 0.14

    const bodyTarget = Math.sin(e * 0.22) * 0.1 + pointer.x * 0.26
    root.current.rotation.y += (bodyTarget - root.current.rotation.y) * 0.032

    headGrp.current.rotation.y += (pointer.x * 0.6   - headGrp.current.rotation.y) * 0.07
    headGrp.current.rotation.x += (-pointer.y * 0.28 - headGrp.current.rotation.x) * 0.07

    const proximity = Math.max(0, 1 - Math.hypot(pointer.x, pointer.y))
    const eyeGlow   = 9.0 + Math.sin(e * 1.9) * 2.5 + proximity * 7.0
    eyeL.current.material.emissiveIntensity = eyeGlow
    eyeR.current.material.emissiveIntensity = eyeGlow

    coreRing.current.rotation.z = e * 1.4
    chestCore.current.material.emissiveIntensity = 2.0 + Math.sin(e * 2.5) * 0.9

    armL.current.rotation.x =  Math.sin(e * 0.6) * 0.05
    armR.current.rotation.x = -Math.sin(e * 0.6) * 0.05
  })

  return (
    <group ref={root} position={[0, ROOT_Y, 0]} scale={2.8}>

      {/* ═══ TACTICAL HELMET + FULL-FACE VISOR + GEAR ═══════ */}
      <group ref={headGrp} position={[0, 2.72, 0]}>

        {/* ── Helmet shell — FAST/Ops-Core style ── */}
        <Cap p={[0, 0.06, 0]}    r={0.335} len={0.16} c={C.helmet} m={0.72} rg={0.26} />
        {/* Front brim plate */}
        <B   p={[0, 0.06, 0.30]} s={[0.64, 0.30, 0.09]} c={C.helmet} />
        {/* Ear guards */}
        <B   p={[-0.36, -0.04, 0]} s={[0.10, 0.38, 0.40]} c={C.helmet} />
        <B   p={[ 0.36, -0.04, 0]} s={[0.10, 0.38, 0.40]} c={C.helmet} />
        {/* Rear brim */}
        <B   p={[0, 0.04, -0.30]} s={[0.58, 0.24, 0.08]} c={C.helmet} />

        {/* ── Picatinny side rails ── */}
        <B p={[-0.38, 0.07, 0.0]} s={[0.04, 0.07, 0.38]} c={C.metal} m={0.95} r={0.05} />
        <B p={[ 0.38, 0.07, 0.0]} s={[0.04, 0.07, 0.38]} c={C.metal} m={0.95} r={0.05} />
        {[-0.14, -0.06, 0.02, 0.10].map((z, i) => (
          <group key={i}>
            <B p={[-0.40, 0.07, z]} s={[0.025, 0.04, 0.018]} c={C.edge} />
            <B p={[ 0.40, 0.07, z]} s={[0.025, 0.04, 0.018]} c={C.edge} />
          </group>
        ))}
        {/* Top rail */}
        <B p={[0, 0.33, 0.04]} s={[0.07, 0.04, 0.38]} c={C.metal} m={0.95} r={0.05} />
        {[-0.12, -0.02, 0.08, 0.18].map((z, i) => (
          <B key={i} p={[0, 0.35, z]} s={[0.04, 0.025, 0.018]} c={C.edge} />
        ))}

        {/* ── NVG (Night Vision) mount system ── */}
        {/* Base plate on forehead */}
        <B p={[0, 0.21, 0.30]} s={[0.24, 0.09, 0.07]} c={C.metal} m={0.95} r={0.05} />
        {/* Pivot arm extending forward */}
        <B p={[0, 0.19, 0.42]} s={[0.07, 0.045, 0.26]} c={C.metal} m={0.95} r={0.05} />
        {/* NVG housing bridge */}
        <B p={[0, 0.19, 0.55]} s={[0.30, 0.11, 0.09]} c={C.deep} m={0.85} r={0.12} />
        {/* Left NVG tube — cylinder pointing forward (rot π/2 on X) */}
        <Cy p={[-0.095, 0.19, 0.62]} a={[0.042, 0.042, 0.18, 12]} c={C.deep} rot={[1.5708,0,0]} />
        <Cy p={[ 0.095, 0.19, 0.62]} a={[0.042, 0.042, 0.18, 12]} c={C.deep} rot={[1.5708,0,0]} />
        {/* NVG front lenses — green glow */}
        <Sp p={[-0.095, 0.19, 0.715]} r={0.038} c="#00ff55" m={0.1} rg={0.2} em="#00ff55" ei={2.2} />
        <Sp p={[ 0.095, 0.19, 0.715]} r={0.038} c="#00ff55" m={0.1} rg={0.2} em="#00ff55" ei={2.2} />
        {/* NVG rear eyepieces */}
        <Sp p={[-0.095, 0.19, 0.545]} r={0.028} c={C.metal} m={0.95} rg={0.05} />
        <Sp p={[ 0.095, 0.19, 0.545]} r={0.028} c={C.metal} m={0.95} rg={0.05} />

        {/* ── Scope / Rangefinder — top-left rail ── */}
        {/* Scope body */}
        <B   p={[-0.10, 0.40, 0.06]} s={[0.16, 0.10, 0.28]} c={C.deep} m={0.85} r={0.10} />
        {/* Scope tube — forward objective */}
        <Cy  p={[-0.10, 0.40, 0.24]} a={[0.038, 0.038, 0.12, 12]} c={C.deep} rot={[1.5708,0,0]} />
        {/* Objective lens glow */}
        <Sp  p={[-0.10, 0.40, 0.31]} r={0.032} c="#ff4400" m={0.1} rg={0.2} em="#ff4400" ei={1.6} />
        {/* Rear eyepiece */}
        <Cy  p={[-0.10, 0.40, -0.08]} a={[0.028, 0.028, 0.08, 12]} c={C.metal} rot={[1.5708,0,0]} />
        {/* Elevation/windage dials */}
        <Cy  p={[-0.04, 0.46, 0.05]} a={[0.022, 0.022, 0.06, 10]} c={C.metal} rot={[0,0,0]} />
        <Cy  p={[-0.17, 0.42, 0.05]} a={[0.018, 0.018, 0.05, 10]} c={C.metal} rot={[0,0,1.5708]} />

        {/* ── Camera module — right side rail ── */}
        {/* Camera arm */}
        <B   p={[0.41, 0.10, 0.12]} s={[0.10, 0.04, 0.04]} c={C.metal} />
        {/* Camera body */}
        <B   p={[0.52, 0.10, 0.12]} s={[0.12, 0.09, 0.11]} c={C.deep} m={0.8} r={0.12} />
        {/* Camera lens */}
        <Cy  p={[0.585, 0.10, 0.12]} a={[0.030, 0.030, 0.04, 12]} c="#0a0a12" rot={[0,0,1.5708]} />
        {/* Lens blue glow */}
        <Sp  p={[0.608, 0.10, 0.12]} r={0.020} c="#4488ff" m={0.1} rg={0.1} em="#4488ff" ei={1.8} />
        {/* Record indicator */}
        <Sp  p={[0.524, 0.155, 0.12]} r={0.012} c="#ff2200" m={0.2} rg={0.3} em="#ff2200" ei={2.5} />

        {/* ── Scanner / Sensor array — left side ── */}
        <B   p={[-0.44, 0.04, 0.10]} s={[0.09, 0.12, 0.14]} c={C.deep} m={0.82} r={0.12} />
        {/* Scanner emitter dots */}
        <Sp  p={[-0.50, 0.08, 0.14]} r={0.016} c={C.glow} em={C.glow} ei={2.2} />
        <Sp  p={[-0.50, 0.00, 0.14]} r={0.016} c={C.glow} em={C.glow} ei={2.2} />
        <Sp  p={[-0.50, 0.08, 0.06]} r={0.016} c={C.glow} em={C.glow} ei={2.2} />
        <Sp  p={[-0.50, 0.00, 0.06]} r={0.016} c={C.glow} em={C.glow} ei={2.2} />
        {/* Scanner bar light */}
        <B   p={[-0.502, 0.04, 0.10]} s={[0.008, 0.09, 0.10]} c={C.glow} em={C.glow} ei={1.2} />

        {/* ── Comms antenna — rear right ── */}
        <Cy  p={[0.24, 0.38, -0.20]} a={[0.013, 0.010, 0.40, 8]} c={C.metal} m={0.9} r={0.1} />
        <Sp  p={[0.24, 0.585, -0.20]} r={0.018} c={C.glow} em={C.glow} ei={3.0} />

        {/* ── HUD status strip above visor ── */}
        <B   p={[0, 0.165, 0.345]} s={[0.44, 0.022, 0.012]} c={C.glow} em={C.glow} ei={1.4} />
        {/* HUD tick marks */}
        {[-0.16, -0.08, 0, 0.08, 0.16].map((x, i) => (
          <B key={i} p={[x, 0.165, 0.350]} s={[0.008, 0.03, 0.008]} c={C.glow} em={C.glow} ei={1.0} />
        ))}

        {/* ── Eyes — glow behind visor ── */}
        <mesh position={[-0.135, 0.01, 0.30]} ref={eyeL}>
          <boxGeometry args={[0.115, 0.065, 0.010]} />
          <meshStandardMaterial color={C.visor} emissive={C.visor}
            emissiveIntensity={9.0} metalness={0.1} roughness={0.05} />
        </mesh>
        <mesh position={[0.135, 0.01, 0.30]} ref={eyeR}>
          <boxGeometry args={[0.115, 0.065, 0.010]} />
          <meshStandardMaterial color={C.visor} emissive={C.visor}
            emissiveIntensity={9.0} metalness={0.1} roughness={0.05} />
        </mesh>

        {/* Full-face tinted visor — dark glass */}
        <mesh position={[0, -0.015, 0.326]}>
          <boxGeometry args={[0.67, 0.44, 0.028]} />
          <meshStandardMaterial
            color="#011018" emissive="#00e0c0" emissiveIntensity={0.55}
            metalness={0.06} roughness={0.04}
            transparent opacity={0.62} depthWrite={false} />
        </mesh>
        {/* Visor outer frame */}
        <B p={[0, -0.015, 0.342]} s={[0.71, 0.48, 0.018]} c={C.edge} m={0.9} r={0.08} />

        {/* Chin guard */}
        <B p={[0, -0.315, 0.24]} s={[0.54, 0.17, 0.28]} c={C.helmet} />

        {/* Neck collar */}
        <B p={[0, -0.47, 0]} s={[0.46, 0.08, 0.40]} c={C.edge} />
      </group>

      {/* ═══ NECK ═══════════════════════════════════════════ */}
      <Cy p={[0, 2.31, 0]} a={[0.11, 0.14, 0.24, 16]} c={C.deep} />

      {/* ═══ TORSO — human-shaped, tapered ════════════════ */}
      <Cap p={[0, 1.72, 0]} r={0.42} len={0.62} c={C.plate} m={0.72} rg={0.24} />
      <B p={[-0.32, 1.88, 0.32]} s={[0.38, 0.42, 0.07]} c={C.edge}
         rot={[0, 0.14, 0]} m={0.9} r={0.09} />
      <B p={[ 0.32, 1.88, 0.32]} s={[0.38, 0.42, 0.07]} c={C.edge}
         rot={[0,-0.14, 0]} m={0.9} r={0.09} />
      <B p={[0, 1.36, 0]} s={[0.90, 0.46, 0.58]} c={C.base} />
      <B p={[0, 1.00, 0]} s={[0.78, 0.46, 0.52]} c={C.plate} />
      <B p={[0, 0.66, 0]} s={[0.66, 0.40, 0.46]} c={C.base} />
      <B p={[0, 0.40, 0]} s={[0.56, 0.26, 0.40]} c={C.deep} />

      {/* Chest core */}
      <mesh position={[0, 1.90, 0.355]} ref={chestCore}>
        <boxGeometry args={[0.21, 0.13, 0.01]} />
        <meshStandardMaterial color={C.glow} emissive={C.glow}
          emissiveIntensity={2} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.90, 0.362]} ref={coreRing}>
        <torusGeometry args={[0.077, 0.013, 8, 32]} />
        <meshStandardMaterial color={C.visor} emissive={C.visor}
          emissiveIntensity={3} metalness={0.4} roughness={0.3} />
      </mesh>
      {[0.055, 0, -0.055].map((dy, i) => (
        <mesh key={i} position={[0, 1.80 + dy, 0.355]}>
          <boxGeometry args={[0.15, 0.009, 0.004]} />
          <meshStandardMaterial color={C.glow} emissive={C.glow} emissiveIntensity={1.4} />
        </mesh>
      ))}

      <B p={[-0.54, 1.82, 0.28]} s={[0.055, 0.54, 0.055]} c={C.edge} em={C.glow} ei={0.42} />
      <B p={[ 0.54, 1.82, 0.28]} s={[0.055, 0.54, 0.055]} c={C.edge} em={C.glow} ei={0.42} />
      <B p={[0, 2.18, 0.30]} s={[0.92, 0.065, 0.17]} c={C.edge} />

      {[1.36, 1.20, 1.04, 0.88].map((y, i) => (
        <B key={i} p={[0, y, 0.285]} s={[0.60 - i * 0.04, 0.075, 0.04]} c={C.plate} />
      ))}

      <B p={[0, 0.27, 0]} s={[0.68, 0.095, 0.42]} c={C.edge} />
      <B p={[0, 0.27, 0.23]} s={[0.07, 0.065, 0.02]} c={C.metal} m={0.95} r={0.05} />
      <B p={[0, 0.27, 0.23]} s={[0.60, 0.018, 0.01]} c={C.glow} em={C.glow} ei={0.85} />

      <B p={[0, 1.60, -0.32]} s={[0.92, 0.90, 0.06]} c={C.plate} />
      <B p={[0, 1.08, -0.29]} s={[0.76, 0.56, 0.06]} c={C.base} />

      {/* ═══ SHOULDERS ══════════════════════════════════════ */}
      {[[-1, -0.70], [1, 0.70]].map(([side, sx], i) => (
        <group key={i} position={[sx, 2.12, 0]}>
          <Cap p={[side * 0.09, -0.07, 0]} r={0.195} len={0.24}
               c={C.plate} m={0.78} rg={0.2} rot={[0, 0, side * 0.18]} />
          <B p={[side * 0.14, -0.26, 0.02]} s={[0.28, 0.1, 0.50]} c={C.edge} />
          <Sp p={[0, -0.04, 0]} r={0.17} c={C.deep} m={0.95} rg={0.05} />
          <B p={[side * 0.29, 0.0, 0.27]} s={[0.028, 0.22, 0.02]}
             c={C.glow} em={C.glow} ei={1.9} />
        </group>
      ))}

      {/* ═══ LEFT ARM ═══════════════════════════════════════ */}
      <group ref={armL} position={[-0.73, 1.83, 0]}>
        <Cap p={[0, -0.32, 0]} r={0.138} len={0.46} c={C.base} m={0.8} rg={0.2} />
        <Sp p={[0, -0.60, 0]} r={0.138} c={C.deep} m={0.95} rg={0.05} />
        <Cap p={[0, -0.94, 0]} r={0.118} len={0.50} c={C.base} m={0.8} rg={0.2} />
        <B p={[0, -0.94, 0.125]} s={[0.185, 0.44, 0.05]} c={C.plate} />
        <B p={[0, -0.94, 0.155]} s={[0.07, 0.32, 0.02]} c={C.glow} em={C.glow} ei={0.9} />
        <Cy p={[0, -1.22, 0]} a={[0.092, 0.10, 0.10, 16]} c={C.edge} />
        <B p={[0, -1.38, 0.02]} s={[0.22, 0.19, 0.20]} c={C.deep} />
        {/* ── Bicep cable bundle ── */}
        <Cable pts={[[ 0.00,  0.00,  0.15],[ 0.04, -0.25,  0.24],[ 0.00, -0.54,  0.16]]} radius={0.045} c="#1c221c" />
        <Cable pts={[[ 0.09, -0.02,  0.12],[ 0.13, -0.26,  0.20],[ 0.08, -0.53,  0.13]]} radius={0.036} c="#222922" />
        <Cable pts={[[-0.12, -0.02,  0.09],[-0.18, -0.26,  0.11],[-0.13, -0.53,  0.08]]} radius={0.032} c="#1a1f1a" />
        <Cable pts={[[ 0.04,  0.01,  0.14],[ 0.06, -0.28,  0.19],[ 0.03, -0.54,  0.14]]} radius={0.022} c={C.glow} em={C.glow} ei={0.60} />
        {/* ── Tricep rear bundle ── */}
        <Cable pts={[[ 0.00,  0.00, -0.13],[ 0.00, -0.27, -0.21],[ 0.00, -0.54, -0.14]]} radius={0.040} c="#1c221c" />
        <Cable pts={[[-0.09,  0.00, -0.10],[-0.13, -0.26, -0.15],[-0.09, -0.53, -0.10]]} radius={0.030} c="#222922" />
        <Cable pts={[[ 0.09,  0.00, -0.10],[ 0.13, -0.26, -0.15],[ 0.09, -0.53, -0.10]]} radius={0.028} c="#1a1f1a" />
        {/* ── Forearm cable bundle ── */}
        <Cable pts={[[ 0.00, -0.62,  0.13],[ 0.03, -0.89,  0.17],[ 0.00, -1.17,  0.13]]} radius={0.038} c="#1c221c" />
        <Cable pts={[[-0.08, -0.62,  0.10],[-0.11, -0.87,  0.13],[-0.08, -1.16,  0.10]]} radius={0.030} c="#222922" />
        <Cable pts={[[ 0.07, -0.61,  0.09],[ 0.09, -0.88,  0.11],[ 0.06, -1.16,  0.09]]} radius={0.020} c={C.glow} em={C.glow} ei={0.50} />
        <Cable pts={[[ 0.00, -0.62, -0.11],[ 0.01, -0.89, -0.14],[ 0.00, -1.16, -0.11]]} radius={0.030} c="#1a1f1a" />
      </group>

      {/* ═══ RIGHT ARM ══════════════════════════════════════ */}
      <group ref={armR} position={[0.73, 1.83, 0]}>
        <Cap p={[0, -0.32, 0]} r={0.138} len={0.46} c={C.base} m={0.8} rg={0.2} />
        <Sp p={[0, -0.60, 0]} r={0.138} c={C.deep} m={0.95} rg={0.05} />
        <Cap p={[0, -0.94, 0]} r={0.118} len={0.50} c={C.base} m={0.8} rg={0.2} />
        <B p={[0, -0.94, 0.125]} s={[0.185, 0.44, 0.05]} c={C.plate} />
        <B p={[0, -0.94, 0.155]} s={[0.07, 0.32, 0.02]} c={C.glow} em={C.glow} ei={0.9} />
        <Cy p={[0, -1.22, 0]} a={[0.092, 0.10, 0.10, 16]} c={C.edge} />
        <B p={[0, -1.38, 0.02]} s={[0.22, 0.19, 0.20]} c={C.deep} />
        {/* ── Bicep cable bundle ── */}
        <Cable pts={[[ 0.00,  0.00,  0.15],[-0.04, -0.25,  0.24],[ 0.00, -0.54,  0.16]]} radius={0.045} c="#1c221c" />
        <Cable pts={[[-0.09, -0.02,  0.12],[-0.13, -0.26,  0.20],[-0.08, -0.53,  0.13]]} radius={0.036} c="#222922" />
        <Cable pts={[[ 0.12, -0.02,  0.09],[ 0.18, -0.26,  0.11],[ 0.13, -0.53,  0.08]]} radius={0.032} c="#1a1f1a" />
        <Cable pts={[[-0.04,  0.01,  0.14],[-0.06, -0.28,  0.19],[-0.03, -0.54,  0.14]]} radius={0.022} c={C.glow} em={C.glow} ei={0.60} />
        {/* ── Tricep rear bundle ── */}
        <Cable pts={[[ 0.00,  0.00, -0.13],[ 0.00, -0.27, -0.21],[ 0.00, -0.54, -0.14]]} radius={0.040} c="#1c221c" />
        <Cable pts={[[ 0.09,  0.00, -0.10],[ 0.13, -0.26, -0.15],[ 0.09, -0.53, -0.10]]} radius={0.030} c="#222922" />
        <Cable pts={[[-0.09,  0.00, -0.10],[-0.13, -0.26, -0.15],[-0.09, -0.53, -0.10]]} radius={0.028} c="#1a1f1a" />
        {/* ── Forearm cable bundle ── */}
        <Cable pts={[[ 0.00, -0.62,  0.13],[-0.03, -0.89,  0.17],[ 0.00, -1.17,  0.13]]} radius={0.038} c="#1c221c" />
        <Cable pts={[[ 0.08, -0.62,  0.10],[ 0.11, -0.87,  0.13],[ 0.08, -1.16,  0.10]]} radius={0.030} c="#222922" />
        <Cable pts={[[-0.07, -0.61,  0.09],[-0.09, -0.88,  0.11],[-0.06, -1.16,  0.09]]} radius={0.020} c={C.glow} em={C.glow} ei={0.50} />
        <Cable pts={[[ 0.00, -0.62, -0.11],[-0.01, -0.89, -0.14],[ 0.00, -1.16, -0.11]]} radius={0.030} c="#1a1f1a" />
      </group>

      {/* ═══ NECK cables ════════════════════════════════════ */}
      <Cable pts={[[-0.13, 2.16, 0.14],[-0.17, 2.30, 0.18],[-0.12, 2.45, 0.12]]} radius={0.055} c="#1c221c" />
      <Cable pts={[[ 0.13, 2.16, 0.14],[ 0.17, 2.30, 0.18],[ 0.12, 2.45, 0.12]]} radius={0.055} c="#1c221c" />
      <Cable pts={[[-0.18, 2.17, 0.08],[-0.22, 2.29, 0.10],[-0.16, 2.43, 0.07]]} radius={0.042} c="#222922" />
      <Cable pts={[[ 0.18, 2.17, 0.08],[ 0.22, 2.29, 0.10],[ 0.16, 2.43, 0.07]]} radius={0.042} c="#222922" />
      <Cable pts={[[-0.08, 2.16, 0.12],[-0.10, 2.31, 0.15],[-0.07, 2.44, 0.11]]} radius={0.030} c="#1a2018" />
      <Cable pts={[[ 0.08, 2.16, 0.12],[ 0.10, 2.31, 0.15],[ 0.07, 2.44, 0.11]]} radius={0.030} c="#1a2018" />
      <Cable pts={[[-0.09, 2.17, 0.13],[-0.08, 2.32, 0.16],[-0.06, 2.45, 0.12]]} radius={0.020} c={C.glow} em={C.glow} ei={0.65} />
      <Cable pts={[[ 0.09, 2.17, 0.13],[ 0.08, 2.32, 0.16],[ 0.06, 2.45, 0.12]]} radius={0.020} c={C.glow} em={C.glow} ei={0.65} />
      <Cable pts={[[-0.14, 2.15, -0.13],[-0.18, 2.28, -0.18],[-0.13, 2.43, -0.13]]} radius={0.050} c="#1c221c" />
      <Cable pts={[[ 0.14, 2.15, -0.13],[ 0.18, 2.28, -0.18],[ 0.13, 2.43, -0.13]]} radius={0.050} c="#1c221c" />
      <Cable pts={[[-0.07, 2.15, -0.15],[-0.08, 2.29, -0.19],[-0.06, 2.43, -0.15]]} radius={0.032} c="#222922" />
      <Cable pts={[[ 0.07, 2.15, -0.15],[ 0.08, 2.29, -0.19],[ 0.06, 2.43, -0.15]]} radius={0.032} c="#222922" />

      {/* ═══ CHEST cables ═══════════════════════════════════ */}
      <Cable pts={[[-0.52, 1.93, 0.26],[-0.30, 1.91, 0.35],[-0.10, 1.91, 0.38]]} radius={0.038} c="#1c221c" />
      <Cable pts={[[-0.50, 1.80, 0.25],[-0.28, 1.78, 0.34],[-0.10, 1.78, 0.37]]} radius={0.030} c="#222922" />
      <Cable pts={[[-0.48, 1.87, 0.27],[-0.26, 1.85, 0.36],[-0.08, 1.85, 0.38]]} radius={0.018} c={C.glow} em={C.glow} ei={0.40} />
      <Cable pts={[[ 0.52, 1.93, 0.26],[ 0.30, 1.91, 0.35],[ 0.10, 1.91, 0.38]]} radius={0.038} c="#1c221c" />
      <Cable pts={[[ 0.50, 1.80, 0.25],[ 0.28, 1.78, 0.34],[ 0.10, 1.78, 0.37]]} radius={0.030} c="#222922" />
      <Cable pts={[[ 0.48, 1.87, 0.27],[ 0.26, 1.85, 0.36],[ 0.08, 1.85, 0.38]]} radius={0.018} c={C.glow} em={C.glow} ei={0.40} />
      <Cable pts={[[-0.44, 1.63, 0.28],[-0.22, 1.56, 0.33],[-0.06, 1.53, 0.35]]} radius={0.026} c="#1c221c" />
      <Cable pts={[[ 0.44, 1.63, 0.28],[ 0.22, 1.56, 0.33],[ 0.06, 1.53, 0.35]]} radius={0.026} c="#1c221c" />

      {/* ═══ SHOULDER cables ════════════════════════════════ */}
      <Cable pts={[[-0.62, 2.09, 0.11],[-0.70, 1.97, 0.09],[-0.73, 1.85, 0.07]]} radius={0.034} c="#1c221c" />
      <Cable pts={[[-0.60, 2.07, 0.06],[-0.68, 1.96, 0.04],[-0.73, 1.84, 0.03]]} radius={0.026} c="#222922" />
      <Cable pts={[[ 0.62, 2.09, 0.11],[ 0.70, 1.97, 0.09],[ 0.73, 1.85, 0.07]]} radius={0.034} c="#1c221c" />
      <Cable pts={[[ 0.60, 2.07, 0.06],[ 0.68, 1.96, 0.04],[ 0.73, 1.84, 0.03]]} radius={0.026} c="#222922" />

      {/* ═══ CLAVICLE cables ════════════════════════════════ */}
      <Cable pts={[[-0.46, 2.21, 0.26],[-0.22, 2.24, 0.33],[ 0.00, 2.24, 0.34],[ 0.22, 2.24, 0.33],[ 0.46, 2.21, 0.26]]} radius={0.040} c="#1c221c" />
      <Cable pts={[[-0.44, 2.16, 0.24],[-0.20, 2.18, 0.31],[ 0.00, 2.18, 0.32],[ 0.20, 2.18, 0.31],[ 0.44, 2.16, 0.24]]} radius={0.030} c="#222922" />
      <Cable pts={[[-0.40, 2.19, 0.28],[-0.18, 2.21, 0.34],[ 0.00, 2.21, 0.35],[ 0.18, 2.21, 0.34],[ 0.40, 2.19, 0.28]]} radius={0.018} c={C.glow} em={C.glow} ei={0.70} />
      <Cable pts={[[-0.42, 2.24, 0.22],[-0.18, 2.27, 0.28],[ 0.00, 2.27, 0.29],[ 0.18, 2.27, 0.28],[ 0.42, 2.24, 0.22]]} radius={0.024} c="#1a1f1a" />

      {/* ═══ SHOULDER → HEAD cables ═════════════════════════ */}
      <Cable pts={[[-0.70, 2.16, 0.24],[-0.55, 1.94, 0.22],[-0.40, 1.78, 0.19],[-0.24, 1.96, 0.15],[-0.14, 2.54, 0.13]]} radius={0.038} c="#1c221c" />
      <Cable pts={[[-0.72, 2.14, 0.10],[-0.57, 1.92, 0.09],[-0.42, 1.76, 0.07],[-0.25, 1.94, 0.06],[-0.16, 2.52, 0.06]]} radius={0.032} c="#222922" />
      <Cable pts={[[-0.66, 2.13, 0.18],[-0.52, 1.91, 0.17],[-0.38, 1.77, 0.15],[-0.22, 1.95, 0.12],[-0.12, 2.53, 0.11]]} radius={0.020} c={C.glow} em={C.glow} ei={0.55} />
      <Cable pts={[[ 0.70, 2.16, 0.24],[ 0.55, 1.94, 0.22],[ 0.40, 1.78, 0.19],[ 0.24, 1.96, 0.15],[ 0.14, 2.54, 0.13]]} radius={0.038} c="#1c221c" />
      <Cable pts={[[ 0.72, 2.14, 0.10],[ 0.57, 1.92, 0.09],[ 0.42, 1.76, 0.07],[ 0.25, 1.94, 0.06],[ 0.16, 2.52, 0.06]]} radius={0.032} c="#222922" />
      <Cable pts={[[ 0.66, 2.13, 0.18],[ 0.52, 1.91, 0.17],[ 0.38, 1.77, 0.15],[ 0.22, 1.95, 0.12],[ 0.12, 2.53, 0.11]]} radius={0.020} c={C.glow} em={C.glow} ei={0.55} />

      {/* ═══ BACK → HEAD cables ═════════════════════════════ */}
      <Cable pts={[[-0.22, 1.80, -0.30],[-0.24, 2.10, -0.33],[-0.20, 2.44, -0.30],[-0.12, 2.58, -0.22]]} radius={0.040} c="#1c221c" />
      <Cable pts={[[ 0.00, 1.82, -0.33],[ 0.00, 2.14, -0.36],[ 0.00, 2.46, -0.32],[ 0.00, 2.60, -0.24]]} radius={0.036} c="#222922" />
      <Cable pts={[[ 0.22, 1.80, -0.30],[ 0.24, 2.10, -0.33],[ 0.20, 2.44, -0.30],[ 0.12, 2.58, -0.22]]} radius={0.040} c="#1c221c" />
      <Cable pts={[[ 0.04, 1.82, -0.31],[ 0.04, 2.15, -0.34],[ 0.03, 2.47, -0.30],[ 0.02, 2.61, -0.23]]} radius={0.018} c={C.glow} em={C.glow} ei={0.60} />

      {/* ═══ HIPS ═══════════════════════════════════════════ */}
      <B p={[0, 0.12, 0]} s={[0.80, 0.18, 0.52]} c={C.plate} />
      <B p={[0, 0.03, 0.27]} s={[0.70, 0.018, 0.01]} c={C.glow} em={C.glow} ei={0.88} />

    </group>
  )
}

/* ── particles ────────────────────────────────────────────── */
function Particles({ count = 90 }) {
  const ref = useRef()
  const { positions, speeds } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const speeds    = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 8
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6
      speeds[i] = 0.08 + Math.random() * 0.22
    }
    return { positions, speeds }
  }, [count])

  useFrame(({ clock }) => {
    const t   = clock.getElapsedTime()
    const pos = ref.current.geometry.attributes.position.array
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += speeds[i] * 0.008
      if (pos[i * 3 + 1] > 5) pos[i * 3 + 1] = -5
    }
    ref.current.geometry.attributes.position.needsUpdate = true
    ref.current.material.opacity = 0.30 + Math.sin(t * 0.8) * 0.06
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.055} color="#57C5B6" transparent opacity={0.32} sizeAttenuation />
    </points>
  )
}

/* ── canvas export ────────────────────────────────────────── */
export function Robot3DScene() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  return (
    <Canvas
      camera={{ position: [0, 0.6, 9.5], fov: 56 }}
      gl={{ antialias: true, alpha: true }}
      style={{ position: 'absolute', inset: 0, background: 'transparent' }}
    >
      <ambientLight intensity={0.12} color="#b8d4f0" />
      <directionalLight position={[2, 6, 4]}   intensity={2.6} color="#ffffff" />
      <directionalLight position={[-3, 1, -4]} intensity={0.9} color="#4466aa" />
      <directionalLight position={[-4, 2, 3]}  intensity={0.5} color="#aaccff" />
      <pointLight position={[0, 2.0, 2.2]}  intensity={3.2} color="#57C5B6" distance={7} />
      <pointLight position={[0, -1.0, 1.0]} intensity={0.8} color="#57C5B6" distance={5} />

      <Soldier key={isDark ? 'dark' : 'light'} isDark={isDark} />
      <Particles count={90} />
    </Canvas>
  )
}
