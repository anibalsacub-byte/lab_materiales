import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BarraPasos, DisplayDigital, Segmentado, Stepper } from '../../components/lab/LabUI';
import { EcuacionesVivo, ResumenItem, fmt, useModoLab, type Ecuacion } from '../../components/lab/PanelesEnsayo';
import { GraficoEnsayo, type OpcionesGrafico, type PuntoClave, type PuntoXY } from '../../components/svg/GraficoEnsayo';
import { descargarArchivo, exportarSvgComoPng } from '../../trial/exportar';
import { analizarColapso, estadoEnCarga, nudosSinArriostrar, type ModoFalla } from '../../engine/mechanics/reticulado3d';
import {
  G_MM_S2,
  MATERIALES_MAQUETA,
  UNIONES_MAQUETA,
  aplicarEdiciones,
  cargaPesoPropio,
  cargaUnitariaPlaca,
  claveBarra,
  dividirBarra,
  generarTorre,
  masaMaqueta,
  nudosSuperiores,
  numeroEdiciones,
  propiedadesMaqueta,
  SIN_EDICIONES,
  type ArriostreCaras,
  type EdicionesTorre,
  type ArriostrePlanta,
  type GrupoSeccion,
  type MaterialMaqueta,
  type ParametrosTorre,
  type Planta,
} from '../../engine/mechanics/torres';
import { Vista3DSVG, type BarraVisual } from './Vista3DSVG';
import { ArmaduraPlanaBench } from './ArmaduraPlanaBench';

const ID_GRAFICO = 'grafico-carga-descenso';
const ID_VISTA = 'vista-3d-torre';
const CLAVE_RANKING = 'lab-rm-ranking-estructuras';
const DISCOS = [0.5, 1, 2, 5];

const PARAMETROS_INICIALES: ParametrosTorre = {
  planta: 'cuadrada',
  ladoBase: 200,
  ladoSuperior: 120,
  altura: 500,
  niveles: 5,
  caras: 'X',
  arriostrePlanta: 'diagonal',
  plantaCada: 1,
};

const SECCIONES_INICIALES: Record<string, Record<GrupoSeccion, string>> = {
  tallarin: { pata: '7h', anillo: '2h', diagonal: '2h', planta: '1h' },
  bambu: { pata: '2h', anillo: '1h', diagonal: '1h', planta: '1h' },
  balsa: { pata: '6x6', anillo: '3x3', diagonal: '3x3', planta: '3x3' },
  palito: { pata: '10x4', anillo: '10x2', diagonal: '10x2', planta: '10x2' },
};

const NOMBRE_GRUPO: Record<string, string> = { pata: 'Pata', anillo: 'Anillo', diagonal: 'Diagonal', planta: 'Planta', libre: 'Agregada', placa: 'Placa' };
const NOMBRE_MODO: Record<ModoFalla, string> = {
  traccion: 'rotura por tracción',
  pandeo: 'pandeo',
  aplastamiento: 'aplastamiento',
  union: 'se despega la unión',
  global: 'pandeo global de la torre',
  mecanismo: 'la torre se vuelve un mecanismo',
};

interface EntradaRanking {
  id: number;
  equipo: string;
  material: string;
  union: string;
  masa_g: number;
  carga_kg: number;
  eficiencia: number;
  cumple: boolean;
  motivos: string;
  modo: 'discos' | 'rampa';
  prediccion_kg?: number;
  fecha: string;
}

interface Reglas {
  alturaMin: number;
  baseMax: number;
  masaMax: number;
}

interface DisenoGuardado {
  tipo: 'torre-lab-rm';
  version: 1 | 2;
  equipo: string;
  param: ParametrosTorre;
  materialId: string;
  unionId: string;
  secciones: Record<GrupoSeccion, string>;
  /** Versión 1: solo barras quitadas y agregadas. */
  quitadas?: string[];
  agregadas?: [number, number][];
  ediciones?: EdicionesTorre;
  crucesPegados?: boolean;
  propiedades?: Partial<MaterialMaqueta>;
}

type HerramientaEdicion = 'barras' | 'dividir' | 'nudo';

function leerRanking(): EntradaRanking[] {
  try {
    const t = localStorage.getItem(CLAVE_RANKING);
    return t ? (JSON.parse(t) as EntradaRanking[]) : [];
  } catch {
    return [];
  }
}

function guardarRanking(r: EntradaRanking[]) {
  try {
    localStorage.setItem(CLAVE_RANKING, JSON.stringify(r));
  } catch {
    // Sin almacenamiento disponible: el ranking dura mientras la página esté abierta.
  }
}

const OPCIONES_GRAFICO: OpcionesGrafico = { etiquetas: true, puntos: true, regiones: false, offset: false, energia: false, cuadricula: true, teorica: false };

function TorreBench({ onVolver, selectorModo }: { onVolver: () => void; selectorModo: ReactNode }) {
  useModoLab();

  // ---------- Diseño ----------
  const [param, setParam] = useState<ParametrosTorre>(PARAMETROS_INICIALES);
  const [materialId, setMaterialId] = useState('tallarin');
  const [unionId, setUnionId] = useState('epoxi');
  const [secciones, setSecciones] = useState<Record<GrupoSeccion, string>>(SECCIONES_INICIALES.tallarin);
  const [propiedades, setPropiedades] = useState<Record<string, Partial<MaterialMaqueta>>>({});
  const [ed, setEd] = useState<EdicionesTorre>(SIN_EDICIONES);
  const [historial, setHistorial] = useState<EdicionesTorre[]>([]);
  const [herramienta, setHerramienta] = useState<HerramientaEdicion>('barras');
  const [crucesPegados, setCrucesPegados] = useState(false);
  const [dispersion, setDispersion] = useState(true);
  const [semilla, setSemilla] = useState(2026);
  const [excentricidad, setExcentricidad] = useState(0);
  const [lateral, setLateral] = useState(1);

  // ---------- Ensayo ----------
  const [modoCarga, setModoCarga] = useState<'discos' | 'rampa'>('discos');
  const [discos, setDiscos] = useState<number[]>([]);
  const [rampaKg, setRampaKg] = useState(0);
  const [rampaActiva, setRampaActiva] = useState(false);
  const [velocidadRampa, setVelocidadRampa] = useState<'0.5' | '2' | '5'>('2');
  const [animColapso, setAnimColapso] = useState(0);

  // ---------- Vista ----------
  const [vista, setVista] = useState({ yaw: 0.55, pitch: 0.32 });
  const [amplificar, setAmplificar] = useState<'1' | '10' | '50'>('10');
  const [colorearFuerzas, setColorearFuerzas] = useState(true);
  const [numeros, setNumeros] = useState(false);
  const [editar, setEditar] = useState(false);
  const [nudoSel, setNudoSel] = useState<number | null>(null);
  const [barraSel, setBarraSel] = useState<number | null>(null);

  // ---------- Concurso ----------
  const [equipo, setEquipo] = useState('');
  const [prediccion, setPrediccion] = useState<string>('');
  const [reglas, setReglas] = useState<Reglas>({ alturaMin: 400, baseMax: 250, masaMax: 0 });
  const [ranking, setRanking] = useState<EntradaRanking[]>(leerRanking);
  const [criterio, setCriterio] = useState<'eficiencia' | 'carga'>('eficiencia');
  const [registrado, setRegistrado] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const material: MaterialMaqueta = useMemo(() => {
    const base = MATERIALES_MAQUETA.find((m) => m.id === materialId) ?? MATERIALES_MAQUETA[0];
    return { ...base, ...propiedades[materialId] };
  }, [materialId, propiedades]);
  const union = UNIONES_MAQUETA.find((u) => u.id === unionId) ?? UNIONES_MAQUETA[0];

  const base = useMemo(() => generarTorre(param), [param]);
  const estructura = useMemo(() => aplicarEdiciones(base, ed), [base, ed]);
  const { props, detalle } = useMemo(
    () => propiedadesMaqueta(estructura, { material, union, secciones, dispersion, semilla, crucesPegados }),
    [estructura, material, union, secciones, dispersion, semilla, crucesPegados],
  );
  const nEdiciones = numeroEdiciones(ed);
  /** Aplica un cambio a mano guardando el estado anterior para poder deshacerlo. */
  const editarCon = (cambio: (e: EdicionesTorre) => EdicionesTorre) => {
    setHistorial((h) => [...h.slice(-59), ed]);
    setEd(cambio(ed));
  };
  const deshacer = () => {
    if (!historial.length) return;
    setEd(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
    setNudoSel(null);
  };
  const borrarEdiciones = () => {
    setEd(SIN_EDICIONES);
    setHistorial([]);
    setNudoSel(null);
    setBarraSel(null);
  };
  const masa = useMemo(() => masaMaqueta(estructura, detalle, union), [estructura, detalle, union]);
  const sup = useMemo(() => nudosSuperiores(estructura), [estructura]);
  const sueltos = useMemo(() => nudosSinArriostrar(estructura), [estructura]);
  const resultado = useMemo(() => {
    const cu = cargaUnitariaPlaca(estructura, { excentricidad, lateral: lateral / 100 });
    const cw = cargaPesoPropio(estructura, detalle, union);
    return analizarColapso(estructura, props, cu, cw);
  }, [estructura, props, detalle, union, excentricidad, lateral]);

  const cargaKg = modoCarga === 'discos' ? discos.reduce((s, d) => s + d, 0) : rampaKg;
  const W = cargaKg * G_MM_S2;
  const cargado = cargaKg > 0;
  const estado = estadoEnCarga(resultado, W);
  const colapsada = cargado && estado.colapsada;
  const Pmax_kg = resultado.Pmax / G_MM_S2;
  // Carga sostenida: en el ensayo con discos cuenta la última carga que la torre resistió.
  const cargaSostenidaKg = modoCarga === 'discos' ? (colapsada ? discos.slice(0, -1).reduce((s, d) => s + d, 0) : cargaKg) : colapsada ? Pmax_kg : cargaKg;

  // Cualquier cambio del diseño retira la carga y reinicia el ensayo.
  useEffect(() => {
    setDiscos([]);
    setRampaKg(0);
    setRampaActiva(false);
    setAnimColapso(0);
    setRegistrado(false);
  }, [resultado]);

  useEffect(() => {
    if (barraSel !== null && barraSel >= estructura.barras.length) setBarraSel(null);
  }, [estructura, barraSel]);

  // Animación del colapso
  useEffect(() => {
    if (!colapsada) {
      setAnimColapso(0);
      return;
    }
    let id = 0;
    const t0 = performance.now();
    const paso = () => {
      const t = Math.min(1, (performance.now() - t0) / 1400);
      setAnimColapso(t);
      if (t < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [colapsada]);

  // Rampa continua de carga
  useEffect(() => {
    if (!rampaActiva) return;
    let id = 0;
    let anterior = performance.now();
    const v = Number(velocidadRampa);
    const paso = () => {
      const ahora = performance.now();
      const dt = Math.min(0.1, (ahora - anterior) / 1000);
      anterior = ahora;
      let fin = false;
      setRampaKg((k) => {
        const nuevo = k + v * dt;
        if (resultado.inestable || nuevo >= Pmax_kg) {
          fin = true;
          return Math.max(Pmax_kg, 0.001);
        }
        return nuevo;
      });
      if (fin) setRampaActiva(false);
      else id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [rampaActiva, velocidadRampa, resultado, Pmax_kg]);

  // ---------- Estado visual ----------
  const etapa = estado.etapa;
  const N = useMemo(() => {
    const n = new Float64Array(estructura.barras.length);
    if (!etapa) return n;
    for (let j = 0; j < n.length; j++) n[j] = etapa.activas[j] ? etapa.Nw[j] + W * etapa.Nu[j] : 0;
    return n;
  }, [etapa, W, estructura]);
  const rotas = useMemo(() => {
    const r = new Set<number>();
    for (const ev of estado.fallas) if (ev.barra >= 0) r.add(ev.barra);
    return r;
  }, [estado.fallas]);

  const uso = (j: number) => {
    const pr = props[j];
    if (pr.rigida) return 0;
    return N[j] >= 0 ? N[j] / pr.capTraccion : N[j] / pr.capCompresion;
  };

  const H = param.altura;
  const uVisual = useMemo(() => {
    if (!etapa && !(colapsada && resultado.formaColapso)) return null;
    const amp = Number(amplificar);
    const u = new Float64Array(3 * estructura.nudos.length);
    const Wv = colapsada ? resultado.Pmax : W;
    if (etapa) for (let i = 0; i < u.length; i++) u[i] = (etapa.uw[i] + Wv * etapa.uu[i]) * amp;
    // Al colapsar, la torre se deforma según el mecanismo o el modo de pandeo y la placa cae.
    let maxU = 0;
    for (const v of u) maxU = Math.max(maxU, Math.abs(v));
    const limite = H * 0.08;
    if (maxU > limite) for (let i = 0; i < u.length; i++) u[i] *= limite / maxU;
    if (colapsada && resultado.formaColapso) {
      const f = resultado.formaColapso;
      const t = animColapso * animColapso;
      let signo = 0;
      for (const i of sup) signo += f[3 * i + 2];
      const s = signo > 0 ? -1 : 1;
      for (let i = 0; i < u.length; i++) u[i] += s * f[i] * H * 0.35 * t;
    }
    return u;
  }, [etapa, amplificar, colapsada, resultado, W, animColapso, H, sup, estructura]);

  const barrasVisual: BarraVisual[] = estructura.barras.map((_, j) => {
    const s = detalle[j].seccion;
    return {
      uso: uso(j),
      rota: rotas.has(j),
      grosor: s ? Math.sqrt((4 * s.A) / Math.PI) : 1,
    };
  });

  const descenso = (Wn: number, k: number) => {
    const et = resultado.etapas[k];
    if (!et || !sup.length) return 0;
    return -sup.reduce((s, i) => s + et.uw[3 * i + 2] + Wn * et.uu[3 * i + 2], 0) / sup.length;
  };

  // Curva carga–descenso: tramos lineales por etapa, con un salto en cada falla.
  const curva = useMemo(() => {
    const pts: PuntoXY[] = [{ x: descenso(0, 0), y: 0 }];
    let k = 0;
    for (const ev of resultado.eventos) {
      if (ev.barra < 0) break;
      pts.push({ x: descenso(ev.P, k), y: ev.P / G_MM_S2 });
      k++;
      if (k < resultado.etapas.length) pts.push({ x: descenso(ev.P, k), y: ev.P / G_MM_S2 });
    }
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado, sup]);

  const traza = useMemo(() => {
    if (!cargado) return [];
    if (colapsada) return curva;
    const pts = curva.filter((p) => p.y < cargaKg);
    pts.push({ x: descenso(W, estado.indice), y: cargaKg });
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curva, cargado, colapsada, cargaKg, W, estado.indice]);

  const descensoActual = cargado && !colapsada ? descenso(W, estado.indice) : 0;
  const primeraFalla = resultado.eventos.find((ev) => ev.barra >= 0);
  const puntosClave: PuntoClave[] = [];
  if (cargado && primeraFalla && primeraFalla.P < W) puntosClave.push({ x: descenso(primeraFalla.P, 0), y: primeraFalla.P / G_MM_S2, etiqueta: 'Primera falla', color: '#f0b429' });
  if (colapsada) puntosClave.push({ x: curva[curva.length - 1]?.x ?? 0, y: Pmax_kg, etiqueta: `Colapso ${fmt(Pmax_kg, 2)} kg`, color: '#ff5c5c' });

  // ---------- Reglas del concurso ----------
  const motivos: string[] = [];
  const usados = new Set(estructura.barras.flatMap((b) => (b.grupo === 'placa' ? [] : [b.a, b.b])));
  const alturaReal = Math.max(0, ...[...usados].map((i) => estructura.nudos[i].z));
  const apoyosBase = estructura.nudos.filter((n, i) => n.apoyo && usados.has(i));
  const baseReal = apoyosBase.length ? Math.max(Math.max(...apoyosBase.map((n) => n.x)) - Math.min(...apoyosBase.map((n) => n.x)), Math.max(...apoyosBase.map((n) => n.y)) - Math.min(...apoyosBase.map((n) => n.y))) : 0;
  if (alturaReal < reglas.alturaMin) motivos.push(`altura ${fmt(alturaReal, 0)} mm < ${reglas.alturaMin} mm`);
  if (baseReal > reglas.baseMax) motivos.push(`base ${fmt(baseReal, 0)} mm > ${reglas.baseMax} mm`);
  if (reglas.masaMax > 0 && masa.total_g > reglas.masaMax) motivos.push(`masa ${fmt(masa.total_g, 1)} g > ${reglas.masaMax} g`);
  const cumple = motivos.length === 0;

  // ---------- Acciones ----------
  const bloqueado = cargado;
  const cambiarParam = (cambio: Partial<ParametrosTorre>) => {
    if (nEdiciones && !window.confirm('Cambiar la forma de la torre borra los cambios hechos a mano (nudos y barras). ¿Continuar?')) return;
    borrarEdiciones();
    setParam((p) => ({ ...p, ...cambio }));
  };
  const cambiarMaterial = (id: string) => {
    setMaterialId(id);
    setSecciones(SECCIONES_INICIALES[id] ?? SECCIONES_INICIALES.tallarin);
  };
  const retirarCarga = () => {
    setDiscos([]);
    setRampaKg(0);
    setRampaActiva(false);
    setRegistrado(false);
  };
  const clicBarra = (j: number) => {
    const b = estructura.barras[j];
    if (editar && !bloqueado && b.grupo !== 'placa' && herramienta !== 'nudo') {
      if (herramienta === 'dividir') {
        const r = dividirBarra(estructura, ed, j, base.nudos.length);
        editarCon(() => r.ed);
        setNudoSel(r.nudo);
        setHerramienta('nudo');
      } else {
        const k = claveBarra(b.a, b.b);
        editarCon((e) => (b.grupo === 'libre' ? { ...e, agregadas: e.agregadas.filter(([x, y]) => claveBarra(x, y) !== k) } : { ...e, quitadas: [...e.quitadas, k] }));
      }
      setBarraSel(null);
      return;
    }
    setBarraSel((s) => (s === j ? null : j));
  };
  const clicNudo = (i: number) => {
    if (!editar || bloqueado) return;
    if (herramienta === 'nudo') {
      setNudoSel((s) => (s === i ? null : i));
      return;
    }
    if (herramienta !== 'barras') return;
    if (nudoSel === null) setNudoSel(i);
    else if (nudoSel === i) setNudoSel(null);
    else {
      const a = nudoSel;
      const k = claveBarra(a, i);
      const existe = estructura.barras.some((b) => claveBarra(b.a, b.b) === k);
      if (!existe) {
        editarCon((e) => (e.quitadas.includes(k) ? { ...e, quitadas: e.quitadas.filter((x) => x !== k) } : { ...e, agregadas: [...e.agregadas, [a, i]] }));
      }
      setNudoSel(null);
    }
  };
  const fantasmas = useMemo(() => ed.quitadas.map((k) => k.split('-').map(Number) as [number, number]), [ed.quitadas]);
  const agregarNudo = () => {
    const nuevo = base.nudos.length + ed.nudosNuevos.length;
    editarCon((e) => ({ ...e, nudosNuevos: [...e.nudosNuevos, { x: 0, y: 0, z: Math.round(param.altura / 2) }] }));
    setHerramienta('nudo');
    setNudoSel(nuevo);
  };
  const moverNudo = (i: number, eje: 'x' | 'y' | 'z', v: number) => {
    const n = estructura.nudos[i];
    editarCon((e) => ({ ...e, movidos: { ...e.movidos, [i]: { x: n.x, y: n.y, z: n.z, [eje]: v } } }));
  };
  const nudoEditado = editar && herramienta === 'nudo' && nudoSel !== null ? estructura.nudos[nudoSel] : null;

  const registrar = () => {
    const entrada: EntradaRanking = {
      id: Date.now(),
      equipo: equipo.trim() || `Equipo ${ranking.length + 1}`,
      material: material.nombreCorto,
      union: union.nombre,
      masa_g: masa.total_g,
      carga_kg: cargaSostenidaKg,
      eficiencia: masa.total_g > 0 ? (cargaSostenidaKg * 1000) / masa.total_g : 0,
      cumple,
      motivos: motivos.join('; '),
      modo: modoCarga,
      prediccion_kg: prediccion !== '' ? Number(prediccion) : undefined,
      fecha: new Date().toLocaleString('es-PE'),
    };
    const nuevo = [...ranking, entrada];
    setRanking(nuevo);
    guardarRanking(nuevo);
    setRegistrado(true);
  };
  const borrarEntrada = (id: number) => {
    const nuevo = ranking.filter((r) => r.id !== id);
    setRanking(nuevo);
    guardarRanking(nuevo);
  };
  const vaciarRanking = () => {
    if (!window.confirm('¿Borrar todas las entradas del ranking? No se puede deshacer.')) return;
    setRanking([]);
    guardarRanking([]);
  };
  const rankingOrdenado = [...ranking].sort((a, b) => {
    if (a.cumple !== b.cumple) return a.cumple ? -1 : 1;
    return criterio === 'eficiencia' ? b.eficiencia - a.eficiencia || b.carga_kg - a.carga_kg : b.carga_kg - a.carga_kg || b.eficiencia - a.eficiencia;
  });
  const exportarRanking = () => {
    const filas = [
      ['Puesto', 'Equipo', 'Material', 'Unión', 'Masa (g)', 'Carga soportada (kg)', 'Eficiencia (carga/peso)', 'Cumple bases', 'Observaciones', 'Ensayo', 'Predicción (kg)', 'Fecha'],
      ...rankingOrdenado.map((r, i) => [
        i + 1, r.equipo, r.material, r.union, r.masa_g.toFixed(1), r.carga_kg.toFixed(2), r.eficiencia.toFixed(0), r.cumple ? 'Sí' : 'No', r.motivos, r.modo === 'discos' ? 'Discos' : 'Rampa', r.prediccion_kg ?? '', r.fecha,
      ]),
    ];
    descargarArchivo('ranking-concurso-estructuras.csv', filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv;charset=utf-8');
  };

  const guardarDiseno = () => {
    const d: DisenoGuardado = { tipo: 'torre-lab-rm', version: 2, equipo, param, materialId, unionId, secciones, ediciones: ed, crucesPegados, propiedades: propiedades[materialId] };
    const nombre = (equipo.trim() || 'torre').replace(/[^\w-]+/g, '-').toLowerCase();
    descargarArchivo(`${nombre}.torre.json`, JSON.stringify(d, null, 2), 'application/json');
  };
  const abrirDiseno = async (archivo: File) => {
    try {
      const d = JSON.parse(await archivo.text()) as DisenoGuardado;
      if (d.tipo !== 'torre-lab-rm') throw new Error('tipo');
      setParam({ ...PARAMETROS_INICIALES, ...d.param });
      setMaterialId(MATERIALES_MAQUETA.some((m) => m.id === d.materialId) ? d.materialId : 'tallarin');
      setUnionId(UNIONES_MAQUETA.some((u) => u.id === d.unionId) ? d.unionId : 'epoxi');
      setSecciones(d.secciones);
      setEd(d.ediciones ? { ...SIN_EDICIONES, ...d.ediciones } : { ...SIN_EDICIONES, quitadas: d.quitadas ?? [], agregadas: d.agregadas ?? [] });
      setHistorial([]);
      setCrucesPegados(!!d.crucesPegados);
      if (d.propiedades) setPropiedades((p) => ({ ...p, [d.materialId]: d.propiedades! }));
      setEquipo(d.equipo ?? '');
      setPrediccion('');
    } catch {
      window.alert('El archivo no es un diseño de torre válido.');
    }
  };

  // ---------- Barra para las ecuaciones ----------
  let barraCritica = -1;
  let usoMax = -1;
  estructura.barras.forEach((b, j) => {
    if (b.grupo === 'placa' || rotas.has(j)) return;
    const v = Math.abs(uso(j));
    if (v > usoMax) {
      usoMax = v;
      barraCritica = j;
    }
  });
  const jEc = barraSel ?? (barraCritica >= 0 ? barraCritica : null);
  const ecuaciones: Ecuacion[] = [];
  if (jEc !== null && detalle[jEc]?.seccion) {
    const d = detalle[jEc];
    const s = d.seccion!;
    const pr = props[jEc];
    const Nj = N[jEc];
    const tit = `${barraSel !== null ? 'Barra seleccionada' : 'Barra más exigida'}: n.º ${jEc + 1} (${NOMBRE_GRUPO[estructura.barras[jEc].grupo]}, ${s.etiqueta})`;
    ecuaciones.push(
      { nombre: `${tit} — esbeltez`, formula: 'λ = Lp / r,  r = √(I/A)', nota: d.Lp < d.L ? `Cruce de X pegado: longitud de pandeo Lp = L/2 = ${fmt(d.Lp, 1)} mm.` : undefined, sustitucion: `${fmt(d.Lp, 1)} / √(${fmt(s.I, 3)}/${fmt(s.A, 2)})`, resultado: fmt(d.lambda, 0) },
      {
        nombre: 'Carga crítica de Euler (barra articulada, K = 1)',
        formula: 'Pcr = π²·E·I / Lp²',
        sustitucion: `π²·${fmt(material.E_MPa, 0)}·${fmt(s.I, 3)} / ${fmt(d.Lp, 1)}²${d.factor !== 1 ? ` × ${fmt(d.factor, 2)}` : ''}`,
        resultado: `${fmt(d.Pcr, 2)} N`,
        nota: pr.modoCompresion === 'aplastamiento' ? 'Barra corta: manda el aplastamiento (parábola de Johnson), no Euler.' : undefined,
      },
      {
        nombre: 'Resistencia a la tracción de la barra',
        formula: 'T = σt·A',
        sustitucion: `${fmt(material.sigmaT_MPa, 1)}·${fmt(s.A, 2)}${d.factor !== 1 ? ` × ${fmt(d.factor, 2)}` : ''}`,
        resultado: `${fmt(material.sigmaT_MPa * s.A * d.factor, 1)} N`,
      },
      {
        nombre: `Resistencia de la unión (${union.nombre.toLowerCase()})`,
        formula: 'T_unión = τ·p·ℓ',
        sustitucion: `${fmt(union.tau_MPa, 1)}·${fmt(s.perimetro, 1)}·${fmt(union.solape_mm, 0)}`,
        resultado: `${fmt(d.capUnion, 1)} N`,
        nota: pr.modoTraccion === 'union' ? 'La unión es más débil que la barra: en tracción se despega el nudo.' : undefined,
      },
      {
        nombre: 'Uso de la barra con la carga actual',
        formula: Nj >= 0 ? 'uso = N / T' : 'uso = |N| / Pcr',
        sustitucion: rotas.has(jEc) ? undefined : `${fmt(Math.abs(Nj), 2)} / ${fmt(Nj >= 0 ? pr.capTraccion : pr.capCompresion, 2)}`,
        resultado: rotas.has(jEc) ? 'rota' : `${fmt(Math.abs(uso(jEc)) * 100, 0)} % (${Nj >= 0 ? 'tracción' : 'compresión'})`,
      },
    );
  }

  let textoEstado: string;
  if (resultado.inestable) {
    const nl = resultado.nudoLibre;
    textoEstado = `La torre es un mecanismo: con nudos articulados no es estable${nl ? ` (el nudo ${nl.nudo + 1} se desplaza libremente en ${nl.eje})` : ''}. Agregue diagonales para triangular las caras.`;
  } else if (colapsada) textoEstado = `Colapsó con ${fmt(Pmax_kg, 2)} kg: ${NOMBRE_MODO[resultado.final]}.`;
  else if (cargado) textoEstado = `Soporta ${fmt(cargaKg, 2)} kg${estado.fallas.length ? ` · ${estado.fallas.length} barra(s) rota(s), la carga se redistribuyó` : ''}.`;
  else if (editar) {
    textoEstado =
      herramienta === 'barras'
        ? 'Edición libre: clic en una barra para quitarla; clic en dos nudos para unirlos con una barra nueva.'
        : herramienta === 'dividir'
          ? 'Dividir: clic en una barra para agregar un nudo en su punto medio.'
          : 'Nudos: clic en un nudo para moverlo o pegarlo a la base; «Agregar nudo» crea uno nuevo.';
  } else textoEstado = 'Torre lista. Coloque discos sobre la placa.';

  const pasoActual = registrado ? 5 : colapsada ? 4 : cargado ? 3 : prediccion !== '' ? 3 : 1;
  const ultimaFalla = estado.fallas.filter((ev) => ev.barra >= 0).slice(-1)[0];

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 10 — Concurso de estructuras</div>
          <div className="subtitulo">Torres reticuladas en 3D: material, armado por niveles, carga con discos hasta el colapso y ranking del concurso.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>
      {selectorModo}

      <BarraPasos pasos={['Material y unión', 'Armar la torre', 'Predecir la carga', 'Cargar hasta el colapso', 'Registrar en el ranking']} actual={pasoActual} />

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Torre — vista 3D</div>
          <Vista3DSVG
            id={ID_VISTA}
            estructura={estructura}
            barras={barrasVisual}
            u={uVisual}
            nudosSuperiores={sup}
            ladoPlaca={Math.max(param.ladoSuperior + 40, 120)}
            discos={modoCarga === 'discos' ? discos : rampaKg > 0 ? [Number(rampaKg.toFixed(1))] : []}
            yaw={vista.yaw}
            pitch={vista.pitch}
            onRotar={(yaw, pitch) => setVista({ yaw, pitch })}
            colorMaterial={material.color}
            colorearFuerzas={colorearFuerzas && cargado}
            seleccion={barraSel}
            onClickBarra={clicBarra}
            editar={editar && !bloqueado}
            nudoSeleccionado={nudoSel}
            onClickNudo={clicNudo}
            fantasmas={fantasmas}
            onClickFantasma={(k) => editarCon((e) => ({ ...e, quitadas: e.quitadas.filter((_, i) => i !== k) }))}
            numeros={numeros}
            colapso={animColapso}
          />
          <div className="leyenda-fuerzas">
            <span><i style={{ background: '#4fa3ff' }} /> Tracción</span>
            <span><i style={{ background: '#ff5c5c' }} /> Compresión</span>
            <span><i className="rota" /> Rota</span>
            <span className="nota">La intensidad del color es el uso de la barra (fuerza / capacidad).</span>
          </div>
          <div className="fila-controles">
            <Segmentado<'1' | '10' | '50'>
              etiqueta="Amplificar deformación"
              opciones={[{ valor: '1', etiqueta: '×1' }, { valor: '10', etiqueta: '×10' }, { valor: '50', etiqueta: '×50' }]}
              valor={amplificar}
              onChange={setAmplificar}
            />
            <Segmentado<'si' | 'no'>
              etiqueta="Colores por fuerza"
              opciones={[{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]}
              valor={colorearFuerzas ? 'si' : 'no'}
              onChange={(v) => setColorearFuerzas(v === 'si')}
            />
            <Segmentado<'si' | 'no'>
              etiqueta="Números de barra"
              opciones={[{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]}
              valor={numeros ? 'si' : 'no'}
              onChange={(v) => setNumeros(v === 'si')}
            />
          </div>
          <div className="maquina-estado">
            <div>
              <span className={`punto ${resultado.inestable || colapsada ? 'rota' : cargado ? 'marcha' : ''}`} />
              <strong>{textoEstado}</strong>
            </div>
            {ultimaFalla && !colapsada && (
              <div className="texto-alerta">
                ⚠ Barra {ultimaFalla.barra + 1} ({NOMBRE_GRUPO[estructura.barras[ultimaFalla.barra].grupo].toLowerCase()}): {NOMBRE_MODO[ultimaFalla.modo]} con {fmt(ultimaFalla.P / G_MM_S2, 2)} kg.
              </div>
            )}
            {sueltos.length > 0 && !colapsada && <div className="texto-alerta">⚠ Nudo{sueltos.length > 1 ? 's' : ''} {sueltos.map((i) => i + 1).join(', ')} sin arriostrar en alguna dirección: sus barras están alineadas o en un mismo plano. Agregue barras que lo sujeten; si no, se mueve libremente o pandea.</div>}
            {!cumple && <div className="texto-alerta">⚠ No cumple las bases: {motivos.join('; ')}.</div>}
          </div>
          <EcuacionesVivo ecuaciones={ecuaciones} />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Ensayo de carga</div>
          <GraficoEnsayo
            id={ID_GRAFICO}
            titulo="Carga sobre la placa frente a su descenso"
            subtitulo={`${material.nombreCorto} · ${fmt(masa.total_g, 1)} g · ${union.nombre.toLowerCase()}`}
            xEtiqueta="Descenso de la placa (mm)"
            yEtiqueta="Carga (kg)"
            xMax={Math.max(...(cargado ? traza : curva.slice(0, 1)).map((p) => p.x), 0.05) * 1.25}
            yMax={Math.max(cargaKg, colapsada ? Pmax_kg : 0, 1) * 1.2}
            traza={traza}
            puntosClave={puntosClave}
            puntoActual={cargado && !colapsada ? { x: descensoActual, y: cargaKg } : undefined}
            opciones={OPCIONES_GRAFICO}
            decimalesX={2}
          />
          <DisplayDigital
            items={[
              { etiqueta: 'Carga', valor: fmt(cargaKg, 2), unidad: 'kg' },
              { etiqueta: 'Descenso', valor: colapsada ? '—' : fmt(descensoActual, 2), unidad: 'mm', alerta: colapsada },
              { etiqueta: 'Masa torre', valor: fmt(masa.total_g, 1), unidad: 'g' },
              { etiqueta: 'Eficiencia', valor: masa.total_g > 0 ? fmt((cargaSostenidaKg * 1000) / masa.total_g, 0) : '—', unidad: 'carga/peso' },
            ]}
          />
          <Segmentado<'discos' | 'rampa'>
            etiqueta="Forma de cargar"
            opciones={[{ valor: 'discos', etiqueta: 'Discos (como en el concurso)' }, { valor: 'rampa', etiqueta: 'Rampa continua (carga exacta)' }]}
            valor={modoCarga}
            onChange={(v) => {
              retirarCarga();
              setModoCarga(v);
            }}
            disabled={rampaActiva}
          />
          {modoCarga === 'discos' ? (
            <div className="controles-principales">
              {DISCOS.map((kg) => (
                <button key={kg} className="btn-grande btn-iniciar" onClick={() => { setDiscos((d) => [...d, kg]); setEditar(false); setNudoSel(null); }} disabled={colapsada}>
                  + {String(kg).replace('.', ',')} kg
                </button>
              ))}
            </div>
          ) : (
            <div className="controles-principales">
              <button className="btn-grande btn-iniciar" onClick={() => { setRampaActiva(true); setEditar(false); }} disabled={rampaActiva || colapsada}>
                ▶ {rampaKg > 0 ? 'Continuar' : 'Iniciar rampa'}
              </button>
              <button className="btn-grande" onClick={() => setRampaActiva(false)} disabled={!rampaActiva}>❚❚ Pausa</button>
              <div style={{ gridColumn: 'span 2' }}>
                <Segmentado<'0.5' | '2' | '5'>
                  etiqueta="Velocidad"
                  opciones={[{ valor: '0.5', etiqueta: '0,5 kg/s' }, { valor: '2', etiqueta: '2 kg/s' }, { valor: '5', etiqueta: '5 kg/s' }]}
                  valor={velocidadRampa}
                  onChange={setVelocidadRampa}
                />
              </div>
            </div>
          )}
          <div className="controles-principales">
            {modoCarga === 'discos' && (
              <button className="btn-grande" onClick={() => setDiscos((d) => d.slice(0, -1))} disabled={!discos.length || colapsada}>Quitar último disco</button>
            )}
            <button className="btn-grande btn-peligro-suave" onClick={retirarCarga} disabled={!cargado}>
              {colapsada ? 'Reconstruir la torre' : 'Retirar la carga'}
            </button>
            <button className="btn-grande" onClick={() => { setSemilla((s) => s + 1); }} disabled={cargado || !dispersion} title="Otra torre igual, pero con piezas distintas (otra dispersión de resistencias)">
              Nuevas piezas
            </button>
          </div>
          <div className="datos-vivo">
            <div className="lab-panel-titulo">Secuencia de fallas ({estado.fallas.length})</div>
            {estado.fallas.length === 0 ? (
              <p className="nota">
                Cada barra que llega a su capacidad se rompe y su carga pasa a las demás. Si la estructura puede redistribuirla, sigue
                soportando más; si no, las fallas se encadenan y la torre colapsa.
              </p>
            ) : (
              <div className="tabla-scroll tabla-relleno">
                <table className="tabla-datos">
                  <thead>
                    <tr><th>#</th><th>Carga (kg)</th><th>Barra</th><th>Tipo</th><th>Falla</th></tr>
                  </thead>
                  <tbody>
                    {estado.fallas.map((ev, i) => (
                      <tr key={i} onClick={() => ev.barra >= 0 && setBarraSel(ev.barra)} className={ev.barra === barraSel ? 'fila-seleccionada' : ''}>
                        <td>{i + 1}</td>
                        <td>{fmt(ev.P / G_MM_S2, 2)}{ev.cascada ? ' (en cadena)' : ''}</td>
                        <td>{ev.barra >= 0 ? ev.barra + 1 : '—'}</td>
                        <td style={{ textAlign: 'center' }}>{ev.barra >= 0 ? NOMBRE_GRUPO[estructura.barras[ev.barra].grupo] : 'Torre'}</td>
                        <td style={{ textAlign: 'left' }}>{NOMBRE_MODO[ev.modo]}</td>
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
          <div className="lab-panel-titulo">Armado de la torre{bloqueado ? ' (retire la carga para modificarla)' : ''}</div>
          <div className="fila-controles">
            <Segmentado<Planta>
              etiqueta="Planta"
              opciones={[{ valor: 'cuadrada', etiqueta: 'Cuadrada' }, { valor: 'triangular', etiqueta: 'Triangular' }]}
              valor={param.planta}
              onChange={(v) => cambiarParam({ planta: v })}
              disabled={bloqueado}
            />
            <Stepper etiqueta="Altura (mm)" valor={param.altura} onChange={(v) => cambiarParam({ altura: v })} min={100} max={1200} paso={50} decimales={0} disabled={bloqueado} />
            <Stepper etiqueta="Niveles" valor={param.niveles} onChange={(v) => cambiarParam({ niveles: v })} min={1} max={16} paso={1} decimales={0} disabled={bloqueado} />
          </div>
          <div className="fila-controles">
            <Stepper etiqueta="Lado de la base (mm)" valor={param.ladoBase} onChange={(v) => cambiarParam({ ladoBase: v })} min={60} max={500} paso={10} decimales={0} disabled={bloqueado} />
            <Stepper etiqueta="Lado superior (mm)" valor={param.ladoSuperior} onChange={(v) => cambiarParam({ ladoSuperior: v })} min={40} max={500} paso={10} decimales={0} disabled={bloqueado} />
          </div>
          <Segmentado<ArriostreCaras>
            etiqueta="Diagonales en las caras"
            opciones={[{ valor: 'ninguno', etiqueta: 'Ninguna' }, { valor: 'diagonal', etiqueta: 'Simple' }, { valor: 'zigzag', etiqueta: 'Zigzag' }, { valor: 'X', etiqueta: 'En X' }]}
            valor={param.caras}
            onChange={(v) => cambiarParam({ caras: v })}
            disabled={bloqueado}
          />
          {param.caras === 'X' && (
            <Segmentado<'si' | 'no'>
              etiqueta="Cruces de las X pegados entre sí"
              opciones={[{ valor: 'no', etiqueta: 'No (se cruzan sin tocarse)' }, { valor: 'si', etiqueta: 'Sí (pandean en L/2)' }]}
              valor={crucesPegados ? 'si' : 'no'}
              onChange={(v) => setCrucesPegados(v === 'si')}
              disabled={bloqueado}
            />
          )}
          {param.planta === 'cuadrada' && (
            <div className="fila-controles">
              <Segmentado<ArriostrePlanta>
                etiqueta="Diagonales en planta (pisos)"
                opciones={[{ valor: 'ninguno', etiqueta: 'Ninguna' }, { valor: 'diagonal', etiqueta: 'Una' }, { valor: 'X', etiqueta: 'En X' }]}
                valor={param.arriostrePlanta}
                onChange={(v) => cambiarParam({ arriostrePlanta: v })}
                disabled={bloqueado}
              />
              <Stepper etiqueta="Planta arriostrada cada (niveles)" valor={param.plantaCada} onChange={(v) => cambiarParam({ plantaCada: v })} min={1} max={8} paso={1} decimales={0} disabled={bloqueado || param.arriostrePlanta === 'ninguno'} />
            </div>
          )}
          <div className="lab-panel-titulo" style={{ marginTop: 6 }}>Sección de cada tipo de barra</div>
          {(['pata', 'anillo', 'diagonal', ...(param.planta === 'cuadrada' ? (['planta'] as const) : [])] as GrupoSeccion[]).map((g) => (
            <Segmentado
              key={g}
              etiqueta={g === 'pata' ? 'Patas (columnas de las esquinas)' : g === 'anillo' ? 'Anillos (horizontales de cada nivel)' : g === 'diagonal' ? 'Diagonales (y barras agregadas a mano)' : 'Diagonales en planta'}
              opciones={material.secciones.map((s) => ({ valor: s.id, etiqueta: s.etiqueta }))}
              valor={secciones[g]}
              onChange={(v) => setSecciones((s) => ({ ...s, [g]: v }))}
              disabled={bloqueado}
            />
          ))}
          <div className="fila" style={{ marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button className={editar ? 'activo' : ''} onClick={() => { setEditar((e) => !e); setNudoSel(null); }} disabled={bloqueado}>
              {editar ? '✓ Terminar edición libre' : '✎ Edición libre (nudos y barras)'}
            </button>
            <button onClick={deshacer} disabled={bloqueado || !historial.length}>↶ Deshacer</button>
            <button onClick={() => window.confirm('¿Borrar todos los cambios hechos a mano?') && borrarEdiciones()} disabled={bloqueado || !nEdiciones}>
              Borrar cambios ({nEdiciones})
            </button>
          </div>
          {editar && !bloqueado && (
            <div className="caja-edicion">
              <Segmentado<HerramientaEdicion>
                etiqueta="Herramienta"
                opciones={[{ valor: 'barras', etiqueta: 'Quitar / unir barras' }, { valor: 'dividir', etiqueta: 'Dividir barra' }, { valor: 'nudo', etiqueta: 'Mover nudo' }]}
                valor={herramienta}
                onChange={(v) => { setHerramienta(v); setNudoSel(null); }}
              />
              <div className="fila" style={{ flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
                <button onClick={agregarNudo}>＋ Agregar nudo</button>
              </div>
              {nudoEditado && nudoSel !== null ? (
                <>
                  <div className="fila-controles">
                    <Stepper etiqueta={`Nudo ${nudoSel + 1}: x (mm)`} valor={nudoEditado.x} onChange={(v) => moverNudo(nudoSel, 'x', v)} min={-600} max={600} paso={5} decimales={1} />
                    <Stepper etiqueta="y (mm)" valor={nudoEditado.y} onChange={(v) => moverNudo(nudoSel, 'y', v)} min={-600} max={600} paso={5} decimales={1} />
                    <Stepper etiqueta="z, altura (mm)" valor={nudoEditado.z} onChange={(v) => moverNudo(nudoSel, 'z', v)} min={0} max={1500} paso={5} decimales={1} />
                  </div>
                  <Segmentado<'si' | 'no'>
                    etiqueta="Pegado a la base (apoyo)"
                    opciones={[{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]}
                    valor={nudoEditado.apoyo ? 'si' : 'no'}
                    onChange={(v) => editarCon((e) => ({ ...e, apoyos: { ...e.apoyos, [nudoSel]: v === 'si' } }))}
                  />
                </>
              ) : (
                <p className="nota">
                  {herramienta === 'nudo'
                    ? 'Haga clic en un nudo de la vista para moverlo, o agregue uno nuevo y únalo con barras (herramienta «Quitar / unir barras»).'
                    : herramienta === 'dividir'
                      ? 'Dividir una pata o una diagonal larga en dos tramos acorta su longitud de pandeo, pero el nudo nuevo debe quedar arriostrado con otras barras: si no, la torre es un mecanismo.'
                      : 'Las barras quitadas quedan punteadas: haga clic en ellas para devolverlas. Las barras nuevas se ven en celeste.'}
                </p>
              )}
            </div>
          )}
          <p className="nota">
            {estructura.nudos.length} nudos · {estructura.barras.filter((b) => b.grupo !== 'placa').length} barras · masa: barras {fmt(masa.barras_g, 1)} g +
            pegamento {fmt(masa.pegamento_g, 1)} g. Los nudos se consideran articulados (un nudo pegado transmite fuerza axial, casi nada
            de momento): por eso las caras deben estar trianguladas. La placa de carga se apoya en el último nivel y actúa como un piso rígido.
          </p>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Material y unión</div>
          <Segmentado
            etiqueta="Material de las barras"
            opciones={MATERIALES_MAQUETA.map((m) => ({ valor: m.id, etiqueta: m.nombreCorto }))}
            valor={materialId}
            onChange={cambiarMaterial}
            disabled={bloqueado}
          />
          <p className="nota">{material.nombre}: {material.descripcion}</p>
          <Segmentado
            etiqueta="Pegamento de los nudos"
            opciones={UNIONES_MAQUETA.map((u) => ({ valor: u.id, etiqueta: u.nombre }))}
            valor={unionId}
            onChange={setUnionId}
            disabled={bloqueado}
          />
          <p className="nota">{union.descripcion} τ ≈ {fmt(union.tau_MPa, 1)} MPa, {fmt(union.masaPorExtremo_g, 2)} g por extremo de barra.</p>
          <details className="ficha-desplegable">
            <summary>Propiedades del material (editables con sus propios ensayos)</summary>
            <div className="fila-controles" style={{ marginTop: 8 }}>
              <Stepper etiqueta="E (MPa)" valor={material.E_MPa} onChange={(v) => setPropiedades((p) => ({ ...p, [materialId]: { ...p[materialId], E_MPa: v } }))} min={100} max={50000} paso={100} decimales={0} disabled={bloqueado} />
              <Stepper etiqueta="σ tracción (MPa)" valor={material.sigmaT_MPa} onChange={(v) => setPropiedades((p) => ({ ...p, [materialId]: { ...p[materialId], sigmaT_MPa: v } }))} min={1} max={500} paso={1} decimales={0} disabled={bloqueado} />
              <Stepper etiqueta="σ compresión (MPa)" valor={material.sigmaC_MPa} onChange={(v) => setPropiedades((p) => ({ ...p, [materialId]: { ...p[materialId], sigmaC_MPa: v } }))} min={1} max={500} paso={1} decimales={0} disabled={bloqueado} />
            </div>
            <div className="fila-controles">
              <Stepper etiqueta="Densidad (kg/m³)" valor={material.densidad_kg_m3} onChange={(v) => setPropiedades((p) => ({ ...p, [materialId]: { ...p[materialId], densidad_kg_m3: v } }))} min={50} max={3000} paso={10} decimales={0} disabled={bloqueado} />
              <Stepper etiqueta="Dispersión (CV %)" valor={material.cv * 100} onChange={(v) => setPropiedades((p) => ({ ...p, [materialId]: { ...p[materialId], cv: v / 100 } }))} min={0} max={40} paso={1} decimales={0} disabled={bloqueado} />
              <button onClick={() => setPropiedades((p) => ({ ...p, [materialId]: {} }))} disabled={bloqueado} style={{ alignSelf: 'end' }}>Valores de referencia</button>
            </div>
            <p className="nota">Fuente: {material.fuente} Valores ilustrativos: cada marca y lote cambia; lo ideal es medirlos en el Banco 1 o con un ensayo de pandeo de una hebra.</p>
          </details>
          <hr className="separador" />
          <div className="lab-panel-titulo">Condiciones de carga</div>
          <div className="fila-controles">
            <Stepper etiqueta="Excentricidad de la carga (mm)" valor={excentricidad} onChange={setExcentricidad} min={0} max={100} paso={5} decimales={0} disabled={bloqueado} />
            <Stepper etiqueta="Imperfección: carga lateral (%)" valor={lateral} onChange={setLateral} min={0} max={10} paso={0.5} decimales={1} disabled={bloqueado} />
            <Segmentado<'si' | 'no'>
              etiqueta="Dispersión entre piezas"
              opciones={[{ valor: 'si', etiqueta: 'Sí' }, { valor: 'no', etiqueta: 'No' }]}
              valor={dispersion ? 'si' : 'no'}
              onChange={(v) => setDispersion(v === 'si')}
              disabled={bloqueado}
            />
          </div>
          <p className="nota">
            Ninguna torre real está perfectamente vertical ni recibe la carga justo al centro: la carga lateral (un pequeño % de la vertical)
            representa esa imperfección. Con la dispersión activada cada pieza tiene una resistencia algo distinta (semilla {semilla}); en un
            concurso, use la misma semilla para todos los equipos.
          </p>
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Barras ({estructura.barras.filter((b) => b.grupo !== 'placa').length}) — clic para ver sus ecuaciones</div>
          <div className="tabla-scroll" style={{ maxHeight: 360 }}>
            <table className="tabla-datos">
              <thead>
                <tr><th>#</th><th>Tipo</th><th>L (mm)</th><th>Sección</th><th>λ</th><th>N (N)</th><th>T máx (N)</th><th>C máx (N)</th><th>Uso</th></tr>
              </thead>
              <tbody>
                {estructura.barras.map((b, j) => {
                  if (b.grupo === 'placa') return null;
                  const d = detalle[j];
                  const pr = props[j];
                  const v = uso(j);
                  return (
                    <tr key={j} onClick={() => setBarraSel(j)} className={j === barraSel ? 'fila-seleccionada' : ''}>
                      <td>{j + 1}</td>
                      <td style={{ textAlign: 'center' }}>{NOMBRE_GRUPO[b.grupo]}</td>
                      <td>{fmt(d.L, 0)}</td>
                      <td style={{ textAlign: 'center' }}>{d.seccion?.etiqueta}</td>
                      <td>{fmt(d.lambda, 0)}</td>
                      <td>{rotas.has(j) ? '—' : fmt(N[j], 2)}</td>
                      <td title={pr.modoTraccion === 'union' ? 'Limitada por la unión' : 'Rotura de la barra'}>{fmt(pr.capTraccion, 1)}{pr.modoTraccion === 'union' ? ' (u)' : ''}</td>
                      <td>{fmt(pr.capCompresion, 2)}</td>
                      <td style={{ color: rotas.has(j) ? '#ff5c5c' : Math.abs(v) > 0.8 ? '#f0b429' : undefined }}>{rotas.has(j) ? 'rota' : `${fmt(Math.abs(v) * 100, 0)} %`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="nota">N positiva = tracción, negativa = compresión. (u): en tracción manda la unión pegada. C máx = Euler o Johnson, según la esbeltez.</p>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Concurso</div>
          <div className="fila campo">
            <div style={{ flex: 2 }}>
              <label>Nombre del equipo</label>
              <input type="text" value={equipo} onChange={(e) => setEquipo(e.target.value)} placeholder="Equipo 1" />
            </div>
            <div>
              <label>Predicción (kg)</label>
              <input type="number" value={prediccion} onChange={(e) => setPrediccion(e.target.value)} placeholder="¿Cuánto soportará?" disabled={cargado} />
            </div>
          </div>
          {colapsada && (
            <div className="resumen-ensayo">
              <ResumenItem etiqueta="Carga soportada" valor={`${fmt(cargaSostenidaKg, 2)} kg`} />
              <ResumenItem etiqueta="Capacidad exacta (rampa)" valor={`${fmt(Pmax_kg, 2)} kg`} />
              <ResumenItem etiqueta="Eficiencia" valor={masa.total_g > 0 ? `${fmt((cargaSostenidaKg * 1000) / masa.total_g, 0)} veces su peso` : '—'} />
              {prediccion !== '' && <ResumenItem etiqueta="Error de la predicción" valor={`${fmt(((Number(prediccion) - cargaSostenidaKg) / Math.max(cargaSostenidaKg, 1e-6)) * 100, 0)} %`} />}
            </div>
          )}
          <div className="fila" style={{ flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
            <button className="btn-iniciar" onClick={registrar} disabled={!colapsada || registrado}>{registrado ? '✓ Registrado' : 'Registrar en el ranking'}</button>
            <button onClick={guardarDiseno}>Guardar diseño</button>
            <button onClick={() => archivoRef.current?.click()} disabled={bloqueado}>Abrir diseño</button>
            <input ref={archivoRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void abrirDiseno(f); e.target.value = ''; }} />
            <button onClick={() => exportarSvgComoPng(ID_VISTA, 'torre.png')}>Imagen de la torre</button>
          </div>
          <details className="ficha-desplegable">
            <summary>Bases del concurso</summary>
            <div className="fila-controles" style={{ marginTop: 8 }}>
              <Stepper etiqueta="Altura mínima (mm)" valor={reglas.alturaMin} onChange={(v) => setReglas((r) => ({ ...r, alturaMin: v }))} min={0} max={1500} paso={50} decimales={0} />
              <Stepper etiqueta="Lado máximo de la base (mm)" valor={reglas.baseMax} onChange={(v) => setReglas((r) => ({ ...r, baseMax: v }))} min={50} max={1000} paso={10} decimales={0} />
              <Stepper etiqueta="Masa máxima (g, 0 = libre)" valor={reglas.masaMax} onChange={(v) => setReglas((r) => ({ ...r, masaMax: v }))} min={0} max={2000} paso={10} decimales={0} />
            </div>
          </details>
          <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'end', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
            <Segmentado<'eficiencia' | 'carga'>
              etiqueta="Ganador por"
              opciones={[{ valor: 'eficiencia', etiqueta: 'Eficiencia (carga/peso)' }, { valor: 'carga', etiqueta: 'Carga máxima' }]}
              valor={criterio}
              onChange={setCriterio}
            />
            <div className="fila" style={{ gap: 8 }}>
              <button onClick={exportarRanking} disabled={!ranking.length}>Exportar CSV</button>
              <button className="btn-peligro-suave" onClick={vaciarRanking} disabled={!ranking.length}>Vaciar</button>
            </div>
          </div>
          {ranking.length === 0 ? (
            <p className="nota">Cuando una torre colapse, registre al equipo. El ranking se guarda en este navegador.</p>
          ) : (
            <div className="tabla-scroll" style={{ maxHeight: 260, marginTop: 8 }}>
              <table className="tabla-datos">
                <thead>
                  <tr><th>#</th><th>Equipo</th><th>Material</th><th>Masa (g)</th><th>Carga (kg)</th><th>Carga/peso</th><th>Bases</th><th></th></tr>
                </thead>
                <tbody>
                  {rankingOrdenado.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td style={{ textAlign: 'left' }}>{r.equipo}</td>
                      <td style={{ textAlign: 'center' }}>{r.material}</td>
                      <td>{fmt(r.masa_g, 1)}</td>
                      <td>{fmt(r.carga_kg, 2)}</td>
                      <td>{fmt(r.eficiencia, 0)}</td>
                      <td title={r.motivos} style={{ textAlign: 'center' }}>{r.cumple ? '✓' : '✗'}</td>
                      <td><button className="btn-mini" onClick={() => borrarEntrada(r.id)} aria-label={`Borrar ${r.equipo}`}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="nota">
            Modelo: barras articuladas, frágiles y elásticas; pandeo de cada barra entre nudos con Euler (o Johnson si es corta) y pandeo
            global de la torre con un análisis lineal de estabilidad. No modela la excentricidad de los nudos ni la flexión de la placa:
            sirve para comparar diseños, no para predecir al gramo una maqueta real.
          </p>
        </section>
      </div>
    </div>
  );
}

/** Banco 10: torres en 3D para el concurso, o armaduras planas tipo puente para la clase. */
export function StructuresBench({ onVolver }: { onVolver: () => void }) {
  const [modo, setModo] = useState<'torre' | 'plana'>('torre');
  const selector = (
    <div className="selector-modo">
      <Segmentado<'torre' | 'plana'>
        opciones={[{ valor: 'torre', etiqueta: 'Torre 3D (concurso)' }, { valor: 'plana', etiqueta: 'Armadura plana 2D (puentes)' }]}
        valor={modo}
        onChange={setModo}
      />
    </div>
  );
  return modo === 'torre' ? <TorreBench onVolver={onVolver} selectorModo={selector} /> : <ArmaduraPlanaBench onVolver={onVolver} selectorModo={selector} />;
}
