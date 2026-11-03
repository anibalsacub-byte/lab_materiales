import { ConsolaSVG, DefsMaquina, MESA_Y, RotuloCota, type ColoresProbeta, type PropsConsola } from '../../components/svg/MarcoMaquinaSVG';

/**
 * Máquina de ensayos de torsión (vista lateral): cabezal motorreductor que gira con su disco
 * graduado, probeta horizontal entre dos mandriles y celda de par en el cabezal fijo. Las
 * generatrices dibujadas sobre la probeta se convierten en hélices al torcerla: su inclinación es
 * la deformación angular γ (amplificada si el giro es pequeño).
 */

const YC = 262;
const X_IZQ = 178;
const X_DER = 352;
const HOMBRO = 34;
const FILETE = 10;

interface Props extends PropsConsola {
  /** Giro real del cabezal (rad) y giro dibujado en la probeta (rad, amplificado). */
  giro: number;
  giroVisual: number;
  fracturada: boolean;
  ductil: boolean;
  tubular: boolean;
  mordazasCerradas: boolean;
  probetaVisible: boolean;
  colorProbeta: ColoresProbeta;
  cotas: string[];
}

export function MaquinaTorsionSVG(p: Props) {
  const r = 12;
  const rHombro = 20;
  const x0 = X_IZQ + HOMBRO + FILETE;
  const x1 = X_DER - HOMBRO - FILETE;
  const xm = (x0 + x1) / 2;
  const grados = (p.giro * 180) / Math.PI;
  const vueltas = grados / 360;

  // Generatrices: un punto de la superficie a ángulo φ se ve en y = YC − r·sen φ y es visible si cos φ > 0.
  const generatrices = [0, 1, 2, 3, 4, 5, 6, 7].map((kk) => {
    const fi0 = (kk * Math.PI) / 4;
    const tramos: string[] = [];
    let actual: string[] = [];
    const n = 60;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      // El extremo derecho (mandril fijo) no gira; el izquierdo gira con el cabezal.
      const fi = fi0 + p.giroVisual * ((x1 - x) / (x1 - x0));
      if (Math.cos(fi) > 0.05) actual.push(`${x.toFixed(1)},${(YC - r * Math.sin(fi)).toFixed(1)}`);
      else if (actual.length) {
        tramos.push(actual.join(' '));
        actual = [];
      }
    }
    if (actual.length) tramos.push(actual.join(' '));
    return tramos;
  });

  const anguloDisco = p.giro; // el disco muestra el giro real
  const cxDisco = 96;
  const cyDisco = 214;
  const huelgo = p.mordazasCerradas ? 0 : 4;

  function mandril(x: number, izquierdo: boolean) {
    const giroMordazas = izquierdo ? anguloDisco : 0;
    return (
      <g>
        <rect x={x} y={YC - 44} width={28} height={88} rx={4} fill="url(#umCuerpoV)" stroke="#0e1720" />
        {[0, 1, 2].map((kk) => {
          const fi = giroMordazas + (kk * 2 * Math.PI) / 3;
          const y = YC - 30 * Math.sin(fi);
          return Math.cos(fi) > -0.2 ? <rect key={kk} x={x + 4} y={y - 5} width={20} height={10} rx={2} fill="#9fb0c2" opacity={0.35 + 0.5 * Math.max(Math.cos(fi), 0)} /> : null;
        })}
        <rect x={izquierdo ? x + 28 : x - 8 + huelgo} y={YC - rHombro - 4} width={8 - huelgo} height={2 * rHombro + 8} fill="#3a4654" />
      </g>
    );
  }

  const gap = 6;
  // Perfil de la probeta (hombros, transición y zona calibrada), simétrico respecto al eje.
  const xs = [X_IZQ, X_IZQ + HOMBRO, x0, x1, X_DER - HOMBRO, X_DER];
  const rs = [rHombro, rHombro, r, r, rHombro, rHombro];
  const rEn = (x: number) => {
    for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return rs[i - 1] + ((rs[i] - rs[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1] || 1);
    return rHombro;
  };
  const tramo = (desde: number, hasta: number): [number, number][] => [[desde, rEn(desde)], ...xs.filter((x) => x > desde && x < hasta).map((x) => [x, rEn(x)] as [number, number]), [hasta, rEn(hasta)]];
  /** Trozo de probeta cuyo borde superior va de dSup a hSup y el inferior de dInf a hInf (corte oblicuo si difieren). */
  const cuerpo = (dSup: number, hSup: number, dInf = dSup, hInf = hSup) => {
    const arriba = tramo(dSup, hSup).map(([x, rr]) => `${x.toFixed(1)},${(YC - rr).toFixed(1)}`);
    const abajo = tramo(dInf, hInf).reverse().map(([x, rr]) => `${x.toFixed(1)},${(YC + rr).toFixed(1)}`);
    return [...arriba, ...abajo].join(' ');
  };

  return (
    <svg viewBox="0 0 520 600" width="100%" role="img" aria-label="Máquina de ensayos de torsión" style={{ display: 'block' }}>
      <DefsMaquina colorProbeta={p.colorProbeta} />
      <rect x={0} y={0} width={520} height={600} fill="url(#umFondo)" rx={10} />

      {/* Bancada */}
      <rect x={28} y={330} width={464} height={26} rx={4} fill="url(#umTravesano)" filter="url(#umSombra)" />
      {[60, 460].map((x) => <rect key={x} x={x - 14} y={356} width={28} height={MESA_Y - 356} fill="#2a3542" stroke="#141c25" />)}
      <rect x={28} y={MESA_Y} width={464} height={18} rx={3} fill="#3b4a59" stroke="#1a232d" />

      {/* Cabezal motorreductor (gira) con disco graduado */}
      <rect x={40} y={160} width={112} height={170} rx={6} fill="url(#umGabinete)" stroke="#0f2236" filter="url(#umSombra)" />
      <text x={96} y={300} textAnchor="middle" fontSize="7.5" fill="#c3d2e0" fontWeight="bold">MOTORREDUCTOR</text>
      <circle cx={cxDisco} cy={cyDisco} r={38} fill="#e8edf2" stroke="#55606b" strokeWidth={2} />
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i * Math.PI) / 18;
        const largo = i % 3 === 0 ? 8 : 4;
        return <line key={i} x1={cxDisco + 38 * Math.sin(a)} y1={cyDisco - 38 * Math.cos(a)} x2={cxDisco + (38 - largo) * Math.sin(a)} y2={cyDisco - (38 - largo) * Math.cos(a)} stroke="#33404d" strokeWidth={i % 3 === 0 ? 1.4 : 0.8} />;
      })}
      <line x1={cxDisco} y1={cyDisco} x2={cxDisco + 30 * Math.sin(anguloDisco)} y2={cyDisco - 30 * Math.cos(anguloDisco)} stroke="#c0392b" strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={cxDisco} cy={cyDisco} r={4} fill="#33404d" />
      <text x={96} y={268} textAnchor="middle" fontSize="11" fill="#e3edf7" fontFamily="'IBM Plex Mono', monospace">{grados.toFixed(1)}°</text>
      <text x={96} y={283} textAnchor="middle" fontSize="9" fill="#a9bdd1">{vueltas.toFixed(2)} vueltas</text>
      {mandril(150, true)}

      {/* Cabezal fijo con celda de par */}
      <rect x={380} y={176} width={100} height={154} rx={6} fill="url(#umGabinete)" stroke="#0f2236" filter="url(#umSombra)" />
      <rect x={398} y={238} width={64} height={14} rx={2} fill="#d4a017" />
      <text x={430} y={248} textAnchor="middle" fontSize="7" fill="#2b2207" fontWeight="bold">CELDA DE PAR</text>
      <text x={430} y={300} textAnchor="middle" fontSize="7.5" fill="#c3d2e0" fontWeight="bold">CABEZAL FIJO</text>
      {mandril(352, false)}

      {p.probetaVisible && (
        <g>
          <g filter="url(#umSombra)">
            {!p.fracturada ? (
              <polygon points={cuerpo(X_IZQ, X_DER)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
            ) : p.ductil ? (
              <>
                <polygon points={cuerpo(X_IZQ, xm - gap / 2)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
                <polygon points={cuerpo(xm + gap / 2, X_DER)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
              </>
            ) : (
              // Rotura frágil por tracción en una hélice a 45°: corte oblicuo.
              <>
                <polygon points={cuerpo(X_IZQ, xm - r - gap / 2, X_IZQ, xm + r - gap / 2)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
                <polygon points={cuerpo(xm - r + gap / 2, X_DER, xm + r + gap / 2, X_DER)} fill="url(#umProbetaH)" stroke="#2a3138" strokeWidth={0.8} />
              </>
            )}
          </g>
          {p.tubular && !p.fracturada && <line x1={X_IZQ} y1={YC} x2={X_DER} y2={YC} stroke="#1a1f24" strokeDasharray="4 3" opacity={0.5} />}
          {!p.fracturada &&
            generatrices.map((tramos, kk) =>
              tramos.map((pts, j) => <polyline key={`${kk}-${j}`} points={pts} fill="none" stroke="#1f2a35" strokeWidth={1.1} opacity={0.75} />),
            )}

          {/* Troptómetro: dos anillos en los extremos de la zona calibrada */}
          {!p.fracturada &&
            [x0 + 4, x1 - 4].map((x) => <rect key={x} x={x - 3} y={YC - r - 6} width={6} height={2 * r + 12} rx={2} fill="#e0a526" opacity={0.85} />)}

          <g stroke="#7f97b0" strokeWidth={1}>
            <line x1={x0} y1={YC + 48} x2={x1} y2={YC + 48} />
            <line x1={x0} y1={YC + 43} x2={x0} y2={YC + 53} />
            <line x1={x1} y1={YC + 43} x2={x1} y2={YC + 53} />
          </g>
          <RotuloCota xDerecha={xm + 44} yCentro={YC - 74} lineas={p.cotas} />
        </g>
      )}

      <ConsolaSVG x={96} y={MESA_Y + 18} p={{ ...p, placa: ['MÁQUINA DE', 'TORSIÓN'] }} />
    </svg>
  );
}
