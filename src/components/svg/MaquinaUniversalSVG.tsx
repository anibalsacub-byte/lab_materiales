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
  enMarcha: boolean;
  seccion: 'circular' | 'rectangular';
  /** Carga instantánea (kN). */
  displayCarga: string;
  /** Carga máxima alcanzada en el ensayo (kN), retenida como en un indicador real. */
  displayPico: string;
  /** Longitud actual entre marcas de calibración (cambia durante el ensayo). */
  cotaL: string;
  /** Longitud calibrada inicial Lo. */
  cotaLo: string;
  cotaSeccion?: string;
  colorProbeta: { claro: string; medio: string; oscuro: string };
  onParadaEmergencia?: () => void;
}

const XC = 260;
const MESA_Y = 452;
const GAUGE0 = 128;
const HOMBRO = 40;
const FILETE = 12;
const CUERPO_MORDAZA = 34;

export function MaquinaUniversalSVG(p: Props) {
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
  const yTravesano = yCuerpoSupTop - 24;

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
    <svg viewBox="0 0 520 600" width="100%" role="img" aria-label="Máquina universal de ensayos" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="umFondo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1d2a38" />
          <stop offset="78%" stopColor="#141e29" />
          <stop offset="78%" stopColor="#0f161e" />
          <stop offset="100%" stopColor="#0b1117" />
        </linearGradient>
        <linearGradient id="umCromado" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5d6b78" />
          <stop offset="35%" stopColor="#d3dce4" />
          <stop offset="60%" stopColor="#9aa8b5" />
          <stop offset="100%" stopColor="#4c5866" />
        </linearGradient>
        <pattern id="umRosca" width="20" height="5" patternUnits="userSpaceOnUse">
          <rect width="20" height="5" fill="url(#umCromado)" />
          <line x1="0" y1="0" x2="20" y2="5" stroke="#26313d" strokeWidth="1" opacity="0.55" />
        </pattern>
        <linearGradient id="umTravesano" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f6e9c" />
          <stop offset="50%" stopColor="#2b5580" />
          <stop offset="100%" stopColor="#1c3c5e" />
        </linearGradient>
        <linearGradient id="umCuerpo" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a3542" />
          <stop offset="50%" stopColor="#4a5868" />
          <stop offset="100%" stopColor="#252f3b" />
        </linearGradient>
        <linearGradient id="umGabinete" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2f5f8c" />
          <stop offset="100%" stopColor="#1d3f61" />
        </linearGradient>
        <linearGradient id="umProbeta" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={p.colorProbeta.oscuro} />
          <stop offset="35%" stopColor={p.colorProbeta.claro} />
          <stop offset="65%" stopColor={p.colorProbeta.medio} />
          <stop offset="100%" stopColor={p.colorProbeta.oscuro} />
        </linearGradient>
        <filter id="umSombra" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      <rect x={0} y={0} width={520} height={600} fill="url(#umFondo)" rx={10} />

      {/* Columnas roscadas */}
      {[118, 382].map((x) => (
        <rect key={x} x={x} y={36} width={20} height={MESA_Y - 36} fill="url(#umRosca)" stroke="#1a232d" strokeWidth={0.8} />
      ))}

      {/* Travesaño superior fijo */}
      <rect x={96} y={14} width={328} height={26} rx={5} fill="url(#umTravesano)" filter="url(#umSombra)" />
      <rect x={96} y={14} width={328} height={5} rx={2} fill="#ffffff" opacity={0.12} />

      {/* Travesaño móvil + mordaza superior */}
      <rect x={96} y={yTravesano} width={328} height={24} rx={5} fill="url(#umTravesano)" filter="url(#umSombra)" />
      {[112, 376].map((x) => (
        <rect key={x} x={x} y={yTravesano - 3} width={32} height={30} rx={4} fill="#1c3550" stroke="#0e1d2c" />
      ))}
      <rect x={232} y={yTravesano + 6} width={56} height={12} rx={2} fill="#d4a017" />
      <text x={XC} y={yTravesano + 15} textAnchor="middle" fontSize="7" fill="#2b2207" fontWeight="bold">CELDA DE CARGA</text>
      {mordaza(yCuerpoSupTop, yHombroSupTop, true)}

      {/* Mesa y mordaza inferior fija */}
      <rect x={78} y={MESA_Y} width={364} height={18} rx={3} fill="#3b4a59" stroke="#1a232d" />
      {mordaza(yCuerpoInfTop, yHombroInfTop, false)}

      {/* Probeta */}
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

      {/* Cotas */}
      <g stroke="#7f97b0" strokeWidth={1}>
        <line x1={XC - 58} y1={marcaSup} x2={XC - 58} y2={marcaInf} />
        <line x1={XC - 63} y1={marcaSup} x2={XC - 53} y2={marcaSup} />
        <line x1={XC - 63} y1={marcaInf} x2={XC - 53} y2={marcaInf} />
      </g>
      {/* Rótulo sobre un fondo propio para que la columna roscada no lo tape: longitud actual entre
          marcas (cambia durante el ensayo), longitud inicial Lo y sección */}
      <rect x={XC - 150} y={(marcaSup + marcaInf) / 2 - 22} width={88} height={p.cotaSeccion ? 50 : 36} rx={4} fill="#0c1620" opacity={0.9} stroke="#22344a" />
      <text x={XC - 66} y={(marcaSup + marcaInf) / 2 - 8} textAnchor="end" fontSize="11.5" fill="#e3edf7" fontWeight="600" fontStyle="italic">{p.cotaL}</text>
      <text x={XC - 66} y={(marcaSup + marcaInf) / 2 + 7} textAnchor="end" fontSize="10" fill="#a9bdd1" fontStyle="italic">{p.cotaLo}</text>
      {p.cotaSeccion && (
        <text x={XC - 66} y={(marcaSup + marcaInf) / 2 + 21} textAnchor="end" fontSize="10" fill="#7f97b0">{p.cotaSeccion}</text>
      )}

      {/* Gabinete con consola */}
      <rect x={96} y={MESA_Y + 18} width={328} height={118} rx={6} fill="url(#umGabinete)" stroke="#0f2236" />
      <rect x={114} y={MESA_Y + 30} width={150} height={78} rx={5} fill="#05090d" stroke="#2b3f52" />
      {/* Indicador de carga: valor instantáneo y pico retenido (carga máxima del ensayo) */}
      <text x={124} y={MESA_Y + 46} fontSize="8" fill="#5f7a92">CARGA</text>
      <text x={236} y={MESA_Y + 66} textAnchor="end" fontSize="21" fill="#59f0b0" fontFamily="'IBM Plex Mono', monospace">{p.displayCarga}</text>
      <text x={241} y={MESA_Y + 66} fontSize="9" fill="#59f0b0">kN</text>
      <text x={124} y={MESA_Y + 82} fontSize="8" fill="#5f7a92">PICO</text>
      <text x={236} y={MESA_Y + 99} textAnchor="end" fontSize="15" fill="#f0b429" fontFamily="'IBM Plex Mono', monospace">{p.displayPico}</text>
      <text x={241} y={MESA_Y + 99} fontSize="9" fill="#f0b429">kN</text>
      <rect x={278} y={MESA_Y + 34} width={86} height={34} rx={3} fill="#dfe6ec" stroke="#8a99a8" />
      <text x={321} y={MESA_Y + 48} textAnchor="middle" fontSize="7.5" fill="#1d2a38" fontWeight="bold">MÁQUINA UNIVERSAL</text>
      <text x={321} y={MESA_Y + 59} textAnchor="middle" fontSize="7.5" fill="#1d2a38" fontWeight="bold">DE ENSAYOS</text>
      <circle cx={300} cy={MESA_Y + 90} r={6} fill={p.enMarcha ? '#4dff9a' : '#1f4a33'} stroke="#0c1c13" />
      <text x={300} y={MESA_Y + 108} textAnchor="middle" fontSize="7" fill="#c3d2e0">EN MARCHA</text>
      <g onClick={p.onParadaEmergencia} style={{ cursor: p.onParadaEmergencia ? 'pointer' : 'default' }}>
        <title>Parada de emergencia (pausa el ensayo)</title>
        <circle cx={388} cy={MESA_Y + 70} r={22} fill="#f2c200" stroke="#7a6200" />
        <circle cx={388} cy={MESA_Y + 70} r={15} fill="#d42a2a" stroke="#7c1010" />
        <circle cx={385} cy={MESA_Y + 66} r={5} fill="#ff7a7a" opacity={0.5} />
      </g>
      <text x={388} y={MESA_Y + 104} textAnchor="middle" fontSize="7" fill="#c3d2e0">PARADA</text>
    </svg>
  );
}
