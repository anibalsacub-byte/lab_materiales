import { MESA_Y, RotuloCota, XC } from '../../components/svg/MarcoMaquinaSVG';

/**
 * Montaje de tracción dentro del marco de la máquina universal: mordazas de cuña, probeta tipo
 * «hueso de perro» con estricción localizada y fractura, marcas de calibración, extensómetro de
 * pinza y cotas.
 */

const GAUGE0 = 128;
const HOMBRO = 40;
const FILETE = 12;
const CUERPO_MORDAZA = 34;

/** Borde superior del travesaño móvil para un alargamiento visual dado (sube con la probeta). */
export function yTravesanoTraccion(alargamientoVisual: number): number {
  return MESA_Y - 2 * (CUERPO_MORDAZA + HOMBRO + FILETE) - GAUGE0 * (1 + alargamientoVisual) - 24;
}

interface Props {
  /** Alargamiento visual de la zona calibrada, como fracción de su longitud dibujada. */
  alargamientoVisual: number;
  /** Parte uniforme del alargamiento visual (hasta la carga máxima): reduce la sección por igual. */
  alargamientoUniformeVisual: number;
  /** Intensidad de la estricción localizada, 0 (nada) a 1 (en la fractura). */
  estriccion: number;
  fracturada: boolean;
  tipoFractura: 'ductil' | 'fragil';
  mordazasCerradas: boolean;
  /** false cuando la probeta se retiró de la máquina (las mordazas quedan vacías). */
  probetaVisible: boolean;
  seccion: 'circular' | 'rectangular';
  cotas: string[];
}

export function MontajeTraccionSVG(p: Props) {
  const anchoHombro = p.seccion === 'circular' ? 34 : 42;
  const anchoCalibrado = p.seccion === 'circular' ? 20 : 26;
  const abertura = p.mordazasCerradas ? 0 : 5;

  // Geometría vertical (de abajo hacia arriba): la mordaza inferior está fija sobre la mesa y la
  // superior cuelga del travesaño móvil, que sube tanto como se alarga la probeta.
  const yCuerpoInfTop = MESA_Y - CUERPO_MORDAZA;
  const yHombroInfTop = yCuerpoInfTop - HOMBRO;
  const yCalibradoBot = yHombroInfTop - FILETE;
  const largoCalibrado = GAUGE0 * (1 + p.alargamientoVisual);
  const yCalibradoTop = yCalibradoBot - largoCalibrado;
  const yHombroSupBot = yCalibradoTop - FILETE;
  const yHombroSupTop = yHombroSupBot - HOMBRO;
  const yCuerpoSupTop = yHombroSupTop - CUERPO_MORDAZA;

  const factorUniforme = 1 / Math.sqrt(1 + p.alargamientoUniformeVisual);
  const yCuello = (yCalibradoTop + yCalibradoBot) / 2;
  const sigmaCuello = 11 + largoCalibrado * 0.04;
  const medioAncho = (y: number) =>
    (anchoCalibrado / 2) * factorUniforme * (1 - 0.48 * p.estriccion * Math.exp(-((y - yCuello) ** 2) / (2 * sigmaCuello ** 2)));

  // Perfil izquierdo completo de la probeta, de arriba hacia abajo: hombro, transición, zona
  // calibrada (con la estricción) y hombro inferior. El lado derecho es su espejo.
  const perfil: [number, number][] = [[XC - anchoHombro / 2, yHombroSupTop], [XC - anchoHombro / 2, yHombroSupBot]];
  const nCalibrado = 48;
  for (let i = 0; i <= nCalibrado; i++) {
    const y = yCalibradoTop + ((yCalibradoBot - yCalibradoTop) * i) / nCalibrado;
    perfil.push([XC - medioAncho(y), y]);
  }
  perfil.push([XC - anchoHombro / 2, yHombroInfTop], [XC - anchoHombro / 2, yCuerpoInfTop]);

  /** Tramo del perfil izquierdo entre dos alturas, con los extremos interpolados. */
  function tramoIzquierdo(yDesde: number, yHasta: number): [number, number][] {
    const xEn = (y: number) => {
      for (let i = 1; i < perfil.length; i++) {
        const [x0, y0] = perfil[i - 1];
        const [x1, y1] = perfil[i];
        if (y >= y0 && y <= y1) return y1 === y0 ? x1 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
      }
      return perfil[perfil.length - 1][0];
    };
    return [[xEn(yDesde), yDesde], ...perfil.filter(([, y]) => y > yDesde && y < yHasta), [xEn(yHasta), yHasta]];
  }

  /** Polígono: borde superior (der→izq), lado izquierdo (↓), borde inferior (izq→der), lado derecho (↑). */
  function poligono(yDesde: number, yHasta: number, bordeSup: [number, number][] = [], bordeInf: [number, number][] = []) {
    const izq = tramoIzquierdo(yDesde, yHasta);
    const der = izq.map(([x, y]) => [2 * XC - x, y] as [number, number]).reverse();
    return [...bordeSup, ...izq, ...bordeInf, ...der].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  }

  const yTopProbeta = yHombroSupTop;
  const yBotProbeta = yCuerpoInfTop;
  const gap = 7;
  const mw = medioAncho(yCuello);
  // Fractura copa-cono (dúctil): la mitad superior termina en cono y la inferior en la copa
  // complementaria. La frágil es prácticamente plana.
  const prof = p.tipoFractura === 'ductil' ? 5 : 1;
  const ySupRotura = yCuello - gap / 2;
  const yInfRotura = yCuello + gap / 2;
  const roturaSup: [number, number][] = [[XC - mw * 0.45, ySupRotura + prof], [XC + mw * 0.45, ySupRotura + prof]];
  const roturaInf: [number, number][] = [[XC + mw * 0.45, yInfRotura + prof], [XC - mw * 0.45, yInfRotura + prof]];

  const xExt = XC + 52;
  const marcaSup = yCalibradoTop + 3;
  const marcaInf = yCalibradoBot - 3;

  /** Mordaza de cuña: cuerpo + alojamiento cónico + dos cuñas dentadas que aprietan el hombro. */
  function mordaza(yCuerpo: number, yBoca: number, haciaAbajo: boolean) {
    return (
      <g>
        <rect x={XC - 48} y={yCuerpo} width={96} height={CUERPO_MORDAZA} rx={4} fill="url(#umCuerpo)" stroke="#0e1720" strokeWidth={1} />
        <polygon
          points={
            haciaAbajo
              ? `${XC - 40},${yBoca} ${XC + 40},${yBoca} ${XC + 30},${yBoca + HOMBRO} ${XC - 30},${yBoca + HOMBRO}`
              : `${XC - 30},${yBoca} ${XC + 30},${yBoca} ${XC + 40},${yBoca + HOMBRO} ${XC - 40},${yBoca + HOMBRO}`
          }
          fill="url(#umCuerpo)"
          opacity={0.55}
        />
        {[-1, 1].map((lado) => {
          const xInt = XC + lado * (anchoHombro / 2 + abertura);
          const xExtM = xInt + lado * 11;
          return (
            <g key={lado}>
              <polygon points={`${xInt},${yBoca + 2} ${xExtM},${yBoca + 2} ${xExtM},${yBoca + HOMBRO - 2} ${xInt},${yBoca + HOMBRO - 2}`} fill="#3a4654" stroke="#141c25" />
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <line key={k} x1={xInt} y1={yBoca + 6 + k * 6} x2={xInt + lado * 3} y2={yBoca + 9 + k * 6} stroke="#9fb0c2" strokeWidth={0.8} />
              ))}
            </g>
          );
        })}
      </g>
    );
  }

  return (
    <g>
      {mordaza(yCuerpoSupTop, yHombroSupTop, true)}
      {mordaza(yCuerpoInfTop, yHombroInfTop, false)}

      {p.probetaVisible && (
        <>
          <g filter="url(#umSombra)">
            {!p.fracturada ? (
              <polygon points={poligono(yTopProbeta, yBotProbeta)} fill="url(#umProbeta)" stroke="#2a3138" strokeWidth={0.8} />
            ) : (
              <>
                <polygon points={poligono(yTopProbeta, ySupRotura, [], roturaSup)} fill="url(#umProbeta)" stroke="#2a3138" strokeWidth={0.8} />
                <polygon points={poligono(yInfRotura, yBotProbeta, roturaInf)} fill="url(#umProbeta)" stroke="#2a3138" strokeWidth={0.8} />
              </>
            )}
          </g>

          {/* Marcas de calibración (punzón) */}
          {[marcaSup, marcaInf].map((y) => (
            <line key={y} x1={XC - medioAncho(y) - 3} y1={y} x2={XC - medioAncho(y) + 5} y2={y} stroke="#1a1f24" strokeWidth={1.6} />
          ))}

          {/* Extensómetro de pinza */}
          {!p.fracturada && (
            <g>
              <line x1={XC + medioAncho(marcaSup)} y1={marcaSup} x2={xExt} y2={marcaSup} stroke="#c9d3dc" strokeWidth={2} />
              <line x1={XC + medioAncho(marcaInf)} y1={marcaInf} x2={xExt} y2={marcaInf} stroke="#c9d3dc" strokeWidth={2} />
              <rect x={xExt} y={(marcaSup + marcaInf) / 2 - 22} width={20} height={44} rx={3} fill="#e0a526" stroke="#7a5a10" />
              <line x1={xExt + 10} y1={marcaSup} x2={xExt + 10} y2={(marcaSup + marcaInf) / 2 - 22} stroke="#c9d3dc" strokeWidth={1.4} />
              <line x1={xExt + 10} y1={marcaInf} x2={xExt + 10} y2={(marcaSup + marcaInf) / 2 + 22} stroke="#c9d3dc" strokeWidth={1.4} />
              <text x={xExt + 26} y={(marcaSup + marcaInf) / 2 + 3} fontSize="9" fill="#a9bdd1">Extensómetro</text>
            </g>
          )}

          {/* Cota de la longitud entre marcas */}
          <g stroke="#7f97b0" strokeWidth={1}>
            <line x1={XC - 58} y1={marcaSup} x2={XC - 58} y2={marcaInf} />
            <line x1={XC - 63} y1={marcaSup} x2={XC - 53} y2={marcaSup} />
            <line x1={XC - 63} y1={marcaInf} x2={XC - 53} y2={marcaInf} />
          </g>
          <RotuloCota xDerecha={XC - 66} yCentro={(marcaSup + marcaInf) / 2} lineas={p.cotas} />
        </>
      )}
    </g>
  );
}
