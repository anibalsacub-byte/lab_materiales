import { useRef, type PointerEvent as EventoPuntero, type ReactNode } from 'react';
import type { ArmaduraPlana } from '../../engine/mechanics/plano';

export type Herramienta2D = 'seleccionar' | 'mover' | 'nudo' | 'barra' | 'apoyo' | 'carga' | 'borrar';

interface Props {
  arm: ArmaduraPlana;
  /** Fuerza axial de cada barra (N), o null si no hay cálculo. */
  N: Float64Array | null;
  /** Uso con signo de cada barra (fuerza / capacidad). */
  uso: number[];
  rotas: Set<number>;
  grosor: number[];
  /** Desplazamientos ya amplificados (3 por nudo, x y z del motor), o null. */
  u: Float64Array | null;
  /** Reacciones (3 por nudo), o null. */
  R: Float64Array | null;
  /** Factor por el que se multiplican las cargas dibujadas. */
  factorCargas: number;
  herramienta: Herramienta2D;
  seleccion: { tipo: 'nudo' | 'barra'; i: number } | null;
  nudoPendiente: number | null;
  mostrarFuerzas: boolean;
  mostrarReacciones: boolean;
  ajustar: boolean;
  colorMaterial: string;
  onClickVacio: (x: number, y: number) => void;
  onClickNudo: (i: number) => void;
  onClickBarra: (j: number) => void;
  onInicioArrastre: (i: number) => void;
  onArrastrar: (i: number, x: number, y: number) => void;
  id?: string;
}

const ANCHO_PX = 470;
const C_TRACCION = [79, 163, 255];
const C_COMPRESION = [255, 92, 92];

function rgb(hex: string): number[] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function mezcla(a: number[], b: number[], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function texto(v: number): string {
  const a = Math.abs(v);
  const s = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return (v < 0 ? '−' : '') + s.replace('.', ',');
}

/** Editor y vista de armaduras planas: cuadrícula en mm, y hacia arriba. */
export function Vista2DSVG(p: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const arrastre = useRef<number | null>(null);
  const { arm } = p;

  const pos = (i: number) => {
    const n = arm.nudos[i];
    return p.u ? { x: n.x + p.u[3 * i], y: n.y + p.u[3 * i + 2] } : { x: n.x, y: n.y };
  };

  // Límites del dibujo (mm): la armadura más un área de trabajo mínima.
  const xs = [0, 600, ...arm.nudos.map((n) => n.x)];
  const ys = [-60, 200, ...arm.nudos.map((n) => n.y)];
  const margen = 45;
  const xMin = Math.min(...xs) - margen;
  const xMax = Math.max(...xs) + margen;
  const yMin = Math.min(...ys) - margen;
  const yMax = Math.max(...ys) + margen;
  const w = xMax - xMin;
  const h = yMax - yMin;
  const px = w / ANCHO_PX; // mm por píxel de pantalla (a 800 px de ancho)

  const aModelo = (ev: { clientX: number; clientY: number }) => {
    const svg = ref.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    const q = m ? pt.matrixTransform(m.inverse()) : pt;
    let x = q.x;
    let y = -q.y;
    if (p.ajustar) {
      x = Math.round(x / 10) * 10;
      y = Math.round(y / 10) * 10;
    }
    return { x, y };
  };

  const lineasGrilla: ReactNode[] = [];
  const g0x = Math.ceil(xMin / 10) * 10;
  const g0y = Math.ceil(yMin / 10) * 10;
  for (let x = g0x; x <= xMax; x += 10) {
    lineasGrilla.push(<line key={`gx${x}`} x1={x} y1={-yMax} x2={x} y2={-yMin} stroke={x % 50 === 0 ? '#1f3247' : '#152434'} strokeWidth={x === 0 ? 1.6 * px : px} />);
  }
  for (let y = g0y; y <= yMax; y += 10) {
    lineasGrilla.push(<line key={`gy${y}`} x1={xMin} y1={-y} x2={xMax} y2={-y} stroke={y % 50 === 0 ? '#1f3247' : '#152434'} strokeWidth={y === 0 ? 1.6 * px : px} />);
  }

  const base = rgb(p.colorMaterial);
  const flecha = (x: number, y: number, fx: number, fy: number, color: string, etiqueta: string, haciaElNudo: boolean, k: string) => {
    const mod = Math.hypot(fx, fy);
    if (mod < 1e-9) return null;
    const L = 46 * px;
    const ux = fx / mod;
    const uy = fy / mod;
    // Cargas: la flecha llega al nudo. Reacciones: sale del nudo.
    const x1 = haciaElNudo ? x - ux * L : x;
    const y1 = haciaElNudo ? y - uy * L : y;
    const x2 = haciaElNudo ? x - ux * 7 * px : x + ux * L;
    const y2 = haciaElNudo ? y - uy * 7 * px : y + uy * L;
    const a = 7 * px;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const p1 = [x2 - a * Math.cos(ang - 0.45), y2 - a * Math.sin(ang - 0.45)];
    const p2 = [x2 - a * Math.cos(ang + 0.45), y2 - a * Math.sin(ang + 0.45)];
    const lx = haciaElNudo ? x1 : x2;
    const ly = haciaElNudo ? y1 : y2;
    return (
      <g key={k} style={{ pointerEvents: 'none' }}>
        <line x1={x1} y1={-y1} x2={x2} y2={-y2} stroke={color} strokeWidth={2 * px} />
        <polygon points={`${x2},${-y2} ${p1[0]},${-p1[1]} ${p2[0]},${-p2[1]}`} fill={color} />
        <text x={lx + ux * 4 * px} y={-ly - uy * 4 * px - 3 * px} fontSize={11 * px} fill={color} textAnchor="middle" fontFamily="'IBM Plex Mono', monospace">
          {etiqueta}
        </text>
      </g>
    );
  };

  const apoyo = (i: number) => {
    const n = arm.nudos[i];
    if (n.apoyo === 'ninguno') return null;
    const { x, y } = { x: n.x, y: n.y };
    const s = 13 * px;
    const vertical = n.apoyo === 'rodilloV';
    // Triángulo apuntando al nudo; en el rodillo vertical, apoyado en una pared a la izquierda.
    const pts = vertical
      ? `${x},${-y} ${x - s * 1.2},${-(y - s * 0.8)} ${x - s * 1.2},${-(y + s * 0.8)}`
      : `${x},${-y} ${x - s * 0.8},${-(y - s * 1.2)} ${x + s * 0.8},${-(y - s * 1.2)}`;
    const rodillo = n.apoyo !== 'articulado';
    return (
      <g key={`ap${i}`} style={{ pointerEvents: 'none' }}>
        <polygon points={pts} fill="#2a4157" stroke="#8fb3d1" strokeWidth={1.2 * px} />
        {rodillo &&
          (vertical ? (
            <>
              <circle cx={x - s * 1.55} cy={-(y - s * 0.45)} r={s * 0.3} fill="none" stroke="#8fb3d1" strokeWidth={1.2 * px} />
              <circle cx={x - s * 1.55} cy={-(y + s * 0.45)} r={s * 0.3} fill="none" stroke="#8fb3d1" strokeWidth={1.2 * px} />
              <line x1={x - s * 1.9} y1={-(y - s * 1.1)} x2={x - s * 1.9} y2={-(y + s * 1.1)} stroke="#8fb3d1" strokeWidth={1.5 * px} />
            </>
          ) : (
            <>
              <circle cx={x - s * 0.45} cy={-(y - s * 1.55)} r={s * 0.3} fill="none" stroke="#8fb3d1" strokeWidth={1.2 * px} />
              <circle cx={x + s * 0.45} cy={-(y - s * 1.55)} r={s * 0.3} fill="none" stroke="#8fb3d1" strokeWidth={1.2 * px} />
              <line x1={x - s * 1.1} y1={-(y - s * 1.9)} x2={x + s * 1.1} y2={-(y - s * 1.9)} stroke="#8fb3d1" strokeWidth={1.5 * px} />
            </>
          ))}
        {!rodillo && <line x1={x - s * 1.1} y1={-(y - s * 1.25)} x2={x + s * 1.1} y2={-(y - s * 1.25)} stroke="#8fb3d1" strokeWidth={1.5 * px} />}
      </g>
    );
  };

  const alPresionarNudo = (i: number) => (ev: EventoPuntero<SVGCircleElement>) => {
    if (p.herramienta !== 'mover') return;
    ev.stopPropagation();
    arrastre.current = i;
    p.onInicioArrastre(i);
    ref.current?.setPointerCapture(ev.pointerId);
  };
  const alMover = (ev: EventoPuntero<SVGSVGElement>) => {
    if (arrastre.current === null) return;
    const q = aModelo(ev);
    p.onArrastrar(arrastre.current, q.x, q.y);
  };
  const alSoltar = () => {
    arrastre.current = null;
  };

  const cursor = p.herramienta === 'nudo' ? 'crosshair' : p.herramienta === 'mover' ? 'move' : p.herramienta === 'borrar' ? 'not-allowed' : 'pointer';

  return (
    <svg
      ref={ref}
      id={p.id}
      viewBox={`${xMin} ${-yMax} ${w} ${h}`}
      role="img"
      aria-label="Editor de la armadura plana"
      style={{ width: '100%', display: 'block', background: '#0c1620', borderRadius: 10, touchAction: 'none', cursor }}
      onPointerMove={alMover}
      onPointerUp={alSoltar}
      onPointerLeave={alSoltar}
      onClick={(ev) => {
        if (ev.target === ref.current || (ev.target as Element).getAttribute('data-fondo')) {
          const q = aModelo(ev);
          p.onClickVacio(q.x, q.y);
        }
      }}
    >
      <rect data-fondo="1" x={xMin} y={-yMax} width={w} height={h} fill="transparent" />
      <g data-fondo="1" style={{ pointerEvents: 'none' }}>{lineasGrilla}</g>
      <text x={xMin + 8 * px} y={-yMin - 8 * px} fontSize={10 * px} fill="#5d7389" fontFamily="'Inter', sans-serif" style={{ pointerEvents: 'none' }}>
        Cuadrícula: 10 mm (líneas gruesas cada 50 mm) · origen en (0, 0)
      </text>

      {arm.nudos.map((_, i) => apoyo(i))}

      {arm.barras.map((b, j) => {
        if (b.a >= arm.nudos.length || b.b >= arm.nudos.length) return null;
        const A = pos(b.a);
        const B = pos(b.b);
        const rota = p.rotas.has(j);
        const v = p.uso[j] ?? 0;
        const color = rota ? '#5d6b78' : p.N ? mezcla(base, v >= 0 ? C_TRACCION : C_COMPRESION, Math.min(1, Math.abs(v)) * 0.85 + (Math.abs(v) > 0.02 ? 0.15 : 0)) : mezcla(base, base, 0);
        const sel = p.seleccion?.tipo === 'barra' && p.seleccion.i === j;
        const ancho = (p.grosor[j] ?? 3) * px;
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        return (
          <g key={`b${j}`} onClick={(ev) => { ev.stopPropagation(); p.onClickBarra(j); }} style={{ cursor }}>
            {sel && <line x1={A.x} y1={-A.y} x2={B.x} y2={-B.y} stroke="#ffd166" strokeWidth={ancho + 5 * px} strokeLinecap="round" />}
            <line x1={A.x} y1={-A.y} x2={B.x} y2={-B.y} stroke={color} strokeWidth={ancho} strokeLinecap="round" strokeDasharray={rota ? `${5 * px} ${4 * px}` : undefined} />
            <line x1={A.x} y1={-A.y} x2={B.x} y2={-B.y} stroke="transparent" strokeWidth={12 * px} />
            {p.mostrarFuerzas && p.N && !rota && (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={mx - 22 * px} y={-my - 8 * px} width={44 * px} height={14 * px} rx={3 * px} fill="#0c1620" opacity={0.85} />
                <text x={mx} y={-my + 3 * px} fontSize={10 * px} textAnchor="middle" fill={p.N[j] >= 0 ? '#8fc7ff' : '#ff9b9b'} fontFamily="'IBM Plex Mono', monospace">
                  {texto(p.N[j])}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {arm.cargas.map((c, k) => {
        if (c.nudo >= arm.nudos.length) return null;
        const q = pos(c.nudo);
        const fx = c.fx * p.factorCargas;
        const fy = c.fy * p.factorCargas;
        return flecha(q.x, q.y, fx, fy, '#f0b429', `${texto(Math.hypot(fx, fy))} N`, true, `c${k}`);
      })}

      {p.mostrarReacciones &&
        p.R &&
        arm.nudos.map((n, i) => {
          if (n.apoyo === 'ninguno') return null;
          const rx = p.R![3 * i];
          const ry = p.R![3 * i + 2];
          return (
            <g key={`r${i}`}>
              {Math.abs(rx) > 1e-6 && flecha(n.x, n.y, rx, 0, '#3ecf8e', `${texto(Math.abs(rx))} N`, true, `rx${i}`)}
              {Math.abs(ry) > 1e-6 && flecha(n.x, n.y - (n.apoyo === 'rodilloV' ? 0 : 27 * px), 0, ry, '#3ecf8e', `${texto(Math.abs(ry))} N`, true, `ry${i}`)}
            </g>
          );
        })}

      {arm.nudos.map((_, i) => {
        const q = pos(i);
        const sel = (p.seleccion?.tipo === 'nudo' && p.seleccion.i === i) || p.nudoPendiente === i;
        return (
          <g key={`n${i}`}>
            <circle
              cx={q.x}
              cy={-q.y}
              r={6 * px}
              fill={sel ? '#ffd166' : '#efe6d0'}
              stroke="#3d2d1b"
              strokeWidth={1.2 * px}
              onPointerDown={alPresionarNudo(i)}
              onClick={(ev) => { ev.stopPropagation(); p.onClickNudo(i); }}
              style={{ cursor }}
            />
            <text x={q.x + 8 * px} y={-q.y - 8 * px} fontSize={10 * px} fill="#a9bdd1" fontFamily="'IBM Plex Mono', monospace" style={{ pointerEvents: 'none' }}>
              {i + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
