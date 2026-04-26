import { useEffect, useRef } from 'react'
import { joinClasses } from '../../shared/ui/visualSystem'

export type FieldVoiceSphereSize = 'sm' | 'md' | 'lg'

/** 3× the former PulseOrb footprints (40 / 80 / 128px → 120 / 240 / 384px). */
const sizeClasses: Record<FieldVoiceSphereSize, string> = {
  sm: 'h-[120px] w-[120px]',
  md: 'h-[240px] w-[240px]',
  lg: 'h-[384px] w-[384px]',
}

const NUM_POINTS = 5200
const goldenAngle = Math.PI * (3 - Math.sqrt(5))

function makeSpherePoints() {
  const points: {
    ox: number
    oy: number
    oz: number
    _noise: number
    size: number
  }[] = []
  for (let i = 0; i < NUM_POINTS; i++) {
    const y = 1 - (i / (NUM_POINTS - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    const theta = goldenAngle * i
    points.push({
      ox: Math.cos(theta) * r,
      oy: y,
      oz: Math.sin(theta) * r,
      _noise: 0,
      size: 0.9 + Math.random() * 0.8,
    })
  }
  return points
}

const spherePoints = makeSpherePoints()

function buildPermTable() {
  const perm: number[] = []
  for (let i = 0; i < 256; i++) perm[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = perm[i]!
    perm[i] = perm[j]!
    perm[j] = tmp
  }
  const ptable = new Array<number>(512)
  for (let i = 0; i < 512; i++) ptable[i] = perm[i & 255]!
  return ptable
}

const ptable = buildPermTable()

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}
function lerp(t: number, a: number, b: number) {
  return a + t * (b - a)
}
function grad(hash: number, x: number, y: number, z: number) {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}
function noise3D(x: number, y: number, z: number) {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  const Z = Math.floor(z) & 255
  x -= Math.floor(x)
  y -= Math.floor(y)
  z -= Math.floor(z)
  const u = fade(x)
  const v = fade(y)
  const w = fade(z)
  const A = ptable[X]! + Y
  const AA = ptable[A]! + Z
  const AB = ptable[A + 1]! + Z
  const B = ptable[X + 1]! + Y
  const BA = ptable[B]! + Z
  const BB = ptable[B + 1]! + Z
  return lerp(
    w,
    lerp(
      v,
      lerp(u, grad(ptable[AA]!, x, y, z), grad(ptable[BA]!, x - 1, y, z)),
      lerp(u, grad(ptable[AB]!, x, y - 1, z), grad(ptable[BB]!, x - 1, y - 1, z)),
    ),
    lerp(
      v,
      lerp(u, grad(ptable[AA + 1]!, x, y, z - 1), grad(ptable[BA + 1]!, x - 1, y, z - 1)),
      lerp(u, grad(ptable[AB + 1]!, x, y - 1, z - 1), grad(ptable[BB + 1]!, x - 1, y - 1, z - 1)),
    ),
  )
}

/**
 * Endeavor “Take sales to space” beam: deep red → orange → white → cyan / electric → royal / near-black.
 */
const gradientStops: { t: number; r: number; g: number; b: number }[] = [
  { t: 0.0, r: 0, g: 0, b: 18 },
  { t: 0.05, r: 60, g: 0, b: 0 },
  { t: 0.11, r: 180, g: 0, b: 0 },
  { t: 0.18, r: 229, g: 0, b: 0 },
  { t: 0.28, r: 255, g: 45, b: 0 },
  { t: 0.38, r: 255, g: 120, b: 0 },
  { t: 0.46, r: 255, g: 200, b: 120 },
  { t: 0.5, r: 255, g: 255, b: 255 },
  { t: 0.55, r: 160, g: 230, b: 255 },
  { t: 0.64, r: 0, g: 180, b: 255 },
  { t: 0.76, r: 0, g: 90, b: 220 },
  { t: 0.86, r: 0, g: 25, b: 120 },
  { t: 0.95, r: 0, g: 0, b: 40 },
  { t: 1.0, r: 0, g: 0, b: 8 },
]

function sampleGradient(t: number) {
  t = Math.max(0, Math.min(1, t))
  for (let i = 0; i < gradientStops.length - 1; i++) {
    const a = gradientStops[i]!
    const b = gradientStops[i + 1]!
    if (t >= a.t && t <= b.t) {
      const s = (t - a.t) / (b.t - a.t)
      const ss = s * s * (3 - 2 * s)
      return {
        r: Math.round(lerp(ss, a.r, b.r)),
        g: Math.round(lerp(ss, a.g, b.g)),
        b: Math.round(lerp(ss, a.b, b.b)),
      }
    }
  }
  const last = gradientStops[gradientStops.length - 1]!
  return { r: last.r, g: last.g, b: last.b }
}

export interface FieldVoiceSphereProps {
  size?: FieldVoiceSphereSize
  /**
   * 0 = gentle idle; 1 = full energy ceiling when `drivePulseFromMic` is on (loud speech reaches here).
   * When `drivePulseFromMic` is off, this value is the steady pulse level.
   */
  pulseTarget: number
  /** Live `MediaStream` used to read amplitude (separate from other analyzers in the app). */
  micStream?: MediaStream | null
  /** When true, pulse intensity follows microphone RMS (requires `micStream`). */
  drivePulseFromMic?: boolean
  label?: string
  className?: string
}

/**
 * 3D point sphere with noise — pulses when `pulseTarget` is high, or follows mic level when
 * `drivePulseFromMic` is set.
 */
export function FieldVoiceSphere({
  size = 'lg',
  pulseTarget,
  micStream = null,
  drivePulseFromMic = false,
  label,
  className,
}: FieldVoiceSphereProps) {
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pulseRef = useRef(0)
  const rafRef = useRef(0)
  const rotY = useRef(0.4)
  const rotX = useRef(0.2)
  const pulseFromPropsRef = useRef(0)
  const driveFromMicRef = useRef(false)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const floatDataRef = useRef<Float32Array<ArrayBuffer> | null>(null)
  const rmsSmoothedRef = useRef(0)

  useEffect(() => {
    pulseFromPropsRef.current = Math.max(0, Math.min(1, pulseTarget))
  }, [pulseTarget])

  useEffect(() => {
    driveFromMicRef.current = !!(drivePulseFromMic && micStream)
  }, [drivePulseFromMic, micStream])

  useEffect(() => {
    if (import.meta.env.VITEST) return
    if (!drivePulseFromMic || !micStream) {
      analyserRef.current = null
      floatDataRef.current = null
      rmsSmoothedRef.current = 0
      return
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ac = new AudioCtx()
    if (ac.state === 'suspended') void ac.resume()
    const source = ac.createMediaStreamSource(micStream)
    const an = ac.createAnalyser()
    an.fftSize = 1024
    an.smoothingTimeConstant = 0.35
    source.connect(an)
    analyserRef.current = an
    floatDataRef.current = new Float32Array(an.fftSize)
    return () => {
      analyserRef.current = null
      floatDataRef.current = null
      try {
        source.disconnect()
      } catch {
        /* ignore */
      }
      void ac.close()
    }
  }, [micStream, drivePulseFromMic])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    if (import.meta.env.VITEST) return

    let ctx: CanvasRenderingContext2D | null
    try {
      ctx = canvas.getContext('2d')
    } catch {
      return
    }
    if (!ctx) return

    const resize = () => {
      const r = wrap.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.floor(r.width * dpr))
      const h = Math.max(1, Math.floor(r.height * dpr))
      canvas.width = w
      canvas.height = h
    }

    const ro = new ResizeObserver(() => resize())
    ro.observe(wrap)
    resize()

    const animate = (time: number) => {
      const W = canvas.width
      const H = canvas.height
      let target = pulseFromPropsRef.current
      if (driveFromMicRef.current && analyserRef.current && floatDataRef.current) {
        const an = analyserRef.current
        const data = floatDataRef.current
        an.getFloatTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = data[i]!
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        const raw = Math.min(1, Math.pow(rms * 13, 0.5))
        const s = rmsSmoothedRef.current
        rmsSmoothedRef.current = s + (raw - s) * 0.4
        const floor = 0.06
        const ceil = pulseFromPropsRef.current
        target = floor + (ceil - floor) * rmsSmoothedRef.current
      }
      let pulseEnergy = pulseRef.current
      pulseEnergy += (target - pulseEnergy) * 0.062
      pulseRef.current = pulseEnergy

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      if (pulseEnergy > 0.006) {
        rotY.current += 0.0045 * pulseEnergy
        rotX.current += 0.0022 * pulseEnergy
      }

      const cosY = Math.cos(rotY.current)
      const sinY = Math.sin(rotY.current)
      const cosX = Math.cos(rotX.current)
      const sinX = Math.sin(rotX.current)

      const cx = W / 2
      const cy = H / 2
      const baseR = Math.min(W, H) * 0.22
      const radius = baseR

      const pulseWave = Math.sin(time * 0.003) * 0.072 * pulseEnergy

      const projected: {
        sx: number
        sy: number
        z: number
        brightness: number
        size: number
        gradT: number
      }[] = []

      for (const pt of spherePoints) {
        const { ox, oy, oz } = pt
        const deform = 1 + pulseWave

        if (pulseEnergy > 0.01) {
          const n1 = noise3D(ox * 2.0 + time * 0.0003, oy * 2.0 + time * 0.00025, oz * 2.0 + time * 0.00035)
          const n2 = noise3D(ox * 3.5 - time * 0.0002, oy * 3.5 + time * 0.0004, oz * 3.5 + time * 0.00015)
          pt._noise = n1 * 0.7 + n2 * 0.3
        } else {
          pt._noise = 0
        }

        const x = ox * deform
        const y = oy * deform
        const z = oz * deform
        let x2 = x * cosY - z * sinY
        const z2 = x * sinY + z * cosY
        let y2 = y * cosX - z2 * sinX
        const z3 = y * sinX + z2 * cosX
        const edgeness = 1 - Math.abs(z3)
        const edgeWeight = edgeness * edgeness

        if (pulseEnergy > 0.01) {
          const displacement = pt._noise * 0.009 * pulseEnergy * (0.15 + edgeWeight * 0.85)
          x2 += ox * displacement * radius
          y2 += oy * displacement * radius
        }

        const sx = cx + x2 * radius
        const sy = cy + y2 * radius
        const depth = (z3 + 1.5) / 3
        const bandPos = (y2 / radius + 1) / 2
        const baseGradT = bandPos * 0.75 + depth * 0.25
        let gradT = baseGradT
        if (pulseEnergy > 0.01) {
          const angle = Math.atan2(oz, ox)
          const ripple =
            Math.sin(angle * 2 + time * 0.002) * 0.12 + Math.sin(oy * 3.5 + time * 0.0015) * 0.08
          gradT = baseGradT + ripple * pulseEnergy
        }
        const brightness = depth
        const psize = pt.size * (0.5 + depth * 0.7)
        projected.push({ sx, sy, z: z3, brightness, size: psize, gradT })
      }

      projected.sort((a, b) => a.z - b.z)

      // Dormant / low energy: same gradient hues at lower luminance so points read on white;
      // ramps to full color as pulseEnergy rises (smoothed mic / pulse target).
      const speechBlend = Math.min(1, pulseEnergy / 0.1)
      const dormantRgbMul = 0.48 + 0.52 * speechBlend

      for (const p of projected) {
        let { r, g, b } = sampleGradient(p.gradT)
        r = Math.min(255, Math.round(r * dormantRgbMul))
        g = Math.min(255, Math.round(g * dormantRgbMul))
        b = Math.min(255, Math.round(b * dormantRgbMul))
        if (pulseEnergy > 0.04) {
          const boost = pulseEnergy * 0.25 * p.brightness
          r = Math.min(255, Math.round(r * (1 + boost * 0.3)))
          g = Math.min(255, Math.round(g * (1 + boost * 0.12)))
          b = Math.min(255, Math.round(b * (1 + boost * 0.32)))
        }
        const baseAlpha = 0.22 + p.brightness * 0.78
        const alpha = Math.min(1, baseAlpha * (0.9 + 0.1 * speechBlend))
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.fill()
        if (pulseEnergy > 0.1 && p.brightness > 0.55) {
          ctx.beginPath()
          ctx.arc(p.sx, p.sy, p.size * 3 * pulseEnergy, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},${0.05 * pulseEnergy})`
          ctx.fill()
        }
      }

      if (pulseEnergy > 0.04) {
        const g1 = ctx.createRadialGradient(
          cx,
          cy + radius * 0.4,
          radius * 0.1,
          cx,
          cy + radius * 0.4,
          radius * 1.6,
        )
        g1.addColorStop(0, `rgba(229, 0, 0, ${0.045 * pulseEnergy})`)
        g1.addColorStop(1, 'rgba(229, 0, 0, 0)')
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, W, H)
        const g2 = ctx.createRadialGradient(
          cx,
          cy - radius * 0.4,
          radius * 0.1,
          cx,
          cy - radius * 0.4,
          radius * 1.6,
        )
        g2.addColorStop(0, `rgba(0, 100, 240, ${0.04 * pulseEnergy})`)
        g2.addColorStop(1, 'rgba(0, 100, 240, 0)')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, W, H)
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
    }
  }, [])

  return (
    <span
      ref={wrapRef}
      role={label ? 'img' : undefined}
      aria-label={label}
      className={joinClasses('relative inline-block overflow-hidden rounded-full bg-white', sizeClasses[size], className)}
      data-testid="pulse-orb"
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </span>
  )
}
