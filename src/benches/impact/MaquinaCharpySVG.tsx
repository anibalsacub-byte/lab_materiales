import { DefsMaquina, type ColoresProbeta } from '../../components/svg/MarcoMaquinaSVG';

/**
 * Péndulo de impacto Charpy (vista lateral): bastidor, péndulo con martillo, escala graduada con la
 * aguja de arrastre (la empuja el péndulo y queda en el ángulo máximo de subida β), gancho de
 * suelta, yunques con la probeta, baño termostático y un recuadro con la vista superior de la
 * probeta y, tras la rotura, su superficie de fractura (zona fibrosa dúctil frente a zona
 * cristalina frágil).
 */

// Brazo dibujado de 180 px: así el péndulo cabe entero incluso a 150° (su punto más alto queda en y ≈ 22).
const PX = 260;
const PY = 180;
const R = 180;
const Y_IMPACTO = PY + R;
const Y_BASE = 404;

export type EstadoProbetaCharpy = 'ninguna' | 'colocada' | 'rota' | 'atascada';

interface Props {
  /** Ángulo del péndulo en grados: positivo a la derecha (lado de partida), negativo a la izquierda. */
  angulo: number;
  alfa: number;
  enganchado: boolean;
  /** Ángulo máximo alcanzado del lado de subida (aguja de arrastre), en grados positivos. */
  betaArrastre: number;
  probeta: EstadoProbetaCharpy;
  /** Porcentaje de fractura dúctil (fibrosa) de la última rotura. */
  pctDuctil: number;
  /** Instante desde la rotura (s), para animar los trozos. */
  tDesdeRotura: number;
  entalla: 'V' | 'U';
  Tbano: string;
  displayEnergia: string;
  displayBeta: string;
  enMarcha: boolean;
  colorProbeta: ColoresProbeta;
}

function polar(anguloDeg: number, radio: number) {
  const a = (anguloDeg * Math.PI) / 180;
  return { x: PX + radio * Math.sin(a), y: PY + radio * Math.cos(a) };
}

export function MaquinaCharpySVG(p: Props) {
  const rEscala = 66;
  const marcas = Array.from({ length: 65 }, (_, i) => i * 5 - 160); // −160° … +160°, todo el recorrido del péndulo
  const gancho = polar(p.alfa, R + 18);
  const aguja = polar(-p.betaArrastre, rEscala - 6);
  const t = Math.min(p.tDesdeRotura, 0.6);
  const ductil = p.pctDuctil > 50;

  // Probeta en la vista lateral: sección de 10×10 mm sobre los yunques, con la entalla hacia el lado
  // opuesto al golpe (el martillo llega desde la derecha y golpea la cara sin entalla).
  const lado = 16;
  const xProbeta = PX - lado / 2;
  const yProbeta = Y_IMPACTO - lado / 2 + 4;

  return (
    <svg viewBox="0 0 520 600" width="100%" role="img" aria-label="Péndulo de impacto Charpy" style={{ display: 'block' }}>
      <DefsMaquina colorProbeta={p.colorProbeta} />
      <rect x={0} y={0} width={520} height={600} fill="url(#umFondo)" rx={10} />

      {/* Bastidor: dos montantes hasta el eje y la base */}
      <polygon points={`${PX - 150},${Y_BASE} ${PX - 118},${Y_BASE} ${PX - 12},${PY + 4} ${PX - 30},${PY + 4}`} fill="url(#umCuerpo)" stroke="#0e1720" />
      <polygon points={`${PX + 150},${Y_BASE} ${PX + 118},${Y_BASE} ${PX + 12},${PY + 4} ${PX + 30},${PY + 4}`} fill="url(#umCuerpo)" stroke="#0e1720" />
      <rect x={60} y={Y_BASE} width={400} height={26} rx={4} fill="url(#umTravesano)" filter="url(#umSombra)" />

      {/* Escala graduada y aguja de arrastre */}
      <circle cx={PX} cy={PY} r={rEscala + 10} fill="#e8edf2" stroke="#55606b" strokeWidth={2} opacity={0.95} />
      {marcas.map((m) => {
        const largo = m % 30 === 0 ? 10 : 5;
        const a = polar(m, rEscala + 8);
        const b = polar(m, rEscala + 8 - largo);
        return <line key={m} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#33404d" strokeWidth={m % 30 === 0 ? 1.4 : 0.8} />;
      })}
      {marcas.filter((m) => m % 30 === 0).map((m) => {
        const q = polar(m, rEscala - 12);
        return (
          <text key={m} x={q.x} y={q.y + 3} textAnchor="middle" fontSize="8" fill="#33404d">
            {Math.abs(m)}°
          </text>
        );
      })}
      <text x={PX} y={PY - 38} textAnchor="middle" fontSize="7" fill="#55606b">← subida β · partida α →</text>
      <line x1={PX} y1={PY} x2={aguja.x} y2={aguja.y} stroke="#c0392b" strokeWidth={2} strokeLinecap="round" />
      <text x={PX} y={PY - 30} textAnchor="middle" fontSize="7" fill="#c0392b">aguja de arrastre</text>

      {/* Gancho de suelta en α */}
      <g>
        <line x1={PX + (R + 34) * Math.sin((p.alfa * Math.PI) / 180)} y1={PY + (R + 34) * Math.cos((p.alfa * Math.PI) / 180)} x2={gancho.x} y2={gancho.y} stroke="#9fb0c2" strokeWidth={3} />
        <circle cx={gancho.x} cy={gancho.y} r={5} fill={p.enganchado ? '#f0b429' : '#55606b'} stroke="#2a3442" />
      </g>

      {/* Yunques */}
      <rect x={PX - 46} y={Y_IMPACTO + 12} width={92} height={Y_BASE - Y_IMPACTO - 12} fill="url(#umCuerpoV)" stroke="#0e1720" />
      <polygon points={`${PX - 30},${Y_IMPACTO + 12} ${PX - 14},${Y_IMPACTO + 12} ${PX - 14},${Y_IMPACTO + 4} ${PX - 22},${Y_IMPACTO + 4}`} fill="#9fb0c2" />

      {/* Probeta en los yunques */}
      {p.probeta === 'colocada' && (
        <g filter="url(#umSombra)">
          <rect x={xProbeta} y={yProbeta} width={lado} height={lado} fill="url(#umProbeta)" stroke="#2a3138" />
          {/* Entalla en la cara izquierda (opuesta al golpe) */}
          {p.entalla === 'V' ? (
            <polygon points={`${xProbeta},${yProbeta + lado / 2 - 3} ${xProbeta + 4},${yProbeta + lado / 2} ${xProbeta},${yProbeta + lado / 2 + 3}`} fill="#0c1620" />
          ) : (
            <rect x={xProbeta} y={yProbeta + lado / 2 - 2} width={6} height={4} rx={2} fill="#0c1620" />
          )}
        </g>
      )}
      {p.probeta === 'atascada' && (
        <rect x={xProbeta - 4} y={yProbeta + 2} width={lado + 4} height={lado - 2} fill="url(#umProbeta)" stroke="#2a3138" transform={`rotate(-12 ${PX} ${Y_IMPACTO})`} />
      )}
      {p.probeta === 'rota' && (
        // Los dos trozos salen despedidos hacia el lado de subida y caen a la bandeja.
        <g filter="url(#umSombra)">
          <rect x={xProbeta - 70 * t} y={yProbeta + 50 * t * t * 2} width={lado * 0.9} height={lado} fill="url(#umProbeta)" stroke="#2a3138" transform={`rotate(${-80 * t} ${xProbeta - 70 * t + 7} ${yProbeta + 100 * t * t + 8})`} />
          <rect x={xProbeta - 40 * t} y={yProbeta + 30 * t * t * 2} width={lado * 0.9} height={lado} fill="url(#umProbeta)" stroke="#2a3138" transform={`rotate(${60 * t} ${xProbeta - 40 * t + 7} ${yProbeta + 60 * t * t + 8})`} />
        </g>
      )}

      {/* Péndulo */}
      <g transform={`rotate(${-p.angulo} ${PX} ${PY})`} filter="url(#umSombra)">
        <rect x={PX - 7} y={PY} width={14} height={R - 34} rx={3} fill="url(#umCromado)" stroke="#3a4654" />
        {/* Martillo: masa en forma de C con el filo de impacto abajo */}
        <path d={`M${PX - 44},${PY + R - 40} h88 a8,8 0 0 1 8,8 v36 a8,8 0 0 1 -8,8 h-30 l-10,-10 h-16 l-10,10 h-30 a8,8 0 0 1 -8,-8 v-36 a8,8 0 0 1 8,-8 z`} fill="url(#umTravesano)" stroke="#0e1d2c" />
        <polygon points={`${PX - 4},${PY + R + 2} ${PX + 4},${PY + R + 2} ${PX + 6},${PY + R - 4} ${PX - 6},${PY + R - 4}`} fill="#d3dce4" />
      </g>
      <circle cx={PX} cy={PY} r={9} fill="#33404d" stroke="#0e1720" strokeWidth={2} />

      {/* Baño termostático (a la derecha de la consola, fuera del recorrido del péndulo) */}
      <g transform="translate(428, 470)">
        <rect x={0} y={0} width={86} height={118} rx={6} fill="url(#umGabinete)" stroke="#0f2236" />
        <rect x={8} y={24} width={70} height={58} rx={3} fill="#0a2236" stroke="#2b3f52" />
        <rect x={8} y={44} width={70} height={38} fill="#2d6f9c" opacity={0.55} />
        {p.probeta === 'ninguna' && <rect x={33} y={50} width={20} height={20} fill="url(#umProbeta)" opacity={0.85} />}
        <text x={43} y={15} textAnchor="middle" fontSize="7.5" fill="#c3d2e0" fontWeight="bold">BAÑO</text>
        <text x={43} y={102} textAnchor="middle" fontSize="11" fill="#59f0b0" fontFamily="'IBM Plex Mono', monospace">{p.Tbano} °C</text>
      </g>

      {/* Vista superior de la probeta y superficie de fractura (a la izquierda de la consola) */}
      <g transform="translate(5, 470) scale(0.7)">
        <rect x={0} y={0} width={124} height={118} rx={6} fill="#0c1620" stroke="#22344a" />
        <text x={62} y={13} textAnchor="middle" fontSize="7.5" fill="#a9bdd1">{p.probeta === 'rota' ? 'SUPERFICIE DE FRACTURA' : 'VISTA SUPERIOR'}</text>
        {p.probeta === 'rota' ? (
          <g>
            {/* Zona fibrosa (dúctil, mate) alrededor de la zona cristalina (frágil, brillante) */}
            <rect x={32} y={24} width={60} height={60} fill={ductil ? '#7d858c' : '#8c949b'} stroke="#2a3138" />
            {(() => {
              const fragil = Math.sqrt(Math.max(100 - p.pctDuctil, 0) / 100);
              const ancho = 60 * fragil;
              const alto = 48 * fragil;
              return (
                <g>
                  <rect x={62 - ancho / 2} y={24 + 12 + (48 - alto) / 2} width={ancho} height={alto} fill="#dfe6ec" />
                  {Array.from({ length: Math.round(18 * fragil) }, (_, i) => (
                    <circle key={i} cx={62 - ancho / 2 + ((i * 37) % Math.max(ancho, 1))} cy={36 + (48 - alto) / 2 + ((i * 23) % Math.max(alto, 1))} r={1.1} fill="#ffffff" />
                  ))}
                </g>
              );
            })()}
            <rect x={32} y={24} width={60} height={12} fill="#0c1620" opacity={0.6} />
            <text x={62} y={33} textAnchor="middle" fontSize="6" fill="#a9bdd1">entalla</text>
            <text x={62} y={100} textAnchor="middle" fontSize="9" fill="#e3edf7" fontFamily="'IBM Plex Mono', monospace">{p.pctDuctil.toFixed(0)} % dúctil</text>
            <text x={62} y={111} textAnchor="middle" fontSize="6.5" fill="#7f97b0">mate = dúctil · brillante = frágil</text>
          </g>
        ) : (
          <g>
            {/* Probeta de 55 mm sobre yunques separados 40 mm; el martillo golpea en el centro, frente a la entalla */}
            <rect x={14} y={78} width={18} height={14} fill="url(#umCuerpoV)" />
            <rect x={92} y={78} width={18} height={14} fill="url(#umCuerpoV)" />
            {p.probeta !== 'ninguna' && (
              <g>
                <rect x={8} y={60} width={108} height={18} fill="url(#umProbetaH)" stroke="#2a3138" />
                <polygon points={`${59},78 ${65},78 ${62},70`} fill="#0c1620" />
              </g>
            )}
            <polygon points="56,34 68,34 62,52" fill="#d3dce4" />
            <text x={62} y={30} textAnchor="middle" fontSize="6.5" fill="#a9bdd1">martillo</text>
            <text x={62} y={104} textAnchor="middle" fontSize="6.5" fill="#7f97b0">55 mm · apoyos a 40 mm</text>
          </g>
        )}
      </g>

      {/* Consola: energía absorbida y ángulo de subida */}
      <g transform="translate(96, 470)">
        <rect x={0} y={0} width={328} height={118} rx={6} fill="url(#umGabinete)" stroke="#0f2236" />
        <rect x={18} y={12} width={150} height={78} rx={5} fill="#05090d" stroke="#2b3f52" />
        <text x={28} y={28} fontSize="8" fill="#5f7a92">ENERGÍA</text>
        <text x={140} y={48} textAnchor="end" fontSize="21" fill="#59f0b0" fontFamily="'IBM Plex Mono', monospace">{p.displayEnergia}</text>
        <text x={145} y={48} fontSize="9" fill="#59f0b0">J</text>
        <text x={28} y={64} fontSize="8" fill="#5f7a92">SUBIDA β</text>
        <text x={140} y={81} textAnchor="end" fontSize="15" fill="#f0b429" fontFamily="'IBM Plex Mono', monospace">{p.displayBeta}</text>
        <text x={145} y={81} fontSize="9" fill="#f0b429">°</text>
        <rect x={182} y={16} width={86} height={34} rx={3} fill="#dfe6ec" stroke="#8a99a8" />
        <text x={225} y={30} textAnchor="middle" fontSize="7.5" fill="#1d2a38" fontWeight="bold">PÉNDULO CHARPY</text>
        <text x={225} y={41} textAnchor="middle" fontSize="7.5" fill="#1d2a38" fontWeight="bold">300 J</text>
        <circle cx={204} cy={72} r={6} fill={p.enMarcha ? '#4dff9a' : '#1f4a33'} stroke="#0c1c13" />
        <text x={204} y={90} textAnchor="middle" fontSize="7" fill="#c3d2e0">EN MARCHA</text>
        <circle cx={262} cy={72} r={6} fill={p.enganchado ? '#f0b429' : '#4a3a12'} stroke="#2b2207" />
        <text x={262} y={90} textAnchor="middle" fontSize="7" fill="#c3d2e0">ENGANCHADO</text>
      </g>
    </svg>
  );
}
