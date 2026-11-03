import { useState } from 'react';
import { TractionBench } from './benches/traction/TractionBench';
import { CompressionBench } from './benches/compression/CompressionBench';
import { BendingBench } from './benches/bending/BendingBench';
import { TorsionBench } from './benches/torsion/TorsionBench';
import { BucklingBench } from './benches/buckling/BucklingBench';
import { ImpactBench } from './benches/impact/ImpactBench';
import { SectionsStation } from './stations/sections/SectionsStation';
import { MohrStation } from './stations/mohr/MohrStation';

type Vista =
  | 'catalogo'
  | 'banco-traccion'
  | 'banco-compresion'
  | 'banco-flexion'
  | 'banco-cortante'
  | 'banco-torsion'
  | 'banco-pandeo'
  | 'banco-uniones'
  | 'banco-presion'
  | 'banco-impacto'
  | 'estacion-secciones'
  | 'estacion-mohr';

interface ItemCatalogo {
  vista: Vista;
  nombre: string;
  descripcion: string;
  disponible: boolean;
}

const BANCOS: ItemCatalogo[] = [
  { vista: 'banco-traccion', nombre: 'Banco 1 — Tracción', descripcion: 'Máquina universal: curva σ–ε hasta la fractura, E, ν, fluencia, Rp0,2, σu y alargamiento.', disponible: true },
  { vista: 'banco-compresion', nombre: 'Banco 2 — Compresión', descripcion: 'Platos de compresión: aplastamiento de dúctiles, rotura por cortante de frágiles, E y ν.', disponible: true },
  { vista: 'banco-flexion', nombre: 'Banco 3 — Flexión', descripcion: 'Flexión en 3 y 4 puntos: curva carga–flecha con plasticidad, diagramas V(x) y M(x), E por flexión.', disponible: true },
  { vista: 'banco-cortante', nombre: 'Banco 4 — Cortante', descripcion: 'Cortante simple y doble. Próxima etapa.', disponible: false },
  { vista: 'banco-torsion', nombre: 'Banco 5 — Torsión', descripcion: 'Máquina de torsión: curva par–giro hasta la rotura, G, τ y plano de rotura dúctil o frágil.', disponible: true },
  { vista: 'banco-pandeo', nombre: 'Banco 6 — Pandeo de columnas', descripcion: 'Columna en la máquina universal: imperfección, carga crítica de Euler, esbeltez y colapso.', disponible: true },
  { vista: 'banco-uniones', nombre: 'Banco 7 — Uniones mecánicas', descripcion: 'Pernos, pasadores y placas. Próxima etapa.', disponible: false },
  { vista: 'banco-presion', nombre: 'Banco 8 — Recipientes a presión', descripcion: 'Pared delgada, esfuerzos circunferencial y longitudinal. Próxima etapa.', disponible: false },
  { vista: 'banco-impacto', nombre: 'Banco 9 — Impacto Charpy', descripcion: 'Péndulo de 300 J: probetas acondicionadas en baño, curva de transición dúctil–frágil, T27J y superficie de fractura.', disponible: true },
];

const ESTACIONES: ItemCatalogo[] = [
  { vista: 'estacion-secciones', nombre: 'Estación A — Propiedades geométricas', descripcion: 'Área, centroide, momentos de inercia y ejes principales.', disponible: true },
  { vista: 'estacion-mohr', nombre: 'Estación B — Círculo de Mohr', descripcion: 'Transformación de esfuerzos y esfuerzos principales.', disponible: true },
];

function Tarjeta({ item, onSeleccionar }: { item: ItemCatalogo; onSeleccionar: (v: Vista) => void }) {
  return (
    <div
      className={`tarjeta ${item.disponible ? '' : 'deshabilitada'}`}
      onClick={() => item.disponible && onSeleccionar(item.vista)}
    >
      <div className="etiqueta">{item.disponible ? 'Disponible' : 'Próximamente'}</div>
      <h3>{item.nombre}</h3>
      <p className="desc">{item.descripcion}</p>
    </div>
  );
}

export default function App() {
  const [vista, setVista] = useState<Vista>('catalogo');
  const volver = () => setVista('catalogo');

  if (vista === 'banco-traccion') return <div className="app-shell"><TractionBench onVolver={volver} /></div>;
  if (vista === 'banco-compresion') return <div className="app-shell"><CompressionBench onVolver={volver} /></div>;
  if (vista === 'banco-flexion') return <div className="app-shell"><BendingBench onVolver={volver} /></div>;
  if (vista === 'banco-torsion') return <div className="app-shell"><TorsionBench onVolver={volver} /></div>;
  if (vista === 'banco-impacto') return <div className="app-shell"><ImpactBench onVolver={volver} /></div>;
  if (vista === 'banco-pandeo') return <div className="app-shell"><BucklingBench onVolver={volver} /></div>;
  if (vista === 'estacion-secciones') return <div className="app-shell"><SectionsStation onVolver={volver} /></div>;
  if (vista === 'estacion-mohr') return <div className="app-shell"><MohrStation onVolver={volver} /></div>;

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="titulo">Laboratorio Virtual de Resistencia de Materiales</div>
          <div className="subtitulo">Simulador interactivo de ensayos mecánicos para Ingeniería</div>
        </div>
      </div>

      <div className="catalogo-grupo">
        <h2>Bancos de ensayo</h2>
        <div className="catalogo-grid">
          {BANCOS.map((b) => <Tarjeta key={b.vista} item={b} onSeleccionar={setVista} />)}
        </div>
      </div>

      <div className="catalogo-grupo">
        <h2>Estaciones de análisis</h2>
        <div className="catalogo-grid">
          {ESTACIONES.map((e) => <Tarjeta key={e.vista} item={e} onSeleccionar={setVista} />)}
        </div>
      </div>

      <p className="nota">
        Todas las lecturas mostradas son mediciones virtuales generadas por simulación, no datos de un equipo físico.
      </p>

      <div className="pie-pagina">
        Creado por <strong>Ricardo Aníbal Sánchez Cuba</strong> — Ingeniero Industrial, docente universitario.
      </div>
    </div>
  );
}
