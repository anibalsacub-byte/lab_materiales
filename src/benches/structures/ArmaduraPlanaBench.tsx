import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DisplayDigital, Segmentado, Stepper } from '../../components/lab/LabUI';
import { EcuacionesVivo, fmt, useModoLab, type Ecuacion } from '../../components/lab/PanelesEnsayo';
import { descargarArchivo, exportarSvgComoPng } from '../../trial/exportar';
import {
  analizarColapso,
  desplazamientos,
  ensamblar,
  esMecanismo,
  estadoEnCarga,
  fuerzasAxiales,
  nudoMasDesplazado,
  nudosSinArriostrar,
  reacciones,
  type ModoFalla,
} from '../../engine/mechanics/reticulado3d';
import { MATERIALES_MAQUETA, UNIONES_MAQUETA, cargaPesoPropio, masaMaqueta, propiedadesMaqueta } from '../../engine/mechanics/torres';
import {
  aEstructura,
  conteoMaxwell,
  etiquetasGdl,
  plantillaArmadura,
  quitarNudo,
  vectorCargas,
  type ApoyoPlano,
  type ArmaduraPlana,
  type PlantillaPlana,
} from '../../engine/mechanics/plano';
import { Vista2DSVG, type Herramienta2D } from './Vista2DSVG';

const ID_VISTA = 'vista-armadura-plana';
const MAX_GDL_MATRIZ = 30;

const NOMBRE_APOYO: Record<ApoyoPlano, string> = { ninguno: 'Libre', articulado: 'Articulado', rodilloH: 'Rodillo (piso)', rodilloV: 'Rodillo (pared)' };
const NOMBRE_MODO: Record<ModoFalla, string> = {
  traccion: 'rotura por tracción',
  pandeo: 'pandeo',
  aplastamiento: 'aplastamiento',
  union: 'se despega la unión',
  global: 'pandeo global',
  mecanismo: 'la armadura se vuelve un mecanismo',
};
const AYUDA: Record<Herramienta2D, string> = {
  seleccionar: 'Clic en una barra para ver sus ecuaciones.',
  mover: 'Arrastre un nudo para moverlo.',
  nudo: 'Clic en un lugar vacío para crear un nudo (se ajusta a la cuadrícula).',
  barra: 'Clic en un nudo y luego en otro para unirlos con una barra.',
  apoyo: 'Clic en un nudo para ponerle el apoyo elegido (otro clic lo quita).',
  carga: 'Clic en un nudo para aplicarle la carga Fx, Fy indicada (0 y 0 la quita).',
  borrar: 'Clic en un nudo o una barra para borrarlo.',
};

export function ArmaduraPlanaBench({ onVolver, selectorModo }: { onVolver: () => void; selectorModo: ReactNode }) {
  useModoLab();

  const [plantilla, setPlantilla] = useState<PlantillaPlana>('pratt');
  const [luz, setLuz] = useState(600);
  const [altura, setAltura] = useState(100);
  const [paneles, setPaneles] = useState(6);
  const [cargaTotal, setCargaTotal] = useState(30);
  const [arm, setArmRaw] = useState<ArmaduraPlana>(() => plantillaArmadura('pratt', 600, 100, 6, 30));
  const [historial, setHistorial] = useState<ArmaduraPlana[]>([]);

  const [herramienta, setHerramienta] = useState<Herramienta2D>('seleccionar');
  const [tipoApoyo, setTipoApoyo] = useState<ApoyoPlano>('articulado');
  const [cargaFx, setCargaFx] = useState(0);
  const [cargaFy, setCargaFy] = useState(-10);
  const [ajustar, setAjustar] = useState(true);
  const [seleccion, setSeleccion] = useState<{ tipo: 'nudo' | 'barra'; i: number } | null>(null);
  const [nudoPendiente, setNudoPendiente] = useState<number | null>(null);

  const [materialId, setMaterialId] = useState('tallarin');
  const [unionId, setUnionId] = useState('epoxi');
  const [seccionDefecto, setSeccionDefecto] = useState('4h');
  const [pesoPropio, setPesoPropio] = useState(false);

  const [modo, setModo] = useState<'estatico' | 'colapso'>('estatico');
  const [factor, setFactor] = useState(0);
  const [ensayando, setEnsayando] = useState(false);
  const [animColapso, setAnimColapso] = useState(0);
  const [amplificar, setAmplificar] = useState<'1' | '10' | '50'>('10');
  const [mostrarFuerzas, setMostrarFuerzas] = useState(true);
  const [mostrarReacciones, setMostrarReacciones] = useState(true);
  const [mostrarMatriz, setMostrarMatriz] = useState(false);
  const archivoRef = useRef<HTMLInputElement>(null);

  const material = MATERIALES_MAQUETA.find((m) => m.id === materialId) ?? MATERIALES_MAQUETA[0];
  const union = UNIONES_MAQUETA.find((u) => u.id === unionId) ?? UNIONES_MAQUETA[0];

  const cambiar = (nuevo: ArmaduraPlana | ((a: ArmaduraPlana) => ArmaduraPlana)) => {
    setHistorial((h) => [...h.slice(-79), arm]);
    setArmRaw(typeof nuevo === 'function' ? nuevo(arm) : nuevo);
  };
  const deshacer = () => {
    if (!historial.length) return;
    setArmRaw(historial[historial.length - 1]);
    setHistorial((h) => h.slice(0, -1));
    setSeleccion(null);
    setNudoPendiente(null);
  };

  // ---------- Cálculo ----------
  const est = useMemo(() => aEstructura(arm), [arm]);
  const { props, detalle } = useMemo(
    () => propiedadesMaqueta(est, { material, union, secciones: { pata: seccionDefecto, anillo: seccionDefecto, diagonal: seccionDefecto, planta: seccionDefecto }, dispersion: false, semilla: 1 }),
    [est, material, union, seccionDefecto],
  );
  const masa = useMemo(() => masaMaqueta(est, detalle, union), [est, detalle, union]);
  const f = useMemo(() => vectorCargas(arm), [arm]);
  const fPeso = useMemo(() => (pesoPropio ? cargaPesoPropio(est, detalle, union) : new Float64Array(3 * arm.nudos.length)), [pesoPropio, est, detalle, union, arm.nudos.length]);
  const hayCargas = f.some((v) => v !== 0);
  const maxwell = conteoMaxwell(arm);
  const sueltos = useMemo(() => nudosSinArriostrar(est), [est]);

  const estatico = useMemo(() => {
    if (!arm.nudos.length || !arm.barras.length) return null;
    const activas = est.barras.map(() => true);
    const sis = ensamblar(est, props, activas);
    const total = f.map((v, i) => v + fPeso[i]);
    const u = desplazamientos(sis, total);
    const sinCargas = !hayCargas && !pesoPropio;
    const mecanismo = !sinCargas && esMecanismo(sis, hayCargas ? f : total, u);
    const N = fuerzasAxiales(est, props, activas, u);
    const R = reacciones(est, activas, N, total);
    return { sis, u, N, R, mecanismo, sinCargas, nudoLibre: mecanismo ? nudoMasDesplazado(u) : undefined };
  }, [arm, est, props, f, fPeso, hayCargas, pesoPropio]);

  const colapso = useMemo(() => (hayCargas && arm.barras.length ? analizarColapso(est, props, f, fPeso) : null), [hayCargas, arm.barras.length, est, props, f, fPeso]);
  const lambdaC = colapso ? colapso.Pmax : 0;

  useEffect(() => {
    setFactor(0);
    setEnsayando(false);
  }, [colapso]);

  // Rampa del factor de carga hasta el colapso.
  useEffect(() => {
    if (!ensayando || !colapso) return;
    let id = 0;
    let anterior = performance.now();
    const duracion = 6; // s hasta el colapso
    const paso = () => {
      const ahora = performance.now();
      const dt = Math.min(0.25, (ahora - anterior) / 1000);
      anterior = ahora;
      let fin = false;
      setFactor((x) => {
        const nuevo = x + (Math.max(lambdaC, 0.01) / duracion) * dt;
        if (nuevo >= lambdaC) {
          fin = true;
          return lambdaC;
        }
        return nuevo;
      });
      if (fin) setEnsayando(false);
      else id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [ensayando, colapso, lambdaC]);

  const enColapso = modo === 'colapso' && !!colapso;
  const estado = enColapso && factor > 0 ? estadoEnCarga(colapso!, factor) : null;
  const colapsada = !!estado?.colapsada;

  useEffect(() => {
    if (!colapsada) {
      setAnimColapso(0);
      return;
    }
    let id = 0;
    const t0 = performance.now();
    const paso = () => {
      const t = Math.min(1, (performance.now() - t0) / 1200);
      setAnimColapso(t);
      if (t < 1) id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [colapsada]);

  // Fuerzas y desplazamientos que se muestran.
  let N: Float64Array | null = null;
  let u: Float64Array | null = null;
  let R: Float64Array | null = null;
  const rotas = new Set<number>();
  if (enColapso) {
    for (const ev of estado?.fallas ?? []) if (ev.barra >= 0) rotas.add(ev.barra);
    const et = estado?.etapa ?? colapso!.etapas[0];
    if (et) {
      const W = colapsada ? lambdaC : factor;
      N = new Float64Array(est.barras.length);
      u = new Float64Array(3 * arm.nudos.length);
      for (let j = 0; j < N.length; j++) N[j] = et.activas[j] ? et.Nw[j] + W * et.Nu[j] : 0;
      for (let i = 0; i < u.length; i++) u[i] = et.uw[i] + W * et.uu[i];
      const cargasW = f.map((v, i) => W * v + fPeso[i]);
      R = reacciones(est, et.activas, N, cargasW);
    }
  } else if (estatico && !estatico.mecanismo && !estatico.sinCargas) {
    N = estatico.N;
    u = estatico.u;
    R = estatico.R;
  }

  const usoBarra = (j: number) => {
    if (!N) return 0;
    const pr = props[j];
    return N[j] >= 0 ? N[j] / pr.capTraccion : N[j] / pr.capCompresion;
  };
  const usos = est.barras.map((_, j) => usoBarra(j));
  const usoMax = Math.max(0, ...usos.filter((_, j) => !rotas.has(j)).map(Math.abs));

  // Deformada amplificada (limitada para que se vea bien) y forma de colapso.
  const span = Math.max(100, ...arm.nudos.map((n) => n.x)) - Math.min(0, ...arm.nudos.map((n) => n.x));
  let uVis: Float64Array | null = null;
  if (u) {
    uVis = u.map((v) => v * Number(amplificar));
    const m = Math.max(...uVis.map(Math.abs), 0);
    if (m > span * 0.08) uVis = uVis.map((v) => (v * span * 0.08) / m);
    if (colapsada && colapso?.formaColapso) {
      const forma = colapso.formaColapso;
      const t = animColapso * animColapso;
      uVis = uVis.map((v, i) => v + forma[i] * span * 0.12 * t * (forma.reduce((s, x, k) => (k % 3 === 2 ? s + x : s), 0) > 0 ? -1 : 1));
    }
  }

  // ---------- Edición ----------
  const clicVacio = (x: number, y: number) => {
    setNudoPendiente(null);
    if (herramienta === 'nudo') {
      if (arm.nudos.some((n) => Math.hypot(n.x - x, n.y - y) < 4)) return;
      cambiar((a) => ({ ...a, nudos: [...a.nudos, { x, y, apoyo: 'ninguno' }] }));
    } else setSeleccion(null);
  };
  const clicNudo = (i: number) => {
    if (herramienta === 'barra') {
      if (nudoPendiente === null) setNudoPendiente(i);
      else if (nudoPendiente === i) setNudoPendiente(null);
      else {
        const a = nudoPendiente;
        if (!arm.barras.some((b) => (b.a === a && b.b === i) || (b.a === i && b.b === a))) cambiar((x) => ({ ...x, barras: [...x.barras, { a, b: i }] }));
        setNudoPendiente(null);
      }
    } else if (herramienta === 'apoyo') {
      cambiar((x) => ({ ...x, nudos: x.nudos.map((n, k) => (k === i ? { ...n, apoyo: n.apoyo === tipoApoyo ? 'ninguno' : tipoApoyo } : n)) }));
    } else if (herramienta === 'carga') {
      cambiar((x) => {
        const resto = x.cargas.filter((c) => c.nudo !== i);
        return { ...x, cargas: cargaFx === 0 && cargaFy === 0 ? resto : [...resto, { nudo: i, fx: cargaFx, fy: cargaFy }] };
      });
    } else if (herramienta === 'borrar') {
      cambiar((x) => quitarNudo(x, i));
      setSeleccion(null);
    } else setSeleccion({ tipo: 'nudo', i });
  };
  const clicBarra = (j: number) => {
    if (herramienta === 'borrar') {
      cambiar((x) => ({ ...x, barras: x.barras.filter((_, k) => k !== j) }));
      setSeleccion(null);
    } else setSeleccion({ tipo: 'barra', i: j });
  };
  const inicioArrastre = () => setHistorial((h) => [...h.slice(-79), arm]);
  const arrastrar = (i: number, x: number, y: number) => setArmRaw((a) => ({ ...a, nudos: a.nudos.map((n, k) => (k === i ? { ...n, x, y } : n)) }));

  const aplicarPlantilla = () => {
    if (arm.nudos.length && !window.confirm('La plantilla reemplaza la armadura actual (puede deshacerlo). ¿Continuar?')) return;
    cambiar(plantillaArmadura(plantilla, luz, altura, paneles, cargaTotal));
    setSeleccion(null);
  };
  const cambiarMaterial = (id: string) => {
    setMaterialId(id);
    const m = MATERIALES_MAQUETA.find((x) => x.id === id) ?? MATERIALES_MAQUETA[0];
    setSeccionDefecto(m.secciones[Math.min(2, m.secciones.length - 1)].id);
    cambiar((a) => ({ ...a, barras: a.barras.map(({ a: x, b: y }) => ({ a: x, b: y })) }));
  };

  const guardar = () => descargarArchivo('armadura.plana.json', JSON.stringify({ tipo: 'armadura-plana-lab-rm', version: 1, arm, materialId, unionId, seccionDefecto }, null, 2), 'application/json');
  const abrir = async (archivo: File) => {
    try {
      const d = JSON.parse(await archivo.text());
      if (d.tipo !== 'armadura-plana-lab-rm') throw new Error('tipo');
      cambiar(d.arm as ArmaduraPlana);
      if (MATERIALES_MAQUETA.some((m) => m.id === d.materialId)) setMaterialId(d.materialId);
      if (UNIONES_MAQUETA.some((x) => x.id === d.unionId)) setUnionId(d.unionId);
      if (d.seccionDefecto) setSeccionDefecto(d.seccionDefecto);
    } catch {
      window.alert('El archivo no es una armadura plana válida.');
    }
  };

  // ---------- Ecuaciones de la barra seleccionada ----------
  const jSel = seleccion?.tipo === 'barra' && seleccion.i < est.barras.length ? seleccion.i : null;
  const ecuaciones: Ecuacion[] = [];
  if (jSel !== null && detalle[jSel]?.seccion) {
    const d = detalle[jSel];
    const s = d.seccion!;
    const pr = props[jSel];
    const Nj = N ? N[jSel] : 0;
    const b = arm.barras[jSel];
    ecuaciones.push(
      { nombre: `Barra ${jSel + 1} (nudos ${b.a + 1}–${b.b + 1}, ${s.etiqueta}) — esbeltez`, formula: 'λ = L / r,  r = √(I/A)', sustitucion: `${fmt(d.L, 1)} / √(${fmt(s.I, 3)}/${fmt(s.A, 2)})`, resultado: fmt(d.lambda, 0) },
      { nombre: 'Carga crítica de Euler (K = 1)', formula: 'Pcr = π²·E·I / L²', sustitucion: `π²·${fmt(material.E_MPa, 0)}·${fmt(s.I, 3)} / ${fmt(d.L, 1)}²`, resultado: `${fmt(d.Pcr, 2)} N`, nota: pr.modoCompresion === 'aplastamiento' ? 'Barra corta: manda el aplastamiento (Johnson).' : undefined },
      { nombre: 'Resistencia a la tracción', formula: 'T = σt·A', sustitucion: `${fmt(material.sigmaT_MPa, 1)}·${fmt(s.A, 2)}`, resultado: `${fmt(material.sigmaT_MPa * s.A, 1)} N`, nota: pr.modoTraccion === 'union' ? `Manda la unión: ${fmt(d.capUnion, 1)} N.` : undefined },
      {
        nombre: 'Esfuerzo y uso con las cargas actuales',
        formula: Nj >= 0 ? 'σ = N/A ;  uso = N / T' : 'σ = N/A ;  uso = |N| / Pcr',
        sustitucion: N ? `${fmt(Nj, 2)} / ${fmt(s.A, 2)} ;  ${fmt(Math.abs(Nj), 2)} / ${fmt(Nj >= 0 ? pr.capTraccion : pr.capCompresion, 2)}` : undefined,
        resultado: N ? (rotas.has(jSel) ? 'rota' : `${fmt(Nj / s.A, 2)} MPa ;  ${fmt(Math.abs(usoBarra(jSel)) * 100, 0)} %`) : undefined,
      },
    );
  }
  if (R && hayCargas) {
    let sfx = 0;
    let sfy = 0;
    let srx = 0;
    let sry = 0;
    const W = enColapso ? (colapsada ? lambdaC : factor) : 1;
    for (let i = 0; i < arm.nudos.length; i++) {
      sfx += W * f[3 * i] + fPeso[3 * i];
      sfy += W * f[3 * i + 2] + fPeso[3 * i + 2];
      srx += R[3 * i];
      sry += R[3 * i + 2];
    }
    ecuaciones.push({
      nombre: 'Equilibrio de la armadura completa',
      formula: 'ΣFx + ΣRx = 0 ;  ΣFy + ΣRy = 0',
      sustitucion: `${fmt(sfx, 2)} + ${fmt(srx, 2)} ;  ${fmt(sfy, 2)} + ${fmt(sry, 2)}`,
      resultado: `${fmt(sfx + srx, 2)} ;  ${fmt(sfy + sry, 2)}`,
    });
  }

  const cargaAplicada = arm.cargas.reduce((s, c) => s + Math.hypot(c.fx, c.fy), 0);
  let textoEstado: string;
  if (!arm.nudos.length) textoEstado = 'Armadura vacía: use la herramienta Nudo o cargue una plantilla.';
  else if (estatico?.mecanismo) textoEstado = `Es un mecanismo: no puede equilibrar las cargas${estatico.nudoLibre ? ` (el nudo ${estatico.nudoLibre.nudo + 1} se desplaza libremente)` : ''}. Agregue barras o apoyos.`;
  else if (!hayCargas) textoEstado = 'Sin cargas: aplique alguna con la herramienta Carga.';
  else if (enColapso && colapsada) textoEstado = `Colapsó con ${fmt(lambdaC, 2)} veces las cargas aplicadas: ${NOMBRE_MODO[colapso!.final]}.`;
  else if (enColapso) textoEstado = factor > 0 ? `Cargas × ${fmt(factor, 2)}${rotas.size ? ` · ${rotas.size} barra(s) rota(s)` : ''}.` : 'Pulse «Ensayar» para aumentar las cargas hasta el colapso.';
  else textoEstado = usoMax > 1 ? `Con estas cargas falla al menos una barra (uso ${fmt(usoMax * 100, 0)} %).` : `Resiste las cargas: barra más exigida al ${fmt(usoMax * 100, 0)} %.`;

  const etiquetas = etiquetasGdl(arm);
  const sis = estatico?.sis;

  return (
    <div className="lab">
      <div className="topbar">
        <div>
          <div className="titulo">Banco 10 — Concurso de estructuras</div>
          <div className="subtitulo">Armaduras planas: dibuje nudos, barras, apoyos y cargas; calcule fuerzas y reacciones, y ensaye hasta el colapso.</div>
        </div>
        <button className="volver" onClick={onVolver}>← Volver al catálogo</button>
      </div>
      {selectorModo}

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Editor de la armadura</div>
          <Segmentado<Herramienta2D>
            etiqueta="Herramienta"
            opciones={[
              { valor: 'seleccionar', etiqueta: 'Seleccionar' },
              { valor: 'mover', etiqueta: 'Mover' },
              { valor: 'nudo', etiqueta: 'Nudo' },
              { valor: 'barra', etiqueta: 'Barra' },
              { valor: 'apoyo', etiqueta: 'Apoyo' },
              { valor: 'carga', etiqueta: 'Carga' },
              { valor: 'borrar', etiqueta: 'Borrar' },
            ]}
            valor={herramienta}
            onChange={(v) => { setHerramienta(v); setNudoPendiente(null); }}
            disabled={ensayando}
          />
          {herramienta === 'apoyo' && (
            <Segmentado<ApoyoPlano>
              etiqueta="Tipo de apoyo"
              opciones={[{ valor: 'articulado', etiqueta: 'Articulado (Rx, Ry)' }, { valor: 'rodilloH', etiqueta: 'Rodillo en piso (Ry)' }, { valor: 'rodilloV', etiqueta: 'Rodillo en pared (Rx)' }]}
              valor={tipoApoyo}
              onChange={setTipoApoyo}
            />
          )}
          {herramienta === 'carga' && (
            <div className="fila-controles">
              <Stepper etiqueta="Fx (N, + a la derecha)" valor={cargaFx} onChange={setCargaFx} min={-1000} max={1000} paso={1} decimales={1} />
              <Stepper etiqueta="Fy (N, + hacia arriba)" valor={cargaFy} onChange={setCargaFy} min={-1000} max={1000} paso={1} decimales={1} />
            </div>
          )}
          <p className="nota" style={{ margin: '6px 0' }}>{AYUDA[herramienta]}</p>
          <Vista2DSVG
            id={ID_VISTA}
            arm={arm}
            N={N}
            uso={usos}
            rotas={rotas}
            grosor={detalle.map((d) => (d.seccion ? 1.5 + 1.2 * Math.sqrt(d.seccion.A) : 2))}
            u={uVis}
            R={R}
            factorCargas={enColapso ? (colapsada ? lambdaC : factor) : 1}
            herramienta={herramienta}
            seleccion={seleccion}
            nudoPendiente={nudoPendiente}
            mostrarFuerzas={mostrarFuerzas}
            mostrarReacciones={mostrarReacciones}
            ajustar={ajustar}
            colorMaterial={material.color}
            onClickVacio={clicVacio}
            onClickNudo={clicNudo}
            onClickBarra={clicBarra}
            onInicioArrastre={inicioArrastre}
            onArrastrar={arrastrar}
          />
          <div className="leyenda-fuerzas">
            <span><i style={{ background: '#4fa3ff' }} /> Tracción (+)</span>
            <span><i style={{ background: '#ff5c5c' }} /> Compresión (−)</span>
            <span><i style={{ background: '#f0b429' }} /> Cargas</span>
            <span><i style={{ background: '#3ecf8e' }} /> Reacciones</span>
          </div>
          <div className="fila" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button onClick={deshacer} disabled={!historial.length || ensayando}>↶ Deshacer</button>
            <button className={mostrarFuerzas ? 'activo' : ''} onClick={() => setMostrarFuerzas((v) => !v)}>Fuerzas</button>
            <button className={mostrarReacciones ? 'activo' : ''} onClick={() => setMostrarReacciones((v) => !v)}>Reacciones</button>
            <button className={ajustar ? 'activo' : ''} onClick={() => setAjustar((v) => !v)}>Ajustar a cuadrícula</button>
          </div>
          <div className="maquina-estado">
            <div>
              <span className={`punto ${estatico?.mecanismo || colapsada ? 'rota' : N ? 'marcha' : ''}`} />
              <strong>{textoEstado}</strong>
            </div>
            <div>
              {sueltos.length > 0 && <div className="texto-alerta">⚠ Nudo{sueltos.length > 1 ? 's' : ''} {sueltos.map((i) => i + 1).join(', ')} sin arriostrar: solo llegan barras alineadas. Se mueve libremente en la otra dirección.</div>}
              Maxwell: m + r − 2j = {maxwell.m} + {maxwell.r} − 2·{maxwell.j} = <strong>{maxwell.grado}</strong> → {maxwell.texto}.
            </div>
          </div>
          <EcuacionesVivo ecuaciones={ecuaciones} />
        </section>

        <section className="lab-panel panel-columna">
          <div className="lab-panel-titulo">Cálculo y ensayo</div>
          <Segmentado<'estatico' | 'colapso'>
            etiqueta="Qué calcular"
            opciones={[{ valor: 'estatico', etiqueta: 'Fuerzas con las cargas dadas' }, { valor: 'colapso', etiqueta: 'Ensayo hasta el colapso' }]}
            valor={modo}
            onChange={(v) => { setModo(v); setFactor(0); setEnsayando(false); }}
          />
          <DisplayDigital
            items={[
              { etiqueta: 'Carga aplicada', valor: fmt(cargaAplicada, 1), unidad: 'N' },
              { etiqueta: 'Barra más exigida', valor: N ? fmt(usoMax * 100, 0) : '—', unidad: '% de su capacidad', alerta: usoMax > 1 },
              { etiqueta: 'Factor de colapso', valor: colapso && !colapso.inestable ? fmt(lambdaC, 2) : '—', unidad: '× las cargas' },
              { etiqueta: 'Masa', valor: fmt(masa.total_g, 1), unidad: 'g' },
            ]}
          />
          {modo === 'colapso' && (
            <>
              <div className="controles-principales">
                <button className="btn-grande btn-iniciar" onClick={() => setEnsayando(true)} disabled={!colapso || colapso.inestable || ensayando || colapsada}>▶ Ensayar</button>
                <button className="btn-grande" onClick={() => setEnsayando(false)} disabled={!ensayando}>❚❚ Pausa</button>
                <button className="btn-grande btn-peligro-suave" onClick={() => { setFactor(0); setEnsayando(false); }} disabled={factor === 0}>Reiniciar</button>
                <div />
              </div>
              <label className="stepper-etiqueta">Factor de carga: {fmt(factor, 2)} × las cargas dibujadas</label>
              <input
                type="range"
                min={0}
                max={Math.max(lambdaC * 1.05, 0.01)}
                step={Math.max(lambdaC / 400, 0.0001)}
                value={factor}
                onChange={(e) => setFactor(Number(e.target.value))}
                disabled={!colapso || colapso.inestable || ensayando}
                style={{ width: '100%' }}
              />
            </>
          )}
          <Segmentado<'1' | '10' | '50'>
            etiqueta="Amplificar deformación"
            opciones={[{ valor: '1', etiqueta: '×1' }, { valor: '10', etiqueta: '×10' }, { valor: '50', etiqueta: '×50' }]}
            valor={amplificar}
            onChange={setAmplificar}
          />
          <div className="datos-vivo">
            <div className="lab-panel-titulo">{modo === 'colapso' ? `Secuencia de fallas (${estado?.fallas.length ?? 0})` : `Barras (${arm.barras.length})`}</div>
            <div className="tabla-scroll tabla-relleno">
              {modo === 'colapso' ? (
                <table className="tabla-datos">
                  <thead><tr><th>#</th><th>Factor</th><th>Barra</th><th>Falla</th></tr></thead>
                  <tbody>
                    {(estado?.fallas ?? []).map((ev, i) => (
                      <tr key={i} onClick={() => ev.barra >= 0 && setSeleccion({ tipo: 'barra', i: ev.barra })}>
                        <td>{i + 1}</td>
                        <td>{fmt(ev.P, 3)}{ev.cascada ? ' (en cadena)' : ''}</td>
                        <td>{ev.barra >= 0 ? `${ev.barra + 1} (${arm.barras[ev.barra].a + 1}–${arm.barras[ev.barra].b + 1})` : '—'}</td>
                        <td style={{ textAlign: 'left' }}>{NOMBRE_MODO[ev.modo]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="tabla-datos">
                  <thead><tr><th>#</th><th>Nudos</th><th>L (mm)</th><th>Sección</th><th>N (N)</th><th>T máx</th><th>C máx</th><th>Uso</th><th></th></tr></thead>
                  <tbody>
                    {arm.barras.map((b, j) => {
                      const pr = props[j];
                      const d = detalle[j];
                      return (
                        <tr key={j} onClick={() => setSeleccion({ tipo: 'barra', i: j })} className={jSel === j ? 'fila-seleccionada' : ''}>
                          <td>{j + 1}</td>
                          <td style={{ textAlign: 'center' }}>{b.a + 1}–{b.b + 1}</td>
                          <td>{fmt(d.L, 0)}</td>
                          <td>
                            <select value={b.seccion ?? ''} onChange={(e) => { const v = e.target.value; cambiar((x) => ({ ...x, barras: x.barras.map((y, k) => (k === j ? (v ? { ...y, seccion: v } : { a: y.a, b: y.b }) : y)) })); }} onClick={(e) => e.stopPropagation()}>
                              <option value="">Por defecto</option>
                              {material.secciones.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
                            </select>
                          </td>
                          <td>{N ? fmt(N[j], 2) : '—'}</td>
                          <td>{fmt(pr.capTraccion, 1)}{pr.modoTraccion === 'union' ? ' (u)' : ''}</td>
                          <td>{fmt(pr.capCompresion, 2)}</td>
                          <td style={{ color: Math.abs(usos[j]) > 1 ? '#ff5c5c' : Math.abs(usos[j]) > 0.8 ? '#f0b429' : undefined }}>{N ? `${fmt(Math.abs(usos[j]) * 100, 0)} %` : '—'}</td>
                          <td><button className="btn-mini" onClick={(e) => { e.stopPropagation(); cambiar((x) => ({ ...x, barras: x.barras.filter((_, k) => k !== j) })); setSeleccion(null); }} aria-label={`Borrar barra ${j + 1}`}>×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel">
          <div className="lab-panel-titulo">Nudos ({arm.nudos.length}) y reacciones</div>
          <div className="tabla-scroll" style={{ maxHeight: 300 }}>
            <table className="tabla-datos">
              <thead><tr><th>#</th><th>x (mm)</th><th>y (mm)</th><th>Apoyo</th><th>Rx (N)</th><th>Ry (N)</th></tr></thead>
              <tbody>
                {arm.nudos.map((n, i) => (
                  <tr key={i} className={seleccion?.tipo === 'nudo' && seleccion.i === i ? 'fila-seleccionada' : ''}>
                    <td>{i + 1}</td>
                    <td><input type="number" value={n.x} step={5} onChange={(e) => cambiar((a) => ({ ...a, nudos: a.nudos.map((m, k) => (k === i ? { ...m, x: Number(e.target.value) } : m)) }))} style={{ width: 80 }} /></td>
                    <td><input type="number" value={n.y} step={5} onChange={(e) => cambiar((a) => ({ ...a, nudos: a.nudos.map((m, k) => (k === i ? { ...m, y: Number(e.target.value) } : m)) }))} style={{ width: 80 }} /></td>
                    <td>
                      <select value={n.apoyo} onChange={(e) => cambiar((a) => ({ ...a, nudos: a.nudos.map((m, k) => (k === i ? { ...m, apoyo: e.target.value as ApoyoPlano } : m)) }))}>
                        {(Object.keys(NOMBRE_APOYO) as ApoyoPlano[]).map((k) => <option key={k} value={k}>{NOMBRE_APOYO[k]}</option>)}
                      </select>
                    </td>
                    <td>{R && n.apoyo !== 'ninguno' && n.apoyo !== 'rodilloH' ? fmt(R[3 * i], 2) : '—'}</td>
                    <td>{R && n.apoyo !== 'ninguno' && n.apoyo !== 'rodilloV' ? fmt(R[3 * i + 2], 2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lab-panel-titulo" style={{ marginTop: 12 }}>Cargas ({arm.cargas.length})</div>
          <div className="tabla-scroll" style={{ maxHeight: 220 }}>
            <table className="tabla-datos">
              <thead><tr><th>Nudo</th><th>Fx (N)</th><th>Fy (N)</th><th></th></tr></thead>
              <tbody>
                {arm.cargas.map((c, k) => (
                  <tr key={k}>
                    <td>
                      <select value={c.nudo} onChange={(e) => cambiar((a) => ({ ...a, cargas: a.cargas.map((x, q) => (q === k ? { ...x, nudo: Number(e.target.value) } : x)) }))}>
                        {arm.nudos.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
                      </select>
                    </td>
                    <td><input type="number" value={c.fx} step={1} onChange={(e) => cambiar((a) => ({ ...a, cargas: a.cargas.map((x, q) => (q === k ? { ...x, fx: Number(e.target.value) } : x)) }))} style={{ width: 80 }} /></td>
                    <td><input type="number" value={c.fy} step={1} onChange={(e) => cambiar((a) => ({ ...a, cargas: a.cargas.map((x, q) => (q === k ? { ...x, fy: Number(e.target.value) } : x)) }))} style={{ width: 80 }} /></td>
                    <td><button className="btn-mini" onClick={() => cambiar((a) => ({ ...a, cargas: a.cargas.filter((_, q) => q !== k) }))} aria-label="Borrar carga">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fila" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => cambiar((a) => ({ ...a, cargas: [...a.cargas, { nudo: 0, fx: 0, fy: -10 }] }))} disabled={!arm.nudos.length}>＋ Agregar carga</button>
            <button onClick={() => cambiar((a) => ({ ...a, nudos: [...a.nudos, { x: 0, y: 0, apoyo: 'ninguno' }] }))}>＋ Agregar nudo</button>
          </div>
        </section>

        <section className="lab-panel">
          <div className="lab-panel-titulo">Plantillas</div>
          <Segmentado<PlantillaPlana>
            etiqueta="Tipo de armadura"
            opciones={[{ valor: 'pratt', etiqueta: 'Pratt' }, { valor: 'howe', etiqueta: 'Howe' }, { valor: 'warren', etiqueta: 'Warren' }, { valor: 'warren-montantes', etiqueta: 'Warren con montantes' }, { valor: 'vacia', etiqueta: 'Vacía' }]}
            valor={plantilla}
            onChange={setPlantilla}
          />
          <div className="fila-controles">
            <Stepper etiqueta="Luz (mm)" valor={luz} onChange={setLuz} min={100} max={2000} paso={50} decimales={0} />
            <Stepper etiqueta="Altura (mm)" valor={altura} onChange={setAltura} min={20} max={600} paso={10} decimales={0} />
            <Stepper etiqueta="Paneles" valor={paneles} onChange={setPaneles} min={2} max={16} paso={2} decimales={0} />
          </div>
          <div className="fila" style={{ gap: 8, alignItems: 'end', flexWrap: 'wrap' }}>
            <Stepper etiqueta="Carga total en el tablero (N)" valor={cargaTotal} onChange={setCargaTotal} min={1} max={5000} paso={5} decimales={0} />
            <button className="btn-iniciar" onClick={aplicarPlantilla} disabled={ensayando}>Usar plantilla</button>
          </div>
          <p className="nota">
            Pratt: diagonales que bajan hacia el centro (trabajan en tracción). Howe: suben hacia el centro (en compresión: pandean antes).
            Warren: triángulos sin montantes. Compare cuál soporta más con el mismo material.
          </p>
          <hr className="separador" />
          <div className="lab-panel-titulo">Material</div>
          <Segmentado opciones={MATERIALES_MAQUETA.map((m) => ({ valor: m.id, etiqueta: m.nombreCorto }))} valor={materialId} onChange={cambiarMaterial} disabled={ensayando} />
          <Segmentado etiqueta="Sección por defecto de las barras" opciones={material.secciones.map((s) => ({ valor: s.id, etiqueta: s.etiqueta }))} valor={seccionDefecto} onChange={setSeccionDefecto} disabled={ensayando} />
          <Segmentado etiqueta="Pegamento" opciones={UNIONES_MAQUETA.map((x) => ({ valor: x.id, etiqueta: x.nombre }))} valor={unionId} onChange={setUnionId} disabled={ensayando} />
          <Segmentado<'si' | 'no'> etiqueta="Incluir el peso propio" opciones={[{ valor: 'no', etiqueta: 'No' }, { valor: 'si', etiqueta: 'Sí' }]} valor={pesoPropio ? 'si' : 'no'} onChange={(v) => setPesoPropio(v === 'si')} disabled={ensayando} />
          <div className="fila" style={{ marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
            <button onClick={guardar}>Guardar armadura</button>
            <button onClick={() => archivoRef.current?.click()}>Abrir armadura</button>
            <input ref={archivoRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => { const x = e.target.files?.[0]; if (x) void abrir(x); e.target.value = ''; }} />
            <button onClick={() => exportarSvgComoPng(ID_VISTA, 'armadura.png')}>Imagen</button>
          </div>
        </section>
      </div>

      <div className="lab-grid">
        <section className="lab-panel" style={{ gridColumn: '1 / -1' }}>
          <div className="fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div className="lab-panel-titulo" style={{ margin: 0 }}>Matriz de rigidez K (N/mm) — sistema K·u = F</div>
            <button className={mostrarMatriz ? 'activo' : ''} onClick={() => setMostrarMatriz((v) => !v)} style={{ flex: 'none' }}>{mostrarMatriz ? 'Ocultar' : 'Mostrar'}</button>
          </div>
          {mostrarMatriz &&
            (!sis ? (
              <p className="nota">Dibuje una armadura para ver su matriz.</p>
            ) : sis.n > MAX_GDL_MATRIZ ? (
              <p className="nota">La armadura tiene {sis.n} grados de libertad libres: la matriz ({sis.n} × {sis.n}) es demasiado grande para mostrarla. Pruebe con una armadura de pocos nudos.</p>
            ) : (
              <>
                <div className="tabla-scroll" style={{ maxHeight: 420, marginTop: 8 }}>
                  <table className="tabla-datos tabla-matriz">
                    <thead>
                      <tr><th></th>{etiquetas.map((e) => <th key={e}>{e}</th>)}<th>F (N)</th><th>u (mm)</th></tr>
                    </thead>
                    <tbody>
                      {etiquetas.map((fila, r) => {
                        const g = Array.from(sis.mapa).indexOf(r);
                        return (
                          <tr key={fila}>
                            <th>{fila}</th>
                            {etiquetas.map((_, c) => {
                              const v = sis.K[r * sis.n + c] - (r === c ? sis.kReg : 0);
                              return <td key={c} style={{ color: Math.abs(v) < 1e-9 ? '#3b4f63' : undefined }}>{Math.abs(v) < 1e-9 ? '0' : v.toPrecision(3)}</td>;
                            })}
                            <td>{fmt(f[g] + fPeso[g], 2)}</td>
                            <td>{estatico ? estatico.u[g].toPrecision(3) : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="nota">
                  Cada barra aporta (EA/L)·[c² cs; cs s²] a los nudos que une (c = cos θ, s = sen θ). Los apoyos eliminan las filas y
                  columnas de las direcciones impedidas. Resolviendo K·u = F se obtienen los desplazamientos u, y con ellos la fuerza de
                  cada barra: N = (EA/L)·[c s]·(u_fin − u_inicio).
                </p>
              </>
            ))}
        </section>
      </div>
    </div>
  );
}
