import type { EstadoEsfuerzoPlano, ResultadoMohr } from '../../engine/mechanics/mohr';
import { transformarEsfuerzo } from '../../engine/mechanics/mohr';

interface Props {
  estado: EstadoEsfuerzoPlano;
  resultado: ResultadoMohr;
  thetaDeg: number;
}

function flechaEsfuerzo(x1: number, y1: number, x2: number, y2: number, color: string) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2.2} markerEnd="url(#punta)" />;
}

export function ElementoEsfuerzo({ estado, thetaDeg }: { estado: EstadoEsfuerzoPlano; thetaDeg: number }) {
  const t = transformarEsfuerzo(estado, thetaDeg);
  const L = 50;
  const cx = 100;
  const cy = 100;
  const esc = 0.3;
  const sx = t.sigmaX_MPa * esc;
  const sy = t.sigmaY_MPa * esc;
  const txy = t.tauXY_MPa * esc;

  return (
    <svg viewBox="0 0 200 200" width="100%" height="230" role="img" aria-label="Elemento de esfuerzo plano">
      <defs>
        <marker id="punta" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="#123f61" />
        </marker>
      </defs>
      <rect x={cx - L / 2} y={cy - L / 2} width={L} height={L} fill="#eef2f5" stroke="#123f61" strokeWidth={1.5} />

      {/* sigma x: caras derecha/izquierda */}
      {flechaEsfuerzo(cx + L / 2, cy, cx + L / 2 + sx, cy, '#1d5a8a')}
      {flechaEsfuerzo(cx - L / 2, cy, cx - L / 2 - sx, cy, '#1d5a8a')}
      {/* sigma y: caras superior/inferior */}
      {flechaEsfuerzo(cx, cy - L / 2, cx, cy - L / 2 - sy, '#1d5a8a')}
      {flechaEsfuerzo(cx, cy + L / 2, cx, cy + L / 2 + sy, '#1d5a8a')}
      {/* tau xy: a lo largo de las caras */}
      {flechaEsfuerzo(cx + L / 2, cy - L / 4, cx + L / 2, cy - L / 4 - txy, '#b3541e')}
      {flechaEsfuerzo(cx - L / 2, cy + L / 4, cx - L / 2, cy + L / 4 + txy, '#b3541e')}
      {flechaEsfuerzo(cx - L / 4, cy - L / 2, cx - L / 4 - txy, cy - L / 2, '#b3541e')}
      {flechaEsfuerzo(cx + L / 4, cy + L / 2, cx + L / 4 + txy, cy + L / 2, '#b3541e')}

      <text x={100} y={190} textAnchor="middle" fontSize="10" fill="#5b6b78">θ = {thetaDeg.toFixed(1)}° respecto al eje x original</text>
    </svg>
  );
}

export function CirculoMohr({ estado, resultado, thetaDeg }: Props) {
  const maxAbs = Math.max(Math.abs(resultado.sigma1_MPa), Math.abs(resultado.sigma2_MPa), resultado.radio_MPa) * 1.35 + 1;
  const escala = 110 / maxAbs;
  const origenX = 150;
  const origenY = 150;
  const sPx = (s: number) => origenX + s * escala;
  const tPx = (t: number) => origenY + t * escala; // τ positivo hacia abajo

  const centroPx = sPx(resultado.promedio_MPa);
  const radioPx = resultado.radio_MPa * escala;

  const V = { x: sPx(estado.sigmaX_MPa), y: tPx(estado.tauXY_MPa) };
  const H = { x: sPx(estado.sigmaY_MPa), y: tPx(-estado.tauXY_MPa) };
  const t = transformarEsfuerzo(estado, thetaDeg);
  const Vp = { x: sPx(t.sigmaX_MPa), y: tPx(t.tauXY_MPa) };

  return (
    <svg viewBox="0 0 300 300" width="100%" height="300" role="img" aria-label="Círculo de Mohr">
      <line x1={10} y1={origenY} x2={290} y2={origenY} stroke="#5b6b78" />
      <line x1={origenX} y1={10} x2={origenX} y2={290} stroke="#5b6b78" />
      <text x={285} y={origenY - 4} fontSize="9" fill="#5b6b78" textAnchor="end">σ</text>
      <text x={origenX + 4} y={20} fontSize="9" fill="#5b6b78">τ (+ hacia abajo)</text>

      <circle cx={centroPx} cy={origenY} r={radioPx} fill="none" stroke="#1d5a8a" strokeWidth={1.5} />
      <line x1={V.x} y1={V.y} x2={H.x} y2={H.y} stroke="#8a97a3" strokeDasharray="3 3" />
      <circle cx={V.x} cy={V.y} r={4} fill="#1d5a8a" />
      <text x={V.x + 6} y={V.y - 4} fontSize="9" fill="#1d5a8a">X</text>
      <circle cx={H.x} cy={H.y} r={4} fill="#1d5a8a" />
      <text x={H.x + 6} y={H.y - 4} fontSize="9" fill="#1d5a8a">Y</text>
      <circle cx={centroPx} cy={origenY} r={3} fill="#123f61" />

      <line x1={centroPx} y1={origenY} x2={Vp.x} y2={Vp.y} stroke="#b3541e" strokeWidth={1.5} />
      <circle cx={Vp.x} cy={Vp.y} r={4.5} fill="#b3541e" />
      <text x={Vp.x + 6} y={Vp.y + 10} fontSize="9" fill="#b3541e">θ actual</text>
    </svg>
  );
}
