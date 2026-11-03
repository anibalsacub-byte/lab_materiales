import { useEffect, useRef, useState } from 'react';
import { useSesionEnsayo } from './useSesionEnsayo';
import type { LecturaInstrumento } from '../engine/types';

/**
 * Motor común de los bancos con máquina de ensayo: estados de la máquina, bucle de tiempo con
 * control por desplazamiento (la variable de control x avanza a velocidad constante y la carga F
 * es la respuesta de la probeta), adquisición automática de datos, indicador de pico, descarga,
 * desmontaje y movimiento manual. Cada banco aporta solo su física en un {@link ModeloEnsayo}.
 *
 * x y F son genéricos: ε y σ en tracción/compresión, δ y P en flexión, θ y T en torsión, el
 * desplazamiento del travesaño y P en pandeo.
 */

/**
 * - 'retirada': la probeta se descargó y se sacó de la máquina; conserva su deformación permanente.
 * - 'finalizada': fin de recorrido sin rotura (p. ej. compresión de un metal dúctil); sigue cargada.
 */
export type EstadoMaquina = 'desmontada' | 'montada' | 'corriendo' | 'pausada' | 'descargando' | 'retirada' | 'finalizada' | 'fracturada';
export type FactorTiempo = '1' | '10' | '50';

export interface PuntoTrazaEnsayo {
  x: number;
  F: number;
  /** true si el punto está sobre la curva monótona (no en una descarga/recarga). */
  envolvente: boolean;
}

export interface PuntoVerdaderoEnsayo {
  x: number;
  F: number;
  t: number;
  manual: boolean;
}

export interface ModeloEnsayo {
  /** Carga F para la posición x, con la historia de carga (xMax = mayor x alcanzado). */
  respuesta: (x: number, xMax: number) => number;
  /** x a la que la probeta rompe. */
  xFalla?: number;
  /** Fin de recorrido sin rotura: la máquina se detiene con la probeta cargada. */
  xFin?: number;
  /** x a la que la carga vuelve a cero al descargar desde xMax. */
  xSinCarga: (xMax: number) => number;
  /** Velocidad de la variable de control (unidades de x por segundo de ensayo). */
  velocidad: number;
  /** Escalas de referencia de F y de x (carga y recorrido esperados): umbrales de adquisición y traza. */
  escalaF: number;
  escalaX: number;
  /** Lecturas de los instrumentos para un estado verdadero, con su ruido reproducible. */
  leer: (x: number, F: number, indicePunto: number, calibrado: boolean) => Record<string, LecturaInstrumento>;
  /** Clave de la lectura que retiene el indicador de pico (la celda de carga o el torquímetro). */
  clavePico: string;
}

interface EstadoSimulacion {
  x: number;
  xMax: number;
  t: number;
  traza: PuntoTrazaEnsayo[];
  verdaderos: PuntoVerdaderoEnsayo[];
  ultimoT: number;
  ultimoF: number;
  /** Mayor lectura del instrumento de carga: el indicador de pico retiene lo que realmente leyó. */
  picoLeido: number;
}

/** Paso de integración (s de ensayo). */
const PASO_SIMULACION = 0.02;
/** Adquisición automática: un punto por segundo, o antes si la carga cambió más de esta fracción. */
const PERIODO_ADQUISICION_S = 1;
const SALTO_ADQUISICION = 0.02;

function simulacionInicial(): EstadoSimulacion {
  return { x: 0, xMax: 0, t: 0, traza: [{ x: 0, F: 0, envolvente: true }], verdaderos: [], ultimoT: -Infinity, ultimoF: 0, picoLeido: 0 };
}

function lecturaTiempo(t: number): LecturaInstrumento {
  return { valor: Number(t.toFixed(2)), unidad: 's', incertidumbre: 0, fueraDeRango: false, advertencias: [] };
}

/**
 * @param sesionEnsayo la sesión del banco (creada con useSesionEnsayo antes, para que el banco pueda
 *   calcular su modelo a partir del material de la sesión).
 * @param modelo la física del ensayo para la configuración actual.
 */
export function useEnsayoMaquina(sesionEnsayo: ReturnType<typeof useSesionEnsayo>, modelo: ModeloEnsayo) {
  const { sesion, agregarMedicion, marcarProbetaDestruida, reiniciarEnsayo } = sesionEnsayo;

  const [estado, setEstado] = useState<EstadoMaquina>('desmontada');
  const [tarado, setTarado] = useState(false);
  const [factorTiempo, setFactorTiempo] = useState<FactorTiempo>('10');
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [probetasUsadas, setProbetasUsadas] = useState(1);
  const [, forzarRender] = useState(0);
  const sim = useRef<EstadoSimulacion>(simulacionInicial());

  const s = sim.current;
  const fracturada = estado === 'fracturada';
  const retirada = estado === 'retirada';
  const enMovimiento = estado === 'corriendo' || estado === 'descargando';
  /** La probeta ya se usó: bloquea material y geometría hasta «Nueva probeta». */
  const montada = estado !== 'desmontada';
  /** La probeta está entre las mordazas o apoyos. */
  const enMaquina = montada && !retirada;
  const Fbruta = fracturada || retirada ? 0 : modelo.respuesta(s.x, s.xMax);
  // Al terminar una descarga queda un residuo de redondeo (~1e-13): por debajo de esta tolerancia es carga cero.
  const F = Fbruta < 1e-9 * modelo.escalaF ? 0 : Fbruta;

  function adquirir(manual: boolean, x = s.x, Fv = F) {
    const lecturas = modelo.leer(x, Fv, s.verdaderos.length, tarado);
    s.picoLeido = Math.max(s.picoLeido, lecturas[modelo.clavePico]?.valor ?? 0);
    agregarMedicion({ tiempo: lecturaTiempo(s.t), ...lecturas });
    s.verdaderos.push({ x, F: Fv, t: s.t, manual });
    s.ultimoT = s.t;
    s.ultimoF = Fv;
  }

  function agregarTraza(Fv: number) {
    const ultimo = s.traza[s.traza.length - 1];
    const envolvente = s.x >= s.xMax - 1e-12;
    if (Math.abs(s.x - ultimo.x) > modelo.escalaX / 800 || Math.abs(Fv - ultimo.F) > 0.004 * modelo.escalaF || envolvente !== ultimo.envolvente) {
      s.traza.push({ x: s.x, F: Fv, envolvente });
    }
  }

  function fracturar() {
    const xF = modelo.xFalla!;
    s.x = xF;
    s.xMax = xF;
    const Frotura = modelo.respuesta(xF, xF);
    s.traza.push({ x: xF, F: Frotura, envolvente: true }, { x: xF, F: 0, envolvente: true });
    // La máquina registra el último punto con carga antes de detectar la caída.
    adquirir(false, xF, Frotura);
    marcarProbetaDestruida();
    setEstado('fracturada');
  }

  /** Avanza dt segundos de ensayo con la variable de control a velocidad constante. */
  function simular(dt: number, descargando: boolean): 'sigue' | 'falla' | 'fin' | 'descargada' {
    let restante = dt;
    while (restante > 1e-9) {
      const paso = Math.min(PASO_SIMULACION, restante);
      restante -= paso;
      s.t += paso;
      const dx = modelo.velocidad * paso;
      if (!descargando) {
        s.x += dx;
        if (modelo.xFalla !== undefined && s.x >= modelo.xFalla) return 'falla';
        if (modelo.xFin !== undefined && s.x >= modelo.xFin) {
          s.x = modelo.xFin;
          s.xMax = Math.max(s.xMax, s.x);
          const Ffin = modelo.respuesta(s.x, s.xMax);
          agregarTraza(Ffin);
          adquirir(false, s.x, Ffin);
          return 'fin';
        }
        s.xMax = Math.max(s.xMax, s.x);
      } else {
        s.x -= dx;
        const xCero = Math.max(modelo.xSinCarga(s.xMax), 0);
        if (s.x <= xCero) {
          s.x = xCero;
          agregarTraza(0);
          adquirir(false, s.x, 0);
          return 'descargada';
        }
      }
      const Fv = modelo.respuesta(s.x, s.xMax);
      agregarTraza(Fv);
      if (s.t - s.ultimoT >= PERIODO_ADQUISICION_S || Math.abs(Fv - s.ultimoF) >= SALTO_ADQUISICION * modelo.escalaF) adquirir(false, s.x, Fv);
    }
    return 'sigue';
  }

  // El bucle de animación usa siempre la versión más reciente (modelo, velocidad, tara…).
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
      if (r === 'falla') return fracturarRef.current();
      if (r === 'fin') return setEstado('finalizada');
      // Sin carga, la máquina se detiene con la probeta aún montada: puede recargarse o desmontarse.
      if (r === 'descargada') return setEstado('pausada');
      id = requestAnimationFrame(cuadro);
    };
    id = requestAnimationFrame(cuadro);
    return () => cancelAnimationFrame(id);
  }, [estado]);

  // ---------- Acciones ----------

  function nuevaProbeta(materialId?: string) {
    sim.current = simulacionInicial();
    reiniciarEnsayo(materialId);
    setEstado('desmontada');
    setTarado(false);
    setSeleccion(null);
    if (materialId === undefined) setProbetasUsadas((n) => n + 1);
  }

  /** Movimiento manual de la variable de control (jog), con la máquina detenida. */
  function jog(dx: number) {
    const nuevo = Math.max(s.x + dx, 0);
    if (modelo.xFalla !== undefined && nuevo >= modelo.xFalla) return fracturar();
    s.x = modelo.xFin !== undefined ? Math.min(nuevo, modelo.xFin) : nuevo;
    s.xMax = Math.max(s.xMax, s.x);
    agregarTraza(modelo.respuesta(s.x, s.xMax));
    if (estado === 'montada') setEstado('pausada');
    forzarRender((n) => n + 1);
  }

  function registrarManual() {
    adquirir(true);
    setSeleccion(s.verdaderos.length - 1);
    forzarRender((n) => n + 1);
  }

  const detenidaConCarga = estado === 'pausada' || estado === 'finalizada';
  const acciones = {
    montar: () => setEstado('montada'),
    volverAMontar: () => setEstado('pausada'),
    /** Solo sin carga: abrir las mordazas con la probeta cargada la haría recuperar de golpe su parte elástica. */
    desmontar: () => setEstado(s.x > 0 ? 'retirada' : 'desmontada'),
    tarar: () => setTarado(true),
    iniciar: () => setEstado('corriendo'),
    pausar: () => setEstado('pausada'),
    descargar: () => setEstado('descargando'),
    nuevaProbeta,
    jog,
    registrarManual,
  };
  const permisos = {
    desmontar: (estado === 'montada' && s.x === 0) || (detenidaConCarga && F <= 0),
    tarar: estado === 'montada' && !tarado && s.x === 0,
    iniciar: estado === 'montada' || estado === 'pausada',
    descargar: (estado === 'corriendo' || detenidaConCarga) && F > 0,
    jog: estado === 'montada' || estado === 'pausada',
    registrar: estado === 'montada' || detenidaConCarga,
  };

  /** Lectura en vivo de los instrumentos (índice distinto del de la adquisición para un ruido independiente). */
  const lecturaVivo = enMaquina ? modelo.leer(s.x, F, 100000 + Math.floor(s.t * 10), tarado) : null;
  const cargaLeida = lecturaVivo?.[modelo.clavePico]?.valor;
  // Lo que muestra el display también cuenta para el pico (el máximo es idempotente: seguro en el render).
  if (typeof cargaLeida === 'number') s.picoLeido = Math.max(s.picoLeido, cargaLeida);

  return {
    ...sesionEnsayo,
    sesion,
    estado,
    sim: s,
    F,
    tarado,
    factorTiempo,
    setFactorTiempo,
    seleccion,
    setSeleccion,
    probetasUsadas,
    fracturada,
    retirada,
    enMovimiento,
    montada,
    enMaquina,
    lecturaVivo,
    pico: montada ? s.picoLeido : undefined,
    acciones,
    permisos,
  };
}

export type EnsayoMaquina = ReturnType<typeof useEnsayoMaquina>;
