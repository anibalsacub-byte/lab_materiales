import type { ReactNode } from 'react';
import type { ParametrosSeccion, PropiedadesSeccion } from '../../engine/sections';

interface Props {
  p: ParametrosSeccion;
  props: PropiedadesSeccion;
}

const CX = 150;
const CY = 150;

export function SectionSVG({ p, props }: Props) {
  const dims: number[] = [p.d ?? 0, p.b ?? 0, p.h ?? 0, p.bf ?? 0, p.hw ?? 0, p.bL ?? 0, p.hL ?? 0].filter((v) => v > 0);
  const maxDim = Math.max(...dims, 1);
  const escala = 140 / maxDim;

  const aX = (xMm: number) => CX + xMm * escala;
  const aY = (yMm: number) => CY - yMm * escala;

  let forma: ReactNode = null;

  switch (p.tipo) {
    case 'circular_maciza':
      forma = <circle cx={CX} cy={CY} r={(p.d! / 2) * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.5} />;
      break;
    case 'circular_tubular':
      forma = (
        <>
          <circle cx={CX} cy={CY} r={(p.d! / 2) * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.5} />
          <circle cx={CX} cy={CY} r={(p.dInt! / 2) * escala} fill="var(--color-bg, #f4f6f8)" stroke="#123f61" strokeWidth={1} />
        </>
      );
      break;
    case 'rectangular':
      forma = <rect x={aX(-p.b! / 2)} y={aY(p.h! / 2)} width={p.b! * escala} height={p.h! * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.5} />;
      break;
    case 'rectangular_tubular':
      forma = (
        <>
          <rect x={aX(-p.b! / 2)} y={aY(p.h! / 2)} width={p.b! * escala} height={p.h! * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.5} />
          <rect x={aX(-p.bInt! / 2)} y={aY(p.hInt! / 2)} width={p.bInt! * escala} height={p.hInt! * escala} fill="#f4f6f8" stroke="#123f61" strokeWidth={1} />
        </>
      );
      break;
    case 'perfil_I': {
      const { bf, tf, hw, tw } = p as Required<Pick<ParametrosSeccion, 'bf' | 'tf' | 'hw' | 'tw'>>;
      forma = (
        <>
          <rect x={aX(-bf / 2)} y={aY(hw / 2 + tf)} width={bf * escala} height={tf * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
          <rect x={aX(-tw / 2)} y={aY(hw / 2)} width={tw * escala} height={hw * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
          <rect x={aX(-bf / 2)} y={aY(-hw / 2)} width={bf * escala} height={tf * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
        </>
      );
      break;
    }
    case 'perfil_T': {
      const { bf, tf, hw, tw } = p as Required<Pick<ParametrosSeccion, 'bf' | 'tf' | 'hw' | 'tw'>>;
      forma = (
        <>
          <rect x={aX(-bf / 2)} y={aY(0)} width={bf * escala} height={tf * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
          <rect x={aX(-tw / 2)} y={aY(-tf)} width={tw * escala} height={hw * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
        </>
      );
      break;
    }
    case 'perfil_L': {
      const { bL, hL, tw } = p as Required<Pick<ParametrosSeccion, 'bL' | 'hL' | 'tw'>>;
      forma = (
        <>
          <rect x={aX(0)} y={aY(tw)} width={bL * escala} height={tw * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
          <rect x={aX(0)} y={aY(hL)} width={tw * escala} height={(hL - tw) * escala} fill="#cdd9e3" stroke="#123f61" strokeWidth={1.2} />
        </>
      );
      break;
    }
  }

  // Centroide en coordenadas locales de la pieza (mismo origen usado por sections.ts)
  const cxMm = props.centroide.x_mm;
  const cyMm = props.centroide.y_mm;
  // Para secciones centradas en el origen (circular, rectangular simples) el centroide coincide con (0,0) del dibujo.
  const esOrigenCentrado = p.tipo === 'circular_maciza' || p.tipo === 'circular_tubular' || p.tipo === 'rectangular' || p.tipo === 'rectangular_tubular' || p.tipo === 'perfil_I';
  const centroidePxX = esOrigenCentrado ? CX : aX(cxMm);
  const centroidePxY = esOrigenCentrado ? CY : aY(cyMm);

  const thetaRad = (props.thetaPrincipal_deg * Math.PI) / 180;
  const largoEje = 90;

  return (
    <svg viewBox="0 0 300 300" width="100%" height="300" role="img" aria-label="Sección transversal">
      {forma}
      {/* Ejes x,y centroidales */}
      <line x1={centroidePxX - largoEje} y1={centroidePxY} x2={centroidePxX + largoEje} y2={centroidePxY} stroke="#5b6b78" strokeDasharray="4 3" />
      <line x1={centroidePxX} y1={centroidePxY - largoEje} x2={centroidePxX} y2={centroidePxY + largoEje} stroke="#5b6b78" strokeDasharray="4 3" />
      {!props.esSimetrica && (
        <line
          x1={centroidePxX - largoEje * Math.cos(thetaRad)}
          y1={centroidePxY + largoEje * Math.sin(thetaRad)}
          x2={centroidePxX + largoEje * Math.cos(thetaRad)}
          y2={centroidePxY - largoEje * Math.sin(thetaRad)}
          stroke="#b3541e"
          strokeWidth={1.5}
        />
      )}
      <circle cx={centroidePxX} cy={centroidePxY} r={3} fill="#ab2d2d" />
      <text x={centroidePxX + 6} y={centroidePxY - 6} fontSize="10" fill="#ab2d2d">C</text>
      {!props.esSimetrica && <text x={16} y={290} fontSize="10" fill="#b3541e">Línea naranja: eje principal 1 (θ = {props.thetaPrincipal_deg.toFixed(1)}°)</text>}
    </svg>
  );
}
