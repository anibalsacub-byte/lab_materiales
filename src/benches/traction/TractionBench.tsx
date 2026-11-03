import { useEffect, useMemo, useRef, useState } from 'react';
import { FichaMaterial } from '../../components/MaterialSelector';
import { TablaValidacion, FilaValidacion } from '../../components/FilaValidacion';
import { BarraPasos, ChipsMaterial, DisplayDigital, Icono, Segmentado, Stepper } from '../../components/lab/LabUI';
import { GraficoEnsayo, type OpcionesGrafico, type PuntoClave, type RegionGrafico } from '../../components/svg/GraficoEnsayo';
import { MaquinaUniversalSVG } from '../../components/svg/MaquinaUniversalSVG';
import { useSesionEnsayo } from '../../trial/useSesionEnsayo';
import { exportarMedicionesCSV, exportarSesionJSON, exportarSvgComoPng } from '../../trial/exportar';
import { obtenerMaterial } from '../../engine/materials';
import {
  esfuerzoConHistoria,
  esfuerzoEnDeformacion,
  generarCurvaEsfuerzoDeformacion,
  limiteElasticoOffset,
  parametrosCurvaBilineal,
  trabajoDeformacion,
  type PuntoCurva,
} from '../../engine/mechanics/axial';
import { calcularSeccion } from '../../engine/sections';
import { medir, INSTRUMENTOS, elegirCeldaCarga } from '../../engine/measurement';
import type { CategoriaMaterial, LecturaInstrumento, Material } from '../../engine/types';

/** 'retirada': la probeta se descargó por completo y se sacó de las mordazas; conserva su deformación permanente. */
type EstadoMaquina = 'desmontada' | 'montada' | 'corriendo' | 'pausada' | 'descargando' | 'retirada' | 'fracturada';
type TipoSeccionLocal = 'circular' | 'rectangular';
type FactorTiempo = '1' | '10' | '50';
type PasoJog = '0.001' | '0.01' | '0.1' | '1';

/** Paso de integración del ensayo (s de tiempo simulado). */
const PASO_SIMULACION = 0.02;
/** Adquisición automática: un punto por segundo, o antes si la carga cambió más de este porcentaje. */
const PERIODO_ADQUISICION_S = 1;
const SALTO_ADQUISICION = 0.02;

const ID_GRAFICO = 'grafico-ensayo-traccion';

const COLORES_PROBETA: Record<CategoriaMaterial, { claro: string; medio: string; oscuro: string }> = {
  acero_carbono: { claro: '#e4e9ee', medio: '#a9b4bf', oscuro: '#5f6b77' },
  acero_aleado: { claro: '#dfe5ea', medio: '#9aa6b2', oscuro: '#55606b' },
  acero_inoxidable: { claro: '#f2f5f8', medio: '#c3ccd4', oscuro: '#7a8692' },
  aluminio: { claro: '#f4f6f8', medio: '#cfd6dc', oscuro: '#8e99a3' },
  cobre_aleacion: { claro: '#f6d2a6', medio: '#d08a4e', oscuro: '#8a4f25' },
  fundicion: { claro: '#9aa1a8', medio: '#6c737a', oscuro: '#3d4349' },
  polimero: { claro: '#f4f1e6', medio: '#d9d2bb', oscuro: '#a59d84' },
  impresion_3d: { claro: '#ffcf8a', medio: '#f29b38', oscuro: '#b4651a' },
  compuesto: { claro: '#5b6168', medio: '#3a3f45', oscuro: '#1f2327' },
  desconocido: { claro: '#e4e9ee', medio: '#a9b4bf', oscuro: '#5f6b77' },
};

const OPCIONES_INICIALES: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: true, offset: false, energia: false, cuadricula: true, teorica: false };

interface PuntoVerdadero {
  eps: number;
  sigma: number;
  t: number;
  manual: boolean;
}

interface PuntoTraza extends PuntoCurva {
  /** true si el punto está sobre la curva monótona (no en una descarga/recarga elástica). */
  envolvente: boolean;
}

interface EstadoSimulacion {
  eps: number;
  epsMax: number;
  t: number;
  traza: PuntoTraza[];
  verdaderos: PuntoVerdadero[];
  ultimoT: number;
  ultimoSigma: number;
  /** Mayor lectura de la celda de carga (N): el indicador de pico retiene lo que realmente leyó. */
  picoLeido: number;
}

function simulacionInicial(): EstadoSimulacion {
  return { eps: 0, epsMax: 0, t: 0, traza: [{ epsilon: 0, sigma_MPa: 0, envolvente: true }], verdaderos: [], ultimoT: -Infinity, ultimoSigma: 0, picoLeido: 0 };
}

function fmt(v: number, decimales: number): string {
  // Evita mostrar «-0,00» cuando el ruido de la lectura en vacío es negativo y menor que la resolución.
  const r = Number(v.toFixed(decimales)) || 0;
  return r.toLocaleString('es-PE', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function deformacionFractura(m: Material): number {
  const { epsilonF, sigmaU_MPa, E_MPa } = m.propiedades;
  if (epsilonF !== undefined) return epsilonF;
  if (sigmaU_MPa !== undefined && E_MPa) return sigmaU_MPa / E_MPa;
  return 0.02;
}

/** Velocidad de travesaño sugerida para que el ensayo dure ~1,5 min a tiempo real (orden de ASTM E8). */
function velocidadSugerida(m: Material, L: number): number {
  const v = (deformacionFractura(m) * L) / 1.5;
  return Math.min(Math.max(Math.round(v * 10) / 10, 0.1), 50);
}

/**
 * Deformación transversal: ν en la parte elástica, 0,5 en la plástica (el volumen se conserva al
 * fluir el metal). Es la razón por la que ν solo se mide en la zona elástica.
 */
function deformacionTransversalReal(m: Material, eps: number, sigma: number): number {
  const E = m.propiedades.E_MPa ?? 1;
  const nu = m.propiedades.nu ?? 0.3;
  const elastica = sigma / E;
  const plastica = Math.max(eps - elastica, 0);
  return -(nu * elastica + 0.5 * plastica);
}

export function TractionBench({ onVolver }: { onVolver: () => void }) {
  const { sesion, agregarMedicion, actualizarConfiguracion, registrarCalculo, registrarConclusiones, marcarProbetaDestruida, reiniciarEnsayo } =
    useSesionEnsayo('banco-1-traccion', 'astm-a36');

  const [estado, setEstado] = useState<EstadoMaquina>('desmontada');
  const [tipoSeccion, setTipoSeccion] = useState<TipoSeccionLocal>('circular');
  const [d, setD] = useState(12.5);
  const [b, setB] = useState(12.5);
  const [h, setH] = useState(6);
  const [L, setL] = useState(50);
  const [velocidad, setVelocidad] = useState(() => velocidadSugerida(obtenerMaterial('astm-a36')!, 50));
  const [factorTiempo, setFactorTiempo] = useState<FactorTiempo>('10');
  const [pasoJog, setPasoJog] = useState<PasoJog>('0.01');
  const [tarado, setTarado] = useState(false);
  const [opciones, setOpciones] = useState<OpcionesGrafico>(OPCIONES_INICIALES);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [probetasUsadas, setProbetasUsadas] = useState(1);
  const [, forzarRender] = useState(0);

  const sim = useRef<EstadoSimulacion>(simulacionInicial());
  const tablaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add('modo-lab');
    return () => document.body.classList.remove('modo-lab');
  }, []);

  const material = obtenerMaterial(sesion.materialId)!;
  const pc = useMemo(() => parametrosCurvaBilineal(material), [material]);
  const rp02 = useMemo(() => limiteElasticoOffset(material), [material]);
  const ductil = material.modelo === 'elastico_plastico_bilineal' && pc !== undefined;
  const E = material.propiedades.E_MPa ?? 200000;
  const epsF = deformacionFractura(material);
  const sigmaU = material.propiedades.sigmaU_MPa ?? E * epsF;

  const seccion = useMemo(() => {
    try {
      return tipoSeccion === 'circular' ? calcularSeccion({ tipo: 'circular_maciza', d }) : calcularSeccion({ tipo: 'rectangular', b, h });
    } catch {
      return null;
    }
  }, [tipoSeccion, d, b, h]);
  const A = seccion?.area_mm2 ?? 1;
  const celda = elegirCeldaCarga(sigmaU * A);

  const sigmaDe = (eps: number, epsMax: number) => esfuerzoConHistoria(material, eps, epsMax) ?? 0;

  /** Lecturas de los tres instrumentos para un estado verdadero dado (con su ruido reproducible). */
  function leer(eps: number, sigma: number, indicePunto: number): Record<string, LecturaInstrumento> {
    const op = { semillaEnsayo: sesion.semilla, indicePunto, calibrado: tarado };
    return {
      fuerza: medir(sigma * A, celda, op),
      alargamiento: medir(eps * L, INSTRUMENTOS.extensometroAxial50, op),
      deformacionTransversal: medir(deformacionTransversalReal(material, eps, sigma), INSTRUMENTOS.extensometroTransversal, op),
    };
  }

  function adquirir(manual: boolean) {
    const s = sim.current;
    const sigma = estado === 'fracturada' ? 0 : sigmaDe(s.eps, s.epsMax);
    const tiempo: LecturaInstrumento = { valor: Number(s.t.toFixed(2)), unidad: 's', incertidumbre: 0, fueraDeRango: false, advertencias: [] };
    const lecturas = leer(s.eps, sigma, s.verdaderos.length);
    s.picoLeido = Math.max(s.picoLeido, lecturas.fuerza.valor ?? 0);
    agregarMedicion({ tiempo, ...lecturas });
    s.verdaderos.push({ eps: s.eps, sigma, t: s.t, manual });
    s.ultimoT = s.t;
    s.ultimoSigma = sigma;
  }

  function agregarTraza(sigma: number) {
    const s = sim.current;
    const ultimo = s.traza[s.traza.length - 1];
    const envolvente = s.eps >= s.epsMax - 1e-12;
    if (Math.abs(s.eps - ultimo.epsilon) > epsF / 800 || Math.abs(sigma - ultimo.sigma_MPa) > 0.004 * sigmaU || envolvente !== ultimo.envolvente) {
      s.traza.push({ epsilon: s.eps, sigma_MPa: sigma, envolvente });
    }
  }

  function fracturar() {
    const s = sim.current;
    s.eps = epsF;
    s.epsMax = epsF;
    const sigmaRotura = esfuerzoEnDeformacion(material, epsF) ?? 0;
    s.traza.push({ epsilon: epsF, sigma_MPa: sigmaRotura, envolvente: true }, { epsilon: epsF, sigma_MPa: 0, envolvente: true });
    // La máquina registra el último punto con carga antes de detectar la caída de fuerza.
    const tiempo: LecturaInstrumento = { valor: Number(s.t.toFixed(2)), unidad: 's', incertidumbre: 0, fueraDeRango: false, advertencias: [] };
    const lecturas = leer(epsF, sigmaRotura, s.verdaderos.length);
    s.picoLeido = Math.max(s.picoLeido, lecturas.fuerza.valor ?? 0);
    agregarMedicion({ tiempo, ...lecturas });
    s.verdaderos.push({ eps: epsF, sigma: sigmaRotura, t: s.t, manual: false });
    marcarProbetaDestruida();
    setEstado('fracturada');
  }

  /**
   * Avanza el ensayo `dt` segundos de tiempo simulado, con el travesaño a velocidad constante
   * (control por desplazamiento, como una máquina universal real). Devuelve qué pasó.
   */
  function simular(dt: number, descargando: boolean): 'sigue' | 'fractura' | 'descargada' {
    const s = sim.current;
    let restante = dt;
    while (restante > 1e-9) {
      const paso = Math.min(PASO_SIMULACION, restante);
      restante -= paso;
      s.t += paso;
      const dEps = ((velocidad / 60) * paso) / L;
      if (!descargando) {
        s.eps += dEps;
        if (s.eps >= epsF) return 'fractura';
        s.epsMax = Math.max(s.epsMax, s.eps);
      } else {
        s.eps -= dEps;
        const epsPermanente = Math.max(s.epsMax - sigmaDe(s.epsMax, s.epsMax) / E, 0);
        if (s.eps <= epsPermanente) {
          s.eps = epsPermanente;
          agregarTraza(0);
          adquirir(false);
          return 'descargada';
        }
      }
      const sigma = sigmaDe(s.eps, s.epsMax);
      agregarTraza(sigma);
      if (s.t - s.ultimoT >= PERIODO_ADQUISICION_S || Math.abs(sigma - s.ultimoSigma) >= SALTO_ADQUISICION * sigmaU) adquirir(false);
    }
    return 'sigue';
  }

  // El bucle de animación lee siempre la versión más reciente de `simular` (velocidad, material…).
  const simularRef = useRef(simular);
  simularRef.current = simular;
  const fracturarRef = useRef(fracturar);
  fracturarRef.current = fracturar;
  const factorRef = useRef(Number(factorTiempo));
  factorRef.current = Number(factorTiempo);

  useEffect(() => {
    if (estado !== 'corriendo' && estado !== 'descargando') return;
    let id = 0;
    let previo = performance.now();
    const cuadro = (ahora: number) => {
      const dtReal = Math.min((ahora - previo) / 1000, 0.1);
      previo = ahora;
      const r = simularRef.current(dtReal * factorRef.current, estado === 'descargando');
      forzarRender((n) => n + 1);
      if (r === 'fractura') return fracturarRef.current();
      // Sin carga, el operador abre las mordazas y retira la probeta.
      if (r === 'descargada') return setEstado('retirada');
      id = requestAnimationFrame(cuadro);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [estado]);

  // Mientras el ensayo corre, la tabla sigue al último dato adquirido.
  useEffect(() => {
    if ((estado === 'corriendo' || estado === 'descargando') && tablaRef.current) tablaRef.current.scrollTop = tablaRef.current.scrollHeight;
  }, [sesion.mediciones.length, estado]);

  // ---------- Acciones de la máquina ----------

  function nuevaProbeta(materialId?: string) {
    sim.current = simulacionInicial();
    reiniciarEnsayo(materialId);
    setEstado('desmontada');
    setTarado(false);
    setSeleccion(null);
  }

  function cambiarMaterial(id: string) {
    nuevaProbeta(id);
    setVelocidad(velocidadSugerida(obtenerMaterial(id)!, L));
  }

  function iniciar() {
    if (sim.current.eps === 0) actualizarConfiguracion({ seccion: tipoSeccion, d_mm: d, b_mm: b, h_mm: h, L0_mm: L, A0_mm2: A, velocidad_mm_min: velocidad, celdaCarga: celda.nombre });
    setEstado('corriendo');
  }

  /** Movimiento manual del travesaño (jog), con la máquina detenida. */
  function jog(signo: 1 | -1) {
    const s = sim.current;
    const nuevo = Math.max(s.eps + (signo * Number(pasoJog)) / L, 0);
    if (nuevo >= epsF) {
      s.eps = nuevo;
      fracturar();
      return;
    }
    s.eps = nuevo;
    s.epsMax = Math.max(s.epsMax, nuevo);
    agregarTraza(sigmaDe(s.eps, s.epsMax));
    if (estado === 'montada') setEstado('pausada');
    forzarRender((n) => n + 1);
  }

  function registrarManual() {
    adquirir(true);
    setSeleccion(sim.current.verdaderos.length - 1);
    forzarRender((n) => n + 1);
  }

  // ---------- Estado derivado para la vista ----------

  const s = sim.current;
  const fracturada = estado === 'fracturada';
  const enMovimiento = estado === 'corriendo' || estado === 'descargando';
  // `montada`: la probeta ya se usó (bloquea material y geometría); `enMaquina`: está entre las mordazas.
  const montada = estado !== 'desmontada';
  const retirada = estado === 'retirada';
  const enMaquina = montada && !retirada;
  const sigmaActual = fracturada || retirada ? 0 : sigmaDe(s.eps, s.epsMax);

  const lecturaVivo = enMaquina ? leer(s.eps, sigmaActual, 100000 + Math.floor(s.t * 10)) : null;
  const F = lecturaVivo?.fuerza.valor;
  const ext = lecturaVivo?.alargamiento.valor;
  const displayCarga = F === null || F === undefined ? (enMaquina ? 'OVL' : '—') : fmt(F / 1000, 2);
  const displayExt = ext === null || ext === undefined ? (enMaquina ? 'OVL' : '—') : fmt(ext, 3);
  // Lo que muestra el display también cuenta para el pico (máximo es idempotente: seguro en el render).
  if (typeof F === 'number') s.picoLeido = Math.max(s.picoLeido, F);
  const pico = montada ? s.picoLeido : undefined;
  const displayPico = pico === undefined ? '—' : fmt(pico / 1000, 2);

  const k = Math.min(25, 0.6 / epsF);
  const colorProbeta = COLORES_PROBETA[material.categoria];
  const estriccion = ductil && pc ? Math.min(Math.max((s.epsMax - pc.epsUTS) / (pc.epsF - pc.epsUTS), 0), 1) : 0;

  const regimen = (() => {
    if (!montada) return '—';
    if (retirada) return `Sin carga · deformación permanente εp = ${fmt(s.eps, 4)}`;
    if (fracturada) return ductil ? 'Fractura dúctil (copa y cono)' : 'Fractura frágil';
    if (s.eps < s.epsMax - 1e-9) return 'Descarga / recarga elástica';
    if (!ductil || !pc) return 'Sin fluencia — comportamiento frágil';
    if (s.eps <= pc.epsY) return 'Elástico';
    if (s.eps <= pc.epsPlateauFin) return 'Fluencia (meseta)';
    if (s.eps <= pc.epsUTS) return 'Endurecimiento por deformación';
    return 'Estricción';
  })();

  const textoEstado: Record<EstadoMaquina, string> = {
    desmontada: 'Sin probeta — elija material y geometría, luego monte la probeta',
    montada: 'Probeta montada en las mordazas — lista para ensayar',
    corriendo: `En marcha · travesaño a ${fmt(velocidad, 1)} mm/min`,
    pausada: 'En pausa — puede mover el travesaño manualmente',
    descargando: `Descargando · travesaño a ${fmt(velocidad, 1)} mm/min`,
    retirada: `Probeta retirada — quedó ${fmt(s.eps * L, 3)} mm más larga. Vuelva a montarla para recargarla o use «Nueva probeta»`,
    fracturada: 'Probeta fracturada — la máquina detectó la caída de carga',
  };

  // Gráfico
  const ondular = (eps: number, sigma: number, envolvente: boolean) => {
    // Ondulación cosmética de la meseta (bandas de Lüders): solo visual, el motor no la usa.
    if (!envolvente || !pc || !material.mesetaFluencia || eps < pc.epsY || eps > pc.epsPlateauFin) return sigma;
    const t = (eps - pc.epsY) / (pc.epsPlateauFin - pc.epsY || 1);
    return sigma + Math.sin(t * Math.PI * 6) * pc.sigmaY * 0.012;
  };
  const traza = s.traza.map((p) => ({ x: p.epsilon, y: ondular(p.epsilon, p.sigma_MPa, p.envolvente) }));
  const referencia = useMemo(() => generarCurvaEsfuerzoDeformacion(material, 300, epsF).map((p) => ({ x: p.epsilon, y: p.sigma_MPa })), [material, epsF]);

  const regiones: RegionGrafico[] = [];
  if (pc && ductil) {
    const tramos: RegionGrafico[] = [
      { desde: 0, hasta: pc.epsY, nombre: 'Elástica', color: '#4f9dff' },
      ...(pc.epsPlateauFin > pc.epsY ? [{ desde: pc.epsY, hasta: pc.epsPlateauFin, nombre: 'Fluencia', color: '#f0b429' }] : []),
      { desde: pc.epsPlateauFin, hasta: pc.epsUTS, nombre: 'Endurecimiento', color: '#3ecf8e' },
      { desde: pc.epsUTS, hasta: pc.epsF, nombre: 'Estricción', color: '#ff6b6b' },
    ];
    for (const r of tramos) if (r.desde < s.epsMax) regiones.push({ ...r, hasta: Math.min(r.hasta, s.epsMax) });
  } else if (s.epsMax > 0) {
    regiones.push({ desde: 0, hasta: s.epsMax, nombre: 'Sin fluencia (frágil)', color: '#4f9dff' });
  }

  const puntosClave: PuntoClave[] = [];
  if (pc && ductil && material.mesetaFluencia && s.epsMax >= pc.epsY) puntosClave.push({ x: pc.epsY, y: pc.sigmaY, etiqueta: `σy = ${fmt(pc.sigmaY, 0)} MPa`, color: '#f0b429' });
  if (pc && ductil && s.epsMax >= pc.epsUTS) puntosClave.push({ x: pc.epsUTS, y: pc.sigmaU, etiqueta: `σu = ${fmt(pc.sigmaU, 0)} MPa`, color: '#3ecf8e' });
  if (fracturada) {
    const sigmaRotura = esfuerzoEnDeformacion(material, epsF) ?? 0;
    puntosClave.push({ x: epsF, y: sigmaRotura, etiqueta: ductil ? 'Fractura' : `Fractura · σu = ${fmt(sigmaRotura, 0)} MPa`, color: '#ff5c5c' });
  }
  const lineaOffset = rp02 && s.epsMax >= rp02.epsilon
    ? { desde: { x: 0.002, y: 0 }, hasta: { x: rp02.epsilon, y: rp02.sigma_MPa }, etiqueta: `Rp0,2 = ${fmt(rp02.sigma_MPa, 0)} MPa` }
    : undefined;
  const energia = trabajoDeformacion(s.traza);
  const registrados = s.verdaderos.filter((p) => p.manual).map((p) => ({ x: p.eps, y: p.sigma }));
  const yMax = Math.max(sigmaU, pc?.sigmaY ?? 0) * 1.12;

  // Resumen tras la fractura
  const fuerzas = sesion.mediciones.map((m) => m.lecturas.fuerza?.valor).filter((v): v is number => typeof v === 'number');
  const FmaxMedida = fuerzas.length ? Math.max(...fuerzas) : 0;
  const sigmaRotura = esfuerzoEnDeformacion(material, epsF) ?? 0;
  const alargamientoRotura = Math.max(epsF - sigmaRotura / E, 0) * 100;

  // Calcule y compare
  const puntoSel = seleccion !== null ? s.verdaderos[seleccion] : undefined;
  const medSel = seleccion !== null ? sesion.mediciones[seleccion] : undefined;
  // E y ν solo se pueden obtener de un punto sobre el tramo inicial σ ≈ E·ε (sin deformación permanente).
  // La tolerancia del 5 % admite el tramo bajo de los frágiles (fundición gris: hasta ~25 % de σu,
  // donde la norma toma su módulo secante).
  const elasticoSel = puntoSel !== undefined && puntoSel.sigma > 0 && Math.abs(puntoSel.sigma - E * puntoSel.eps) <= 0.05 * puntoSel.sigma && (!pc || puntoSel.eps <= pc.epsY * 0.98);
  const hayCalculo = ['sigma', 'epsilon', 'E', 'nu'].some((v) => sesion.calculosEstudiante[v] !== undefined);

  const pasoActual = estado === 'desmontada' ? 2 : fracturada ? 4 : 3;
  const valorLectura = (l?: LecturaInstrumento, dec = 3) => (!l ? '—' : l.valor === null ? 'OVL' : fmt(l.valor, dec));

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 1 — Ensayo de tracción</div>
          <div className="subtitulo">Máquina universal de ensayos con control por desplazamiento, adquisición automática de datos y curva σ–ε en tiempo real.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>

      <BarraPasos pasos={['Material', 'Geometría', 'Montaje', 'Ensayo', 'Resultados']} actual={pasoActual} />

      {/* Fila 1: máquina y gráfico */}
      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Máquina universal de ensayos</div>
          <MaquinaUniversalSVG
            alargamientoVisual={Math.min(k * s.eps, 0.6)}
            alargamientoUniformeVisual={Math.min(k * Math.min(s.eps, pc?.epsUTS ?? s.eps), 0.6)}
            estriccion={estriccion}
            fracturada={fracturada}
            tipoFractura={ductil ? 'ductil' : 'fragil'}
            mordazasCerradas={enMaquina}
            probetaVisible={!retirada}
            enMarcha={enMovimiento}
            seccion={tipoSeccion}
            displayCarga={displayCarga}
            displayPico={displayPico}
            cotaL={`L = ${fmt(L * (1 + s.eps), 2)} mm`}
            cotaLo={`Lo = ${fmt(L, 1)} mm`}
            cotaSeccion={tipoSeccion === 'circular' ? `Ø ${fmt(d, 1)}` : `${fmt(b, 1)} × ${fmt(h, 1)}`}
            colorProbeta={colorProbeta}
            onParadaEmergencia={() => enMovimiento && setEstado('pausada')}
          />
          <div className="maquina-estado">
            <div>
              <span className={`punto ${enMovimiento ? 'marcha' : fracturada ? 'rota' : estado === 'pausada' ? 'pausa' : ''}`} />
              <strong>{textoEstado[estado]}</strong>
            </div>
            <div>Régimen: <strong>{regimen}</strong></div>
            <div>
              Lo {fmt(L, 1)} → {fmt(L * (1 + s.eps), 2)} mm (+{fmt(s.eps * 100, 2)} %) · t = {fmt(s.t, 1)} s · escala gráfica del alargamiento ×{fmt(k, 1)}
            </div>
            {enMaquina && !tarado && !fracturada && <div className="texto-alerta">⚠ Instrumentos sin tarar: las lecturas incluyen un error de cero.</div>}
          </div>
        </section>

        {/* Columna de operación: curva, lecturas, mandos de la máquina y datos en vivo (la tabla ocupa el alto restante) */}
        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Curva esfuerzo–deformación</div>
          <GraficoEnsayo
            id={ID_GRAFICO}
            titulo="Curva esfuerzo–deformación (ingenieril)"
            subtitulo={`${material.nombre}${material.condicion ? ` (${material.condicion})` : ''} — tracción`}
            xEtiqueta="Deformación unitaria ε (mm/mm)"
            yEtiqueta="Esfuerzo σ (MPa)"
            xMax={epsF * 1.08}
            yMax={yMax}
            traza={traza}
            referencia={referencia}
            regiones={regiones}
            puntosClave={puntosClave}
            lineaOffset={lineaOffset}
            energia={energia}
            puntoActual={montada ? { x: s.eps, y: ondular(s.eps, sigmaActual, s.eps >= s.epsMax), fracturado: fracturada } : undefined}
            registrados={registrados}
            opciones={opciones}
          />
          <div className="opciones-grafico">
            {(
              [
                ['etiquetas', 'Etiquetas'],
                ['puntos', 'Puntos característicos'],
                ['regiones', 'Regiones'],
                ['offset', 'Offset 0,2 %'],
                ['energia', 'Energía'],
                ['cuadricula', 'Cuadrícula'],
                ['teorica', 'Curva teórica'],
              ] as [keyof OpcionesGrafico, string][]
            ).map(([clave, texto]) => (
              <label key={clave}>
                <input type="checkbox" checked={opciones[clave]} onChange={(e) => setOpciones({ ...opciones, [clave]: e.target.checked })} />
                {texto}
              </label>
            ))}
          </div>
          <DisplayDigital
            items={[
              { etiqueta: 'Carga', valor: displayCarga, unidad: 'kN', alerta: displayCarga === 'OVL' },
              { etiqueta: 'Extensión', valor: displayExt, unidad: 'mm', alerta: displayExt === 'OVL' },
              { etiqueta: 'Esfuerzo', valor: typeof F === 'number' ? fmt(F / A, 1) : '—', unidad: 'MPa' },
              { etiqueta: 'Deformación', valor: typeof ext === 'number' ? fmt(ext / L, 4) : '—', unidad: 'mm/mm' },
            ]}
          />
          <div className="controles-principales">
            {estado === 'desmontada' ? (
              <button className="btn-grande btn-montar" onClick={() => setEstado('montada')} disabled={!seccion}><Icono tipo="montar" /> Montar probeta</button>
            ) : retirada ? (
              <button className="btn-grande btn-montar" onClick={() => setEstado('pausada')} title="Monta de nuevo la misma probeta, con su deformación permanente">
                <Icono tipo="montar" /> Volver a montar
              </button>
            ) : (
              <button className="btn-grande" onClick={() => setEstado('desmontada')} disabled={estado !== 'montada' || s.eps > 0}><Icono tipo="retirar" /> Desmontar</button>
            )}
            <button className="btn-grande" onClick={() => setTarado(true)} disabled={estado !== 'montada' || tarado || s.eps > 0} title="Pone a cero la celda de carga y los extensómetros antes de cargar">
              <Icono tipo="cero" /> {tarado ? 'Tarado ✓' : 'Cero / tara'}
            </button>
            {enMovimiento ? (
              <button className="btn-grande btn-pausa" onClick={() => setEstado('pausada')}><Icono tipo="pausa" /> Pausa</button>
            ) : (
              <button className="btn-grande btn-iniciar" onClick={iniciar} disabled={estado !== 'montada' && estado !== 'pausada'}>
                <Icono tipo="play" /> {estado === 'pausada' ? 'Continuar' : 'Iniciar'}
              </button>
            )}
            <button className="btn-grande" onClick={() => setEstado('descargando')} disabled={!(estado === 'corriendo' || estado === 'pausada') || sigmaActual <= 0} title="Descarga hasta carga cero y retira la probeta">
              <Icono tipo="descargar" />
              Descargar
            </button>
          </div>
          <div className="datos-vivo">
            <div className="lab-panel-titulo">Datos adquiridos ({sesion.mediciones.length})</div>
            {sesion.mediciones.length === 0 ? (
              <p className="nota">
                Al iniciar el ensayo, el sistema registra un punto por segundo (o antes, si la carga cambia más de un 2 %).
                Con la máquina en pausa puede registrar puntos manualmente.
              </p>
            ) : (
              <div className="tabla-scroll tabla-relleno" ref={tablaRef}>
                <table className="tabla-datos">
                  <thead>
                    <tr><th>#</th><th>t (s)</th><th>Carga (kN)</th><th>Extensión (mm)</th><th>ε transversal</th></tr>
                  </thead>
                  <tbody>
                    {sesion.mediciones.map((m, i) => (
                      <tr
                        key={m.id}
                        onClick={() => setSeleccion(i)}
                        className={`${i === seleccion ? 'fila-seleccionada' : ''} ${s.verdaderos[i]?.manual ? 'fila-manual' : ''}`}
                      >
                        <td>{i + 1}{s.verdaderos[i]?.manual ? ' ✎' : ''}</td>
                        <td>{valorLectura(m.lecturas.tiempo, 2)}</td>
                        <td>{m.lecturas.fuerza.valor === null ? 'OVL' : fmt(m.lecturas.fuerza.valor / 1000, 3)}</td>
                        <td>{valorLectura(m.lecturas.alargamiento, 3)}</td>
                        <td>{valorLectura(m.lecturas.deformacionTransversal, 5)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="fila" style={{ marginTop: 10 }}>
              <button className="primario" onClick={registrarManual} disabled={!(estado === 'montada' || estado === 'pausada')}>Registrar punto</button>
              <span className="nota" style={{ margin: 0 }}>Haga clic en una fila para analizarla en «Calcule y compare».</span>
            </div>
          </div>
        </section>
      </div>

      {/* Fila 2: control y material */}
      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Configuración del ensayo</div>

          <div className="fila-controles">
            <Segmentado
              etiqueta="Sección"
              opciones={[{ valor: 'circular', etiqueta: 'Circular' }, { valor: 'rectangular', etiqueta: 'Rectangular' }]}
              valor={tipoSeccion}
              onChange={setTipoSeccion}
              disabled={montada}
            />
            {tipoSeccion === 'circular' ? (
              <Stepper etiqueta="Diámetro d (mm)" valor={d} onChange={setD} min={4} max={20} paso={0.5} disabled={montada} />
            ) : (
              <>
                <Stepper etiqueta="Ancho b (mm)" valor={b} onChange={setB} min={4} max={30} paso={0.5} disabled={montada} />
                <Stepper etiqueta="Espesor h (mm)" valor={h} onChange={setH} min={1} max={20} paso={0.5} disabled={montada} />
              </>
            )}
            <Stepper etiqueta="Longitud calibrada Lo (mm)" valor={L} onChange={setL} min={20} max={100} paso={5} decimales={0} disabled={montada} />
            <Stepper etiqueta="Velocidad (mm/min)" valor={velocidad} onChange={setVelocidad} min={0.1} max={50} paso={0.5} disabled={fracturada} />
            <Segmentado
              etiqueta="Tiempo"
              opciones={[{ valor: '1', etiqueta: '×1' }, { valor: '10', etiqueta: '×10' }, { valor: '50', etiqueta: '×50' }]}
              valor={factorTiempo}
              onChange={setFactorTiempo}
            />
          </div>

          <div className="fila-controles">
            <div className="segmentado-grupo">
              <span className="stepper-etiqueta">Mover travesaño (manual)</span>
              <div className="stepper-fila">
                <button type="button" onClick={() => jog(-1)} disabled={!(estado === 'montada' || estado === 'pausada') || s.eps <= 0}>▼</button>
                <button type="button" onClick={() => jog(1)} disabled={!(estado === 'montada' || estado === 'pausada')}>▲</button>
              </div>
            </div>
            <Segmentado
              etiqueta="Paso (mm)"
              opciones={(['0.001', '0.01', '0.1', '1'] as PasoJog[]).map((v) => ({ valor: v, etiqueta: v.replace('.', ',') }))}
              valor={pasoJog}
              onChange={setPasoJog}
            />
            <div className="segmentado-grupo">
              <span className="stepper-etiqueta">Probeta</span>
              <button type="button" className="btn-peligro-suave" onClick={() => { nuevaProbeta(); setProbetasUsadas((n) => n + 1); }}>
                <Icono tipo="reiniciar" /> Nueva probeta
              </button>
            </div>
          </div>
          <p className="nota">
            A₀ = {fmt(A, 2)} mm² · {celda.nombre} · extensómetro axial (resolución 0,001 mm) · probetas usadas: {probetasUsadas}.
            La máquina controla el desplazamiento del travesaño: la carga es la respuesta de la probeta.
          </p>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material de la probeta</div>
          <ChipsMaterial materialId={sesion.materialId} onChange={cambiarMaterial} disabled={montada} soloIsotropicos />
          {montada && <p className="nota">Para cambiar material o geometría, desmonte la probeta o use «Nueva probeta».</p>}
          <details className="ficha-desplegable">
            <summary>Ficha técnica del material</summary>
            <FichaMaterial material={material} />
          </details>
          <div className="fila" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button onClick={() => exportarMedicionesCSV(sesion)} disabled={sesion.mediciones.length === 0}>Exportar CSV</button>
            <button onClick={() => exportarSesionJSON(sesion)}>Exportar JSON</button>
            <button onClick={() => exportarSvgComoPng(ID_GRAFICO, `curva-traccion-${sesion.materialId}.png`)}>Gráfico PNG</button>
            <button onClick={() => window.print()}>Imprimir</button>
          </div>
        </section>
      </div>

      {/* Fila 3: datos y análisis */}
      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Calcule y compare</div>
          {!puntoSel || !medSel ? (
            <p className="nota">Seleccione una fila de la tabla. Con la carga y la extensión medidas, calcule σ = F/A₀ y ε = ΔL/Lo; en un punto de la zona elástica también E = σ/ε y ν = −ε_trans/ε.</p>
          ) : (
            <>
              <p className="nota">
                Punto {seleccion! + 1}: F = {valorLectura(medSel.lecturas.fuerza, 0)} N · ΔL = {valorLectura(medSel.lecturas.alargamiento, 3)} mm ·
                ε_trans = {valorLectura(medSel.lecturas.deformacionTransversal, 5)} · A₀ = {fmt(A, 2)} mm² · Lo = {fmt(L, 1)} mm
                {elasticoSel ? ' · punto en zona elástica' : ' · fuera de la zona elástica: E y ν no aplican'}
              </p>
              <div className="fila campo">
                <div>
                  <label>σ calculado (MPa)</label>
                  <input type="number" value={sesion.calculosEstudiante.sigma ?? ''} onChange={(e) => registrarCalculo('sigma', Number(e.target.value))} />
                </div>
                <div>
                  <label>ε calculado</label>
                  <input type="number" value={sesion.calculosEstudiante.epsilon ?? ''} onChange={(e) => registrarCalculo('epsilon', Number(e.target.value))} />
                </div>
              </div>
              {elasticoSel && (
                <div className="fila campo">
                  <div>
                    <label>E calculado (MPa)</label>
                    <input type="number" value={sesion.calculosEstudiante.E ?? ''} onChange={(e) => registrarCalculo('E', Number(e.target.value))} />
                  </div>
                  <div>
                    <label>ν calculado</label>
                    <input type="number" value={sesion.calculosEstudiante.nu ?? ''} onChange={(e) => registrarCalculo('nu', Number(e.target.value))} />
                  </div>
                </div>
              )}
              {hayCalculo && (
                <TablaValidacion>
                  <FilaValidacion etiqueta="σ (esfuerzo)" valorEstudiante={sesion.calculosEstudiante.sigma} valorReferencia={puntoSel.sigma} unidad="MPa" />
                  <FilaValidacion etiqueta="ε (deformación unitaria)" valorEstudiante={sesion.calculosEstudiante.epsilon} valorReferencia={puntoSel.eps} unidad="" />
                  {elasticoSel && material.propiedades.E_MPa !== undefined && (
                    <FilaValidacion etiqueta="E (módulo de Young)" valorEstudiante={sesion.calculosEstudiante.E} valorReferencia={material.propiedades.E_MPa} unidad="MPa" />
                  )}
                  {elasticoSel && material.propiedades.nu !== undefined && (
                    <FilaValidacion etiqueta="ν (Poisson)" valorEstudiante={sesion.calculosEstudiante.nu} valorReferencia={material.propiedades.nu} unidad="" />
                  )}
                </TablaValidacion>
              )}
            </>
          )}
        </section>

        <section className="lab-panel">
          {fracturada && (
            <>
              <div className="lab-panel-titulo">Resumen del ensayo</div>
              <div className="resumen-ensayo">
                <div className="resumen-item"><div className="r-etiqueta">Carga máxima medida</div><div className="r-valor">{fmt(FmaxMedida / 1000, 2)} kN</div></div>
                <div className="resumen-item"><div className="r-etiqueta">Resistencia a la tracción σu = Fmáx/A₀</div><div className="r-valor">{fmt(FmaxMedida / A, 1)} MPa</div></div>
                <div className="resumen-item">
                  <div className="r-etiqueta">Límite elástico convencional Rp0,2</div>
                  <div className="r-valor">{rp02 ? `${fmt(rp02.sigma_MPa, 0)} MPa` : 'No aplica (frágil)'}</div>
                </div>
                <div className="resumen-item"><div className="r-etiqueta">Alargamiento a la rotura A</div><div className="r-valor">{fmt(alargamientoRotura, 1)} %</div></div>
                <div className="resumen-item"><div className="r-etiqueta">Deformación total en la rotura</div><div className="r-valor">{fmt(epsF * 100, 1)} %</div></div>
                <div className="resumen-item"><div className="r-etiqueta">Energía absorbida (tenacidad)</div><div className="r-valor">{fmt(energia, 2)} MJ/m³</div></div>
              </div>
              <p className="nota">
                A = (Lu − Lo)/Lo: alargamiento permanente medido juntando los trozos rotos (se recupera la parte elástica).
                La energía es el área bajo la curva recorrida.
              </p>
              <hr className="separador" />
            </>
          )}
          <div className="lab-panel-titulo">Notas</div>
          <textarea
            rows={4}
            value={sesion.conclusiones}
            onChange={(e) => registrarConclusiones(e.target.value)}
            placeholder="Comportamiento dúctil o frágil, límite de fluencia, resistencia última, alargamiento, tipo de fractura…"
          />
        </section>
      </div>
    </div>
  );
}
