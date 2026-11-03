import { useEffect, useRef, useState } from 'react';
import { FichaMaterial } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { BarraPasos, ChipsMaterial, DisplayDigital, Icono, Segmentado, Stepper } from '../../components/lab/LabUI';
import { CasillasGrafico, EcuacionesVivo, ResumenItem, fmt, useModoLab, type Ecuacion } from '../../components/lab/PanelesEnsayo';
import { COLORES_PROBETA } from '../../components/lab/coloresProbeta';
import { GraficoEnsayo, type CurvaComparada, type OpcionesGrafico, type PuntoClave, type RegionGrafico } from '../../components/svg/GraficoEnsayo';
import { MaquinaCharpySVG, type EstadoProbetaCharpy } from './MaquinaCharpySVG';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { descargarArchivo, exportarSesionJSON, exportarSvgComoPng } from '../../trial/exportar';
import { obtenerMaterial } from '../../engine/materials';
import { medir, INSTRUMENTOS } from '../../engine/measurement';
import {
  DATOS_IMPACTO,
  G,
  PENDULO_CHARPY,
  areaLigamento,
  energiaCharpy,
  energiaDesdeAngulos,
  energiaPotencial,
  fraccionFracturaDuctil,
  temperaturaParaEnergia,
  temperaturaProbeta,
  velocidadImpacto,
  type Entalla,
} from '../../engine/mechanics/impact';
import type { LecturaInstrumento } from '../../engine/types';

type Fase = 'reposo' | 'enganchado' | 'oscilando' | 'frenando';

interface EnsayoCharpy {
  n: number;
  materialId: string;
  entalla: Entalla;
  Tbano: number;
  TbanoLeida: number;
  /** Temperatura real de la probeta al recibir el golpe (no la mide el operador). */
  Tgolpe: number;
  traslado: number;
  alfa: number;
  beta: number;
  /** Energía indicada por la máquina, m·g·R·(cos β − cos α): incluye las pérdidas. */
  KVind: number;
  pctDuctil: number;
  rompio: boolean;
  enVacio: boolean;
  motivoInvalido?: string;
}

/** Datos de un golpe que se completan al leer la aguja de arrastre en el punto más alto de la subida. */
type DatosGolpe = Omit<EnsayoCharpy, 'n' | 'TbanoLeida' | 'beta' | 'KVind' | 'motivoInvalido'>;

const T_AMBIENTE = 23;
const TRASLADO_MAX_S = 5;
const ID_GRAFICO = 'grafico-ensayo-charpy';
const { masa_kg: MASA, brazo_m: BRAZO, perdidas_J: PERDIDAS } = PENDULO_CHARPY;
const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: false, energia: false, cuadricula: true, teorica: false, comparar: true };
const COLORES_COMPARADAS = ['#f0b429', '#c792ea', '#3ecf8e', '#ff8a65', '#9fb0c2'];
const PRESETS_T = [
  { valor: '-196', etiqueta: '−196 (N₂)' },
  { valor: '-40', etiqueta: '−40' },
  { valor: '-20', etiqueta: '−20' },
  { valor: '0', etiqueta: '0' },
  { valor: '23', etiqueta: '23' },
  { valor: '60', etiqueta: '60' },
  { valor: '100', etiqueta: '100' },
];

function medioBano(T: number): string {
  if (T <= -80) return 'nitrógeno líquido / mezcla criogénica';
  if (T < 0) return 'alcohol con hielo seco';
  if (T <= 30) return 'agua con hielo / ambiente';
  return 'agua o aceite caliente';
}

function lectura(valor: number, unidad: string): LecturaInstrumento {
  return { valor, unidad, incertidumbre: 0, fueraDeRango: false, advertencias: [] };
}

export function ImpactBench({ onVolver }: { onVolver: () => void }) {
  useModoLab();
  const sesionEnsayo = useSesionEnsayo('banco-9-charpy', 'astm-a36');
  const { sesion } = sesionEnsayo;

  const [Tbano, setTbano] = useState(-20);
  const [alfa, setAlfa] = useState(150);
  const [entalla, setEntalla] = useState<Entalla>('V');
  const [camaraLenta, setCamaraLenta] = useState<'1' | '0.2'>('1');
  const [fase, setFase] = useState<Fase>('reposo');
  const [probeta, setProbeta] = useState<EstadoProbetaCharpy>('ninguna');
  const [ensayos, setEnsayos] = useState<EnsayoCharpy[]>([]);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);
  const [, forzarRender] = useState(0);

  // Estado de la simulación del péndulo (radianes, rad/s, segundos de simulación).
  const sim = useRef({ theta: 0, omega: 0, t: 0, golpeado: false, tRotura: -1, betaMax: 0, tColocada: 0, tSuelta: 0, ultimo: null as EnsayoCharpy | null, pctDuctil: 0, pendiente: null as DatosGolpe | null });
  const s = sim.current;

  const material = obtenerMaterial(sesion.materialId)!;
  const curva = DATOS_IMPACTO[sesion.materialId];
  const E0 = energiaPotencial(MASA, BRAZO, alfa);
  const perdidasMedidas = [...ensayos].reverse().find((e) => e.enVacio && e.alfa === alfa)?.KVind;

  // Reloj de traslado: mientras la probeta espera en los yunques, la pantalla se actualiza.
  useEffect(() => {
    if (probeta !== 'colocada' || fase !== 'enganchado') return;
    const id = setInterval(() => forzarRender((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [probeta, fase]);

  function registrar(e: DatosGolpe, betaReal: number) {
    const n = ensayos.length;
    const op = { semillaEnsayo: sesion.semilla, indicePunto: n, calibrado: true };
    const beta = medir(betaReal, INSTRUMENTOS.escalaPendulo, op).valor ?? betaReal;
    const TbanoLeida = medir(e.Tbano, INSTRUMENTOS.termometroBano, op).valor ?? e.Tbano;
    const KVind = energiaDesdeAngulos(MASA, BRAZO, e.alfa, beta);
    const motivos: string[] = [];
    if (!e.enVacio && !e.rompio) motivos.push('la probeta no rompió');
    if (!e.enVacio && e.traslado > TRASLADO_MAX_S) motivos.push(`traslado de ${fmt(e.traslado, 1)} s (máx. 5 s)`);
    if (!e.enVacio && KVind > 0.8 * energiaPotencial(MASA, BRAZO, e.alfa)) motivos.push('supera el 80 % de la energía disponible');
    const nuevo: EnsayoCharpy = { ...e, n, beta, TbanoLeida, KVind, motivoInvalido: motivos.length ? motivos.join('; ') : undefined };
    s.ultimo = nuevo;
    setEnsayos((prev) => [...prev, nuevo]);
    setSeleccion(n);
    sesionEnsayo.agregarMedicion({
      temperaturaBano: lectura(TbanoLeida, '°C'),
      anguloPartida: lectura(e.alfa, '°'),
      anguloSubida: lectura(beta, '°'),
      energiaIndicada: lectura(Number(KVind.toFixed(2)), 'J'),
      fracturaDuctil: lectura(Math.round(e.pctDuctil), '%'),
      tiempoTraslado: lectura(Number(e.traslado.toFixed(1)), 's'),
    });
  }

  // Bucle del péndulo: θ'' = −(g/R)·sen θ, integrado con pasos pequeños; en el punto bajo pierde la
  // energía que absorbe la probeta (más las pérdidas por rozamiento, concentradas ahí).
  const pasoRef = useRef<(dt: number) => void>(() => {});
  pasoRef.current = (dt: number) => {
    const h = 0.0005;
    let restante = dt;
    while (restante > 1e-9) {
      const paso = Math.min(h, restante);
      restante -= paso;
      // Freno de mano del operador tras leer la aguja: amortiguamiento fuerte, el péndulo se detiene en ~2 s.
      const freno = fase === 'frenando' ? 7 : 0;
      const antes = s.theta;
      // Integración semi-implícita (simpléctica): conserva la energía del péndulo.
      s.omega += (-(G / BRAZO) * Math.sin(s.theta) - freno * s.omega) * paso;
      s.theta += s.omega * paso;
      s.t += paso;

      if (!s.golpeado && antes > 0 && s.theta <= 0) {
        s.golpeado = true;
        const Ecin = 0.5 * MASA * BRAZO ** 2 * s.omega ** 2;
        if (probeta === 'colocada' && curva) {
          const traslado = (s.tSuelta - s.tColocada) / 1000 + s.t;
          const Tgolpe = temperaturaProbeta(Tbano, T_AMBIENTE, traslado);
          const KV = energiaCharpy(curva, Tgolpe, entalla);
          const pct = fraccionFracturaDuctil(curva, KV, entalla);
          s.pctDuctil = pct;
          if (KV + PERDIDAS >= Ecin) {
            // La energía no alcanza: la probeta se dobla sin romper y frena el péndulo.
            s.omega = 0;
            s.theta = 0;
            setProbeta('atascada');
            registrar({ materialId: sesion.materialId, entalla, Tbano, Tgolpe, traslado, alfa, pctDuctil: pct, rompio: false, enVacio: false }, 0);
            setFase('frenando');
            return;
          }
          s.omega = -Math.sqrt((2 * (Ecin - KV - PERDIDAS)) / (MASA * BRAZO ** 2));
          s.tRotura = s.t;
          setProbeta('rota');
          s.pendiente = { materialId: sesion.materialId, entalla, Tbano, Tgolpe, traslado, alfa, pctDuctil: pct, rompio: true, enVacio: false };
        } else {
          s.omega = -Math.sqrt((2 * Math.max(Ecin - PERDIDAS, 0)) / (MASA * BRAZO ** 2));
          s.pendiente = { materialId: sesion.materialId, entalla, Tbano, Tgolpe: T_AMBIENTE, traslado: 0, alfa, pctDuctil: 0, rompio: false, enVacio: true };
        }
      }
      if (s.golpeado && s.theta < 0) s.betaMax = Math.max(s.betaMax, (-s.theta * 180) / Math.PI);
      // En el punto más alto de la subida se lee la aguja de arrastre y el operador frena.
      if (fase === 'oscilando' && s.golpeado && s.omega >= 0) {
        if (s.pendiente) registrar(s.pendiente, s.betaMax);
        s.pendiente = null;
        setFase('frenando');
        return;
      }
      if (fase === 'frenando' && Math.abs(s.theta) < 0.01 && Math.abs(s.omega) < 0.05) {
        s.theta = 0;
        s.omega = 0;
        setFase('reposo');
        return;
      }
    }
  };

  useEffect(() => {
    if (fase !== 'oscilando' && fase !== 'frenando') return;
    let id = 0;
    let previo = performance.now();
    const cuadro = (ahora: number) => {
      const dt = Math.min((ahora - previo) / 1000, 0.05) * Number(camaraLenta);
      previo = ahora;
      pasoRef.current(dt);
      forzarRender((n) => n + 1);
      id = requestAnimationFrame(cuadro);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [fase, camaraLenta]);

  // ---------- Acciones ----------

  function subir() {
    s.theta = (alfa * Math.PI) / 180;
    s.omega = 0;
    s.t = 0;
    s.golpeado = false;
    s.betaMax = 0;
    s.tRotura = -1;
    if (probeta !== 'colocada') setProbeta('ninguna');
    setFase('enganchado');
  }

  function colocar() {
    s.tColocada = performance.now();
    setProbeta('colocada');
  }

  function soltar() {
    s.tSuelta = performance.now();
    s.t = 0;
    setFase('oscilando');
  }

  function cambiarMaterial(id: string) {
    if (fase === 'oscilando' || fase === 'frenando') return;
    sesionEnsayo.setMaterial(id);
    if (probeta === 'colocada') setProbeta('ninguna');
  }

  function exportarCSV() {
    const filas = [
      'n,material,entalla,T_bano_C,traslado_s,T_golpe_C,alfa_grados,beta_grados,KV_indicada_J,fractura_ductil_pct,en_vacio,valido,motivo',
      ...ensayos.map((e) =>
        [e.n + 1, e.materialId, e.entalla, e.TbanoLeida, e.traslado.toFixed(1), e.Tgolpe.toFixed(1), e.alfa, e.beta, e.KVind.toFixed(2), e.pctDuctil.toFixed(0), e.enVacio, !e.motivoInvalido, e.motivoInvalido ?? ''].join(','),
      ),
    ];
    descargarArchivo(`charpy-${sesion.id}.csv`, filas.join('\n'), 'text/csv');
  }

  // ---------- Vista ----------

  const enMarcha = fase === 'oscilando' || fase === 'frenando';
  const trasladoAhora = probeta === 'colocada' ? (performance.now() - s.tColocada) / 1000 : 0;
  const ultimo = s.ultimo;
  const kvCorregida = (e: EnsayoCharpy) => e.KVind - (perdidasMedidas ?? 0);
  const anguloVisual = (s.theta * 180) / Math.PI;

  const estadoTexto = (() => {
    if (fase === 'oscilando') return 'Péndulo en movimiento';
    if (fase === 'frenando') return 'Frenando el péndulo';
    if (fase === 'enganchado' && probeta === 'colocada')
      return `Probeta en los yunques — traslado ${fmt(trasladoAhora, 1)} s${trasladoAhora > TRASLADO_MAX_S ? ' (¡más de 5 s! la probeta se está calentando)' : ': suelte antes de 5 s'}`;
    if (fase === 'enganchado') return `Péndulo enganchado a ${fmt(alfa, 0)}° (${fmt(E0, 0)} J). Coloque la probeta desde el baño o suelte en vacío para medir las pérdidas`;
    if (probeta === 'rota' || probeta === 'atascada') return 'Ensayo terminado. Suba el péndulo para el siguiente (los trozos se retiran)';
    return 'Péndulo en reposo — súbalo y engánchelo al ángulo de partida α';
  })();

  // Gráfico de transición: puntos válidos o no, a la temperatura del baño (la que cree el operador).
  const clave = (e: EnsayoCharpy) => `${e.materialId}|${e.entalla}`;
  const grupos = new Map<string, EnsayoCharpy[]>();
  for (const e of ensayos) if (!e.enVacio && e.rompio) grupos.set(clave(e), [...(grupos.get(clave(e)) ?? []), e]);
  const claveActual = `${sesion.materialId}|${entalla}`;
  const puntosActuales = (grupos.get(claveActual) ?? []).map((e) => ({ x: e.TbanoLeida, y: kvCorregida(e) })).sort((a, b) => a.x - b.x);
  const comparadas: CurvaComparada[] = [...grupos.entries()]
    .filter(([k]) => k !== claveActual)
    .map(([k, lista], i) => {
      const [id, ent] = k.split('|');
      return {
        etiqueta: `${obtenerMaterial(id)?.nombreCorto ?? id} · ${ent}`,
        color: COLORES_COMPARADAS[i % COLORES_COMPARADAS.length],
        puntos: lista.map((e) => ({ x: e.TbanoLeida, y: kvCorregida(e) })).sort((a, b) => a.x - b.x),
      };
    });
  const xMin = -200;
  const xMax = 120;
  const yMaxDatos = Math.max(...ensayos.filter((e) => !e.enVacio).map((e) => kvCorregida(e)), curva ? curva.superior : 50, 30);
  const referencia: { x: number; y: number }[] = [];
  if (curva) for (let T = xMin; T <= xMax; T += 2) referencia.push({ x: T, y: energiaCharpy(curva, T, entalla) });
  const T27 = curva ? temperaturaParaEnergia(curva, 27, entalla) : undefined;
  const regiones: RegionGrafico[] =
    curva && curva.estructura === 'BCC' && opciones.teorica
      ? [
          { desde: xMin, hasta: Math.max(curva.T0 - 2 * curva.C - (entalla === 'U' ? 25 : 0), xMin), nombre: 'Frágil', color: '#4f9dff' },
          { desde: curva.T0 - 2 * curva.C - (entalla === 'U' ? 25 : 0), hasta: curva.T0 + 2 * curva.C - (entalla === 'U' ? 25 : 0), nombre: 'Transición', color: '#f0b429' },
          { desde: curva.T0 + 2 * curva.C - (entalla === 'U' ? 25 : 0), hasta: xMax, nombre: 'Dúctil', color: '#3ecf8e' },
        ]
      : [];
  const puntosClave: PuntoClave[] = [];
  if (opciones.teorica && T27 !== undefined && T27 > xMin && T27 < xMax) puntosClave.push({ x: T27, y: 27, etiqueta: `T27J = ${fmt(T27, 0)} °C`, color: '#f0b429' });

  // Estimación de T27J a partir de los datos medidos (interpolación entre los puntos que cruzan 27 J).
  let T27medida: number | undefined;
  for (let i = 1; i < puntosActuales.length; i++) {
    const a = puntosActuales[i - 1];
    const b = puntosActuales[i];
    if ((a.y - 27) * (b.y - 27) <= 0 && a.y !== b.y) {
      T27medida = a.x + ((27 - a.y) * (b.x - a.x)) / (b.y - a.y);
      break;
    }
  }

  const sel = seleccion !== null ? ensayos[seleccion] : undefined;
  const calc = sesion.calculosEstudiante;
  const hayCalculo = ['KV', 'resiliencia'].some((v) => calc[v] !== undefined);
  const Alig = areaLigamento(entalla);
  const pasoActual = fase === 'reposo' && probeta === 'ninguna' ? 1 : fase === 'enganchado' ? 2 : ensayos.length >= 5 ? 4 : 3;

  const ecuaciones: Ecuacion[] = [
    {
      nombre: 'Energía disponible',
      formula: 'E₀ = m·g·R·(1 − cos α)',
      sustitucion: `${fmt(MASA, 1)}·9,81·${fmt(BRAZO, 3)}·(1 − cos ${fmt(alfa, 0)}°)`,
      resultado: `${fmt(E0, 1)} J`,
    },
    { nombre: 'Velocidad de impacto', formula: 'v = √(2·g·R·(1 − cos α))', sustitucion: `√(2·9,81·${fmt(BRAZO, 3)}·(1 − cos ${fmt(alfa, 0)}°))`, resultado: `${fmt(velocidadImpacto(BRAZO, alfa), 2)} m/s` },
    {
      nombre: 'Energía absorbida (indicada)',
      formula: 'KV = m·g·R·(cos β − cos α)',
      sustitucion: ultimo ? `${fmt(MASA, 1)}·9,81·${fmt(BRAZO, 3)}·(cos ${fmt(ultimo.beta, 1)}° − cos ${fmt(ultimo.alfa, 0)}°)` : undefined,
      resultado: ultimo ? `${fmt(ultimo.KVind, 1)} J` : undefined,
      nota: ultimo?.enVacio ? 'Ensayo en vacío: esta energía son las pérdidas por rozamiento y aire.' : undefined,
    },
    {
      nombre: 'Corrección por pérdidas',
      formula: 'KV = KV indicada − pérdidas',
      sustitucion: ultimo && !ultimo.enVacio && perdidasMedidas !== undefined ? `${fmt(ultimo.KVind, 1)} − ${fmt(perdidasMedidas, 2)}` : undefined,
      resultado: ultimo && !ultimo.enVacio && perdidasMedidas !== undefined ? `${fmt(kvCorregida(ultimo), 1)} J` : undefined,
      inactiva: perdidasMedidas === undefined,
      nota: perdidasMedidas === undefined ? 'Haga primero un ensayo en vacío (soltar sin probeta) con el mismo α para medir las pérdidas.' : undefined,
    },
    {
      nombre: 'Resiliencia (energía por área de ligamento)',
      formula: 'a = KV / A_lig',
      sustitucion: ultimo && !ultimo.enVacio ? `${fmt(kvCorregida(ultimo), 1)} J / ${fmt(Alig / 100, 2)} cm²` : undefined,
      resultado: ultimo && !ultimo.enVacio ? `${fmt(kvCorregida(ultimo) / (Alig / 100), 1)} J/cm²` : undefined,
    },
  ];

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 9 — Ensayo de impacto Charpy</div>
          <div className="subtitulo">Péndulo de 300 J, probetas acondicionadas en baño, curva de transición dúctil–frágil y superficie de fractura.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material y temperatura', 'Enganchar péndulo', 'Colocar y soltar', 'Repetir a varias T', 'Curva de transición']} actual={pasoActual} />

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Péndulo de impacto</div>
          <MaquinaCharpySVG
            angulo={anguloVisual}
            alfa={alfa}
            enganchado={fase === 'enganchado'}
            betaArrastre={s.betaMax}
            probeta={probeta}
            pctDuctil={s.pctDuctil}
            tDesdeRotura={s.tRotura >= 0 ? s.t - s.tRotura : 0}
            entalla={entalla}
            Tbano={fmt(Tbano, 0)}
            displayEnergia={ultimo ? fmt(ultimo.KVind, 1) : '—'}
            displayBeta={ultimo ? fmt(ultimo.beta, 1) : '—'}
            enMarcha={enMarcha}
            colorProbeta={COLORES_PROBETA[material.categoria]}
          />
          <div className="maquina-estado">
            <div>
              <span className={`punto ${enMarcha ? 'marcha' : fase === 'enganchado' ? 'pausa' : ''}`} />
              <strong>{estadoTexto}</strong>
            </div>
            <div>
              Baño: <strong>{medioBano(Tbano)}</strong> · ambiente {T_AMBIENTE} °C
              {ultimo && !ultimo.enVacio && <> · último golpe con la probeta a <strong>{fmt(ultimo.Tgolpe, 1)} °C</strong></>}
            </div>
            {ultimo?.motivoInvalido && <div className="texto-alerta">⚠ Ensayo no válido: {ultimo.motivoInvalido}.</div>}
          </div>
          <EcuacionesVivo ecuaciones={ecuaciones} />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Curva de transición dúctil–frágil</div>
          <GraficoEnsayo
            id={ID_GRAFICO}
            titulo="Energía absorbida frente a temperatura"
            subtitulo={`${material.nombre} — entalla en ${entalla}${perdidasMedidas === undefined ? ' · sin corregir por pérdidas' : ''}`}
            xEtiqueta="Temperatura del ensayo T (°C)"
            yEtiqueta="Energía absorbida KV (J)"
            xMin={xMin}
            xMax={xMax}
            yMax={yMaxDatos * 1.15}
            traza={puntosActuales}
            registrados={puntosActuales}
            referencia={curva ? referencia : undefined}
            regiones={regiones}
            puntosClave={puntosClave}
            comparadas={comparadas}
            etiquetaActual={`${material.nombreCorto ?? material.nombre} · ${entalla}`}
            puntoActual={ultimo && !ultimo.enVacio && ultimo.rompio && clave(ultimo) === claveActual ? { x: ultimo.TbanoLeida, y: kvCorregida(ultimo) } : undefined}
            opciones={opciones}
            decimalesX={0}
          />
          <CasillasGrafico
            opciones={opciones}
            setOpciones={setOpciones}
            claves={['etiquetas', 'puntos', 'regiones', 'cuadricula', 'teorica', ...(comparadas.length ? (['comparar'] as const) : [])]}
            nombres={{ teorica: 'Curva de referencia', comparar: 'Otros materiales' }}
          />
          <DisplayDigital
            items={[
              { etiqueta: 'Energía', valor: ultimo ? fmt(ultimo.KVind, 1) : '—', unidad: 'J (indicada)' },
              { etiqueta: 'Subida β', valor: ultimo ? fmt(ultimo.beta, 1) : '—', unidad: '°' },
              { etiqueta: 'Impacto', valor: fmt(velocidadImpacto(BRAZO, alfa), 2), unidad: 'm/s' },
              {
                etiqueta: 'Probeta',
                valor: probeta === 'colocada' ? fmt(temperaturaProbeta(Tbano, T_AMBIENTE, trasladoAhora), 1) : fmt(Tbano, 0),
                unidad: probeta === 'colocada' ? '°C (calentándose)' : '°C (en el baño)',
                alerta: probeta === 'colocada' && trasladoAhora > TRASLADO_MAX_S,
              },
            ]}
          />
          <div className="controles-principales">
            <button className="btn-grande btn-montar" onClick={subir} disabled={fase !== 'reposo'}>
              <Icono tipo="montar" /> Subir y enganchar
            </button>
            <button className="btn-grande" onClick={colocar} disabled={fase !== 'enganchado' || probeta !== 'ninguna' || !curva}>
              Colocar probeta
            </button>
            <button className="btn-grande btn-iniciar" onClick={soltar} disabled={fase !== 'enganchado'}>
              <Icono tipo="play" /> {probeta === 'colocada' ? 'Soltar' : 'Soltar en vacío'}
            </button>
            <button className="btn-grande" onClick={exportarCSV} disabled={ensayos.length === 0}>
              Exportar CSV
            </button>
          </div>
          <div className="datos-vivo">
            <div className="lab-panel-titulo">Ensayos realizados ({ensayos.length})</div>
            {ensayos.length === 0 ? (
              <p className="nota">Cada golpe agrega una fila. Rompa probetas a varias temperaturas para construir la curva de transición.</p>
            ) : (
              <div className="tabla-scroll tabla-relleno">
                <table className="tabla-datos">
                  <thead>
                    <tr><th>#</th><th>Material</th><th>T baño (°C)</th><th>Traslado (s)</th><th>β (°)</th><th>KV (J)</th><th>Dúctil</th><th>Válido</th></tr>
                  </thead>
                  <tbody>
                    {ensayos.map((e, i) => (
                      <tr key={e.n} onClick={() => setSeleccion(i)} className={i === seleccion ? 'fila-seleccionada' : ''}>
                        <td>{e.n + 1}</td>
                        <td>{e.enVacio ? 'En vacío' : `${obtenerMaterial(e.materialId)?.nombreCorto ?? e.materialId} · ${e.entalla}`}</td>
                        <td>{e.enVacio ? '—' : fmt(e.TbanoLeida, 1)}</td>
                        <td>{e.enVacio ? '—' : fmt(e.traslado, 1)}</td>
                        <td>{fmt(e.beta, 1)}</td>
                        <td>{e.enVacio ? `${fmt(e.KVind, 2)} (pérdidas)` : fmt(kvCorregida(e), 1)}</td>
                        <td>{e.enVacio ? '—' : `${fmt(e.pctDuctil, 0)} %`}</td>
                        <td title={e.motivoInvalido}>{e.enVacio ? '—' : e.motivoInvalido ? '✗' : '✓'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Configuración del ensayo</div>
          <div className="fila-controles">
            <Stepper etiqueta="Temperatura del baño (°C)" valor={Tbano} onChange={setTbano} min={-196} max={100} paso={5} decimales={0} disabled={probeta === 'colocada'} />
            <Stepper etiqueta="Ángulo de partida α (°)" valor={alfa} onChange={setAlfa} min={30} max={150} paso={5} decimales={0} disabled={fase !== 'reposo'} />
            <Segmentado<Entalla>
              etiqueta="Entalla"
              opciones={[{ valor: 'V', etiqueta: 'V (2 mm)' }, { valor: 'U', etiqueta: 'U (5 mm)' }]}
              valor={entalla}
              onChange={setEntalla}
              disabled={probeta === 'colocada'}
            />
          </div>
          <div className="fila-controles">
            <Segmentado
              etiqueta="Baño: temperaturas habituales"
              opciones={PRESETS_T}
              valor={String(Tbano)}
              onChange={(v) => setTbano(Number(v))}
              disabled={probeta === 'colocada'}
            />
            <Segmentado<'1' | '0.2'>
              etiqueta="Velocidad de la animación"
              opciones={[{ valor: '1', etiqueta: 'Real' }, { valor: '0.2', etiqueta: 'Cámara lenta' }]}
              valor={camaraLenta}
              onChange={setCamaraLenta}
            />
          </div>
          <p className="nota">
            Péndulo: m = {fmt(MASA, 1)} kg, R = {fmt(BRAZO, 3)} m · probeta 10 × 10 × 55 mm, ligamento {fmt(Alig, 0)} mm² · {INSTRUMENTOS.escalaPendulo.nombre} (0,1°) ·{' '}
            {perdidasMedidas !== undefined ? `pérdidas medidas en vacío: ${fmt(perdidasMedidas, 2)} J` : 'pérdidas aún no medidas'}.
          </p>
          <p className="nota">
            Las normas (ASTM E23, ISO 148-1) exigen romper la probeta antes de 5 s desde que sale del baño, y que la energía absorbida no
            supere el 80 % de la disponible.
          </p>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la probeta</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={cambiarMaterial} disabled={enMarcha || probeta === 'colocada'} filtro={(id) => id in DATOS_IMPACTO} />
          <p className="nota">
            {curva
              ? curva.estructura === 'BCC'
                ? 'Acero o fundición nodular (red BCC): tiene transición dúctil–frágil.'
                : curva.estructura === 'FCC'
                  ? 'Metal FCC: no tiene transición; su tenacidad cambia poco con la temperatura.'
                  : 'Fundición gris: frágil a cualquier temperatura (el grafito laminar actúa como entallas internas).'
              : 'Sin datos de impacto para este material.'}{' '}
            Curvas de referencia ilustrativas (forma según Callister y ASM Handbook), no datos certificados.
          </p>
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <div className="fila" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => exportarSesionJSON(sesion)}>Exportar JSON</button>
            <button onClick={() => exportarSvgComoPng(ID_GRAFICO, `curva-charpy-${sesion.materialId}.png`)}>Gráfico PNG</button>
            <button onClick={() => window.print()}>Imprimir</button>
          </div>
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          {!sel ? (
            <p className="nota">Seleccione un ensayo de la tabla. Con α y β calcule KV = m·g·R·(cos β − cos α) y la resiliencia a = KV/A_lig.</p>
          ) : (
            <>
              <p className="nota">
                Ensayo {sel.n + 1}: α = {fmt(sel.alfa, 0)}°, β = {fmt(sel.beta, 1)}°, m = {fmt(MASA, 1)} kg, R = {fmt(BRAZO, 3)} m, g = 9,81 m/s², A_lig = {fmt(areaLigamento(sel.entalla) / 100, 2)} cm²
              </p>
              <div className="fila campo">
                <div><label>KV calculada (J)</label><input type="number" value={calc.KV ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('KV', Number(e.target.value))} /></div>
                <div><label>Resiliencia (J/cm²)</label><input type="number" value={calc.resiliencia ?? ''} onChange={(e) => sesionEnsayo.registrarCalculo('resiliencia', Number(e.target.value))} /></div>
              </div>
              {hayCalculo && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="KV (indicada, con pérdidas)" valorEstudiante={calc.KV} valorReferencia={sel.KVind} unidad="J" />
                  <FilaValidacion etiqueta="Resiliencia" valorEstudiante={calc.resiliencia} valorReferencia={sel.KVind / (areaLigamento(sel.entalla) / 100)} unidad="J/cm²" />
                </TablaValidacion>
              )}
            </>
          )}
        </section>

        <section className="lab-panel">
          {puntosActuales.length >= 3 && (
            <>
              <div className="lab-panel-titulo">Resumen de la curva ({material.nombreCorto ?? material.nombre} · {entalla})</div>
              <div className="resumen-ensayo">
                <ResumenItem etiqueta="Ensayos con rotura" valor={String(puntosActuales.length)} />
                <ResumenItem etiqueta="T27J estimada de sus datos" valor={T27medida !== undefined ? `${fmt(T27medida, 0)} °C` : 'Sin cruce con 27 J'} />
                <ResumenItem etiqueta="Estante inferior (mín. medido)" valor={`${fmt(Math.min(...puntosActuales.map((p) => p.y)), 1)} J`} />
                <ResumenItem etiqueta="Estante superior (máx. medido)" valor={`${fmt(Math.max(...puntosActuales.map((p) => p.y)), 1)} J`} />
                {opciones.teorica && T27 !== undefined && <ResumenItem etiqueta="T27J de la curva de referencia" valor={`${fmt(T27, 0)} °C`} />}
              </div>
              <p className="nota">
                T27J es la temperatura a la que la probeta absorbe 27 J, criterio habitual de tenacidad en aceros estructurales: por encima, el
                acero se considera apto para esa temperatura de servicio.
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => sesionEnsayo.registrarConclusiones(e.target.value)}
            placeholder="Temperatura de transición, aspecto de la fractura, efecto del carbono o de la entalla, BCC frente a FCC…"
          />
        </section>
      </div>
    </div>
  );
}
