import { useRef, type PointerEvent as EventoPuntero } from 'react';
import type { Estructura } from '../../engine/mechanics/reticulado3d';

/** Estado visual de cada barra. */
export interface BarraVisual {
  /** Uso: fuerza / capacidad, con signo (tracción +, compresión −). */
  uso: number;
  rota: boolean;
  /** Grosor relativo del trazo (según la sección). */
  grosor: number;
}

interface Props {
  estructura: Estructura;
  barras: BarraVisual[];
  /** Desplazamientos ya amplificados (3 por nudo), o null. */
  u: Float64Array | null;
  nudosSuperiores: number[];
  ladoPlaca: number;
  discos: number[];
  yaw: number;
  pitch: number;
  onRotar: (yaw: number, pitch: number) => void;
  colorMaterial: string;
  colorearFuerzas: boolean;
  seleccion: number | null;
  onClickBarra?: (j: number) => void;
  /** Modo de edición: nudos grandes y barras quitadas visibles para restaurarlas. */
  editar?: boolean;
  nudoSeleccionado?: number | null;
  onClickNudo?: (i: number) => void;
  fantasmas?: [number, number][];
  onClickFantasma?: (k: number) => void;
  numeros?: boolean;
  /** 0–1: atenuación de las barras rotas durante el colapso. */
  colapso?: number;
  id?: string;
}

const ANCHO = 560;
const ALTO = 520;
const COLOR_TRACCION = [79, 163, 255];
const COLOR_COMPRESION = [255, 92, 92];

function hexARgb(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function mezclar(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Masa del disco → radio y espesor aproximados de una pesa real (mm). */
function medidasDisco(kg: number): { r: number; h: number } {
  if (kg <= 0.5) return { r: 65, h: 14 };
  if (kg <= 1) return { r: 80, h: 18 };
  if (kg <= 2) return { r: 95, h: 22 };
  return { r: 115, h: 30 };
}

/**
 * Vista 3D de la torre (proyección ortográfica girable con el ratón): base, barras coloreadas por
 * su uso (azul tracción, rojo compresión), placa de carga y discos apilados.
 */
export function Vista3DSVG(p: Props) {
  const { estructura: e, u } = p;
  const arrastre = useRef<{ x: number; y: number; yaw: number; pitch: number; movido: boolean } | null>(null);

  const H = Math.max(...e.nudos.map((n) => n.z), 1);
  const extension = Math.max(...e.nudos.map((n) => Math.hypot(n.x, n.y)), 1);
  const escala = Math.min((ALTO * 0.74) / (H + 140), (ANCHO * 0.42) / (extension * 1.5 + 40));
  const cy = Math.cos(p.yaw);
  const sy = Math.sin(p.yaw);
  const cp = Math.cos(p.pitch);
  const sp = Math.sin(p.pitch);
  const origenY = ALTO * 0.5 + escala * ((H + 120) / 2) * cp;

  const proyectar = (x: number, y: number, z: number) => {
    const xr = x * cy - y * sy;
    const yr = x * sy + y * cy;
    return { X: ANCHO / 2 + escala * xr, Y: origenY - escala * (yr * sp + z * cp), prof: yr * cp - z * sp };
  };
  const pos = (i: number) => {
    const n = e.nudos[i];
    return u ? { x: n.x + u[3 * i], y: n.y + u[3 * i + 1], z: n.z + u[3 * i + 2] } : n;
  };
  const P = e.nudos.map((_, i) => {
    const q = pos(i);
    return proyectar(q.x, q.y, q.z);
  });

  // Base de madera
  const ladoBase = extension * 2.4 + 60;
  const esquinasBase = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => proyectar((a * ladoBase) / 2, (b * ladoBase) / 2, 0));
  const espesorBase = 14 * escala;

  // Placa de carga: sigue al promedio de los nudos superiores.
  const sup = p.nudosSuperiores.map(pos);
  const cx = sup.reduce((s, q) => s + q.x, 0) / Math.max(sup.length, 1);
  const cyy = sup.reduce((s, q) => s + q.y, 0) / Math.max(sup.length, 1);
  const zPlaca = sup.reduce((s, q) => s + q.z, 0) / Math.max(sup.length, 1);
  const lp = p.ladoPlaca / 2;
  const esquinasPlaca = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => proyectar(cx + a * lp, cyy + b * lp, zPlaca + 6));
  const esquinasPlacaInf = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => proyectar(cx + a * lp, cyy + b * lp, zPlaca));

  const orden = e.barras.map((_, j) => j).sort((a, b) => {
    const pa = (P[e.barras[a].a].prof + P[e.barras[a].b].prof) / 2;
    const pb = (P[e.barras[b].a].prof + P[e.barras[b].b].prof) / 2;
    return pb - pa;
  });
  const base = hexARgb(p.colorMaterial);

  const alPresionar = (ev: EventoPuntero<SVGSVGElement>) => {
    arrastre.current = { x: ev.clientX, y: ev.clientY, yaw: p.yaw, pitch: p.pitch, movido: false };
  };
  const alMover = (ev: EventoPuntero<SVGSVGElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = ev.clientX - a.x;
    const dy = ev.clientY - a.y;
    if (!a.movido && Math.hypot(dx, dy) > 4) {
      a.movido = true;
      (ev.currentTarget as SVGSVGElement).setPointerCapture(ev.pointerId);
    }
    if (a.movido) p.onRotar(a.yaw - dx * 0.01, Math.min(1.35, Math.max(0.05, a.pitch + dy * 0.008)));
  };
  const alSoltar = () => {
    arrastre.current = null;
  };
  /** Un clic solo cuenta si no hubo arrastre. */
  const clic = (accion?: () => void) => () => {
    if (arrastre.current?.movido) return;
    accion?.();
  };

  const alturasDisco = p.discos.reduce<number[]>((acc, kg) => [...acc, acc[acc.length - 1] + medidasDisco(kg).h], [zPlaca + 6]);
  const discos = p.discos.map((kg, i) => {
    const { r } = medidasDisco(kg);
    const abajo = proyectar(cx, cyy, alturasDisco[i]);
    const arriba = proyectar(cx, cyy, alturasDisco[i + 1]);
    const rx = r * escala;
    const ry = r * escala * sp;
    return (
      <g key={i}>
        <ellipse cx={abajo.X} cy={abajo.Y} rx={rx} ry={ry} fill="#15191e" />
        <rect x={abajo.X - rx} y={arriba.Y} width={2 * rx} height={Math.max(abajo.Y - arriba.Y, 0)} fill="#20262d" />
        <ellipse cx={arriba.X} cy={arriba.Y} rx={rx} ry={ry} fill="#39424c" stroke="#5a6672" strokeWidth={1} />
        <ellipse cx={arriba.X} cy={arriba.Y} rx={rx * 0.18} ry={ry * 0.18} fill="#15191e" />
        <text x={arriba.X} y={arriba.Y + 4 + ry * 0.55} textAnchor="middle" fontSize={10} fill="#c9d4df" fontFamily="'IBM Plex Mono', monospace">
          {String(kg).replace('.', ',')} kg
        </text>
      </g>
    );
  });

  return (
    <svg
      id={p.id}
      viewBox={`0 0 ${ANCHO} ${ALTO}`}
      className="vista-3d"
      role="img"
      aria-label="Vista 3D de la torre. Arrastre para girarla."
      onPointerDown={alPresionar}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerLeave={alSoltar}
      style={{ touchAction: 'none', cursor: 'grab',width: '100%', display: 'block', background: '#0c1620', borderRadius: 10 }}
    >
      <defs>
        <linearGradient id="v3dMadera" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8a6a43" />
          <stop offset="1" stopColor="#6b5032" />
        </linearGradient>
        <linearGradient id="v3dPlaca" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9a46a" />
          <stop offset="1" stopColor="#a8854f" />
        </linearGradient>
      </defs>

      {/* Base */}
      <polygon points={esquinasBase.map((q) => `${q.X},${q.Y + espesorBase}`).join(' ')} fill="#3d2d1b" />
      <polygon points={esquinasBase.map((q) => `${q.X},${q.Y}`).join(' ')} fill="url(#v3dMadera)" stroke="#a88a5e" strokeWidth={1} />

      {/* Barras quitadas (modo edición) */}
      {p.editar &&
        p.fantasmas?.map(([a, b], k) => (
          <g key={`f${k}`} onClick={clic(() => p.onClickFantasma?.(k))} style={{ cursor: 'pointer' }}>
            <line x1={P[a].X} y1={P[a].Y} x2={P[b].X} y2={P[b].Y} stroke="#7f97b0" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
            <line x1={P[a].X} y1={P[a].Y} x2={P[b].X} y2={P[b].Y} stroke="transparent" strokeWidth={10} />
          </g>
        ))}

      {/* Barras, de la más lejana a la más cercana */}
      {orden.map((j) => {
        const b = e.barras[j];
        const v = p.barras[j];
        const A = P[b.a];
        const B = P[b.b];
        if (b.grupo === 'placa') return null;
        const ancho = Math.max(1.2, v.grosor * escala * 1.6);
        let color: string;
        if (v.rota) color = '#5d6b78';
        else if (p.editar && b.grupo === 'libre') color = '#7fdcff';
        else if (!p.colorearFuerzas) color = mezclar(base, base, 0);
        else color = mezclar(base, v.uso >= 0 ? COLOR_TRACCION : COLOR_COMPRESION, Math.min(1, Math.abs(v.uso)) * 0.85 + (Math.abs(v.uso) > 0.02 ? 0.15 : 0));
        const sel = p.seleccion === j;
        return (
          <g key={j} onClick={clic(() => p.onClickBarra?.(j))} style={{ cursor: p.onClickBarra ? 'pointer' : undefined }} opacity={v.rota ? Math.max(0.25, 1 - (p.colapso ?? 0) * 0.6) : 1}>
            {sel && <line x1={A.X} y1={A.Y} x2={B.X} y2={B.Y} stroke="#ffd166" strokeWidth={ancho + 5} strokeLinecap="round" opacity={0.85} />}
            <line x1={A.X} y1={A.Y} x2={B.X} y2={B.Y} stroke={color} strokeWidth={ancho} strokeLinecap="round" strokeDasharray={v.rota ? '4 4' : undefined} />
            <line x1={A.X} y1={A.Y} x2={B.X} y2={B.Y} stroke="transparent" strokeWidth={Math.max(10, ancho + 6)} />
            {p.numeros && (
              <text x={(A.X + B.X) / 2} y={(A.Y + B.Y) / 2 - 3} fontSize={9} fill="#e3edf7" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" style={{ pointerEvents: 'none' }}>
                {j + 1}
              </text>
            )}
          </g>
        );
      })}

      {/* Nudos (gotas de pegamento) */}
      {e.nudos.map((n, i) => {
        const q = P[i];
        const sel = p.nudoSeleccionado === i;
        const r = p.editar ? 5.5 : n.apoyo ? 3.5 : 2.4;
        return (
          <circle
            key={`n${i}`}
            cx={q.X}
            cy={q.Y}
            r={r}
            fill={sel ? '#ffd166' : n.apoyo ? '#c9b48a' : '#efe6d0'}
            stroke={sel ? '#fff' : '#3d2d1b'}
            strokeWidth={p.editar ? 1.2 : 0.6}
            onClick={clic(() => p.onClickNudo?.(i))}
            style={{ cursor: p.editar ? 'pointer' : undefined }}
          />
        );
      })}

      {/* Placa de carga y discos */}
      <polygon points={esquinasPlacaInf.map((q) => `${q.X},${q.Y}`).join(' ')} fill="#5a4426" opacity={0.85} style={{ pointerEvents: 'none' }} />
      <polygon points={esquinasPlaca.map((q) => `${q.X},${q.Y}`).join(' ')} fill="url(#v3dPlaca)" stroke="#e0c48f" strokeWidth={1} opacity={0.82} style={{ pointerEvents: 'none' }} />
      <g style={{ pointerEvents: 'none' }}>{discos}</g>

      <text x={12} y={ALTO - 12} fontSize={11} fill="#7f97b0" fontFamily="'Inter', sans-serif">
        Arrastre para girar la torre
      </text>
    </svg>
  );
}
