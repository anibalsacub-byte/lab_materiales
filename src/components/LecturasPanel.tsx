interface Lectura {
  etiqueta: string;
  valor: string;
  unidad?: string;
}

/** Tarjetas grandes y legibles para mostrar las lecturas instantáneas de un ensayo. */
export function LecturasPanel({ lecturas }: { lecturas: Lectura[] }) {
  return (
    <div className="lecturas-grid">
      {lecturas.map((l) => (
        <div className="lectura-card" key={l.etiqueta}>
          <div className="lectura-etiqueta">{l.etiqueta}</div>
          <div>
            <span className="lectura-valor">{l.valor}</span>
            {l.unidad && <span className="lectura-unidad">{l.unidad}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
