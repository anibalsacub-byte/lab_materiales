import { describe, it, expect } from 'vitest';
import { obtenerMaterial, moduloCorte } from '../materials';
import { deformacionRoturaCompresion, esfuerzoCompresion, esfuerzoEnDeformacion, esfuerzoSinEstriccion, parametrosCurvaBilineal } from '../mechanics/axial';
import { cargaEnFlecha, curvaCargaFlecha, inerciaSeccionFlexion, momentoDesdeCurvatura } from '../mechanics/bending';
import { deformacionAngularRotura, momentoPolarInerciaCircular, parTorsor } from '../mechanics/torsion';
import { cargaCriticaEuler, deflexionConImperfeccion, estadoColumna, hitoColumna, type ColumnaEnsayo } from '../mechanics/buckling';

const a36 = obtenerMaterial('astm-a36')!;
const fundicion = obtenerMaterial('fundicion-gris-clase30')!;

describe('Compresión', () => {
  it('en pequeñas deformaciones coincide con la curva de tracción (pendiente E)', () => {
    expect(esfuerzoCompresion(a36, 0.0005)! / 0.0005).toBeCloseTo(200000, -3);
    expect(esfuerzoCompresion(a36, 0.0005)).toBeCloseTo(esfuerzoEnDeformacion(a36, 0.0005)!, 0);
  });

  it('un metal dúctil no rompe: la carga sigue subiendo hasta el 50 % de acortamiento', () => {
    expect(deformacionRoturaCompresion(a36)).toBeUndefined();
    let anterior = 0;
    for (let i = 1; i <= 100; i++) {
      const s = esfuerzoCompresion(a36, (0.5 * i) / 100)!;
      expect(s).toBeGreaterThanOrEqual(anterior - 1e-9);
      anterior = s;
    }
    expect(anterior).toBeGreaterThan(a36.propiedades.sigmaU_MPa!); // la sección crece al aplastarse
  });

  it('la fundición gris rompe en compresión a su σUc (≈ 3,6 veces la de tracción)', () => {
    const epsR = deformacionRoturaCompresion(fundicion)!;
    expect(esfuerzoCompresion(fundicion, epsR)).toBeCloseTo(752, 6);
    expect(esfuerzoCompresion(fundicion, epsR * 1.01)).toBeUndefined();
    expect(esfuerzoCompresion(fundicion, 1e-6)! / 1e-6).toBeCloseTo(100000, -3);
  });
});

describe('Flexión con plasticidad', () => {
  const rect = { tipo: 'rectangular' as const, b: 20, h: 10 };
  const I = inerciaSeccionFlexion(rect);

  it('M(κ) elástico = E·I·κ', () => {
    const kappa = 1e-5;
    expect(momentoDesdeCurvatura(a36, rect, kappa)).toBeCloseTo(200000 * I * kappa, -2);
  });

  it('la sección rectangular plastificada resiste ≈ 1,5 veces el momento de primera fluencia (factor de forma)', () => {
    const My = (250 * I) / 5;
    const kappaMeseta = 0.012 / 5; // fibra extrema dentro de la meseta: sin endurecimiento aún
    expect(momentoDesdeCurvatura(a36, rect, kappaMeseta)! / My).toBeGreaterThan(1.45);
    expect(momentoDesdeCurvatura(a36, rect, kappaMeseta)! / My).toBeLessThan(1.5);
  });

  it('3 puntos, régimen elástico: δ = PL³/(48EI)', () => {
    const L = 200;
    const curva = curvaCargaFlecha(a36, rect, L, 'tres-puntos');
    const delta = 0.05;
    expect(cargaEnFlecha(curva, delta)).toBeCloseTo((48 * 200000 * I * delta) / L ** 3, -1);
    expect(curva.rigidez).toBeCloseTo((48 * 200000 * I) / L ** 3, 6);
  });

  it('4 puntos, régimen elástico: δ = 23PL³/(1296EI)', () => {
    const L = 300;
    const curva = curvaCargaFlecha(a36, rect, L, 'cuatro-puntos');
    const delta = 0.05;
    expect(cargaEnFlecha(curva, delta) / ((1296 * 200000 * I * delta) / (23 * L ** 3))).toBeCloseTo(1, 2);
  });

  it('la curva carga–flecha es creciente y la frágil termina en la rotura de la fibra traccionada', () => {
    const curva = curvaCargaFlecha(fundicion, rect, 200, 'tres-puntos');
    for (let i = 1; i < curva.P.length; i++) expect(curva.delta[i]).toBeGreaterThanOrEqual(curva.delta[i - 1]);
    // Momento de rotura ≈ M(κ_rotura): σ de la fibra extrema llega a σU
    const sigmaFibra = esfuerzoEnDeformacion(fundicion, fundicion.propiedades.epsilonF! * 0.999)!;
    expect(sigmaFibra).toBeCloseTo(210, 0);
    expect(curva.PFluencia).toBeUndefined();
  });
});

describe('Torsión con plasticidad', () => {
  const G = moduloCorte(a36)!;

  it('régimen elástico: T = G·J·θ/L', () => {
    const J = momentoPolarInerciaCircular(10);
    const theta = 0.001;
    expect(parTorsor(a36, G, 10, 0, 100, theta)).toBeCloseTo((G * J * theta) / 100, -1);
  });

  it('eje macizo plastificado: el par tiende a 4/3 del de primera fluencia', () => {
    const d = 10;
    const J = momentoPolarInerciaCircular(d);
    const tauY = 250 / Math.sqrt(3);
    const Ty = (tauY * J) / (d / 2);
    // Superficie dentro de la meseta (aún sin endurecimiento) con γ ≈ 6·γY
    const gammaY = tauY / G;
    const theta = (6 * gammaY * 100) / (d / 2);
    const T = parTorsor(a36, G, d, 0, 100, theta)!;
    expect(T / Ty).toBeGreaterThan(1.3);
    expect(T / Ty).toBeLessThan(4 / 3 + 1e-6);
  });

  it('la fundición gris rompe cuando τ alcanza σU (rotura frágil a 45°)', () => {
    const Gf = moduloCorte(fundicion)!;
    const gammaR = deformacionAngularRotura(fundicion, Gf)!;
    expect(esfuerzoSinEstriccion(fundicion, (gammaR * Gf) / 100000)).toBeCloseTo(210, 0);
  });
});

describe('Pandeo con control por desplazamiento', () => {
  const d = 12;
  const I = (Math.PI * d ** 4) / 64;
  const base: ColumnaEnsayo = { E: 200000, A: (Math.PI * d ** 2) / 4, I, L: 800, K: 1, delta0: 0.5, c: d / 2, sigmaLimite: 250, ductil: true };
  const Pcr = cargaCriticaEuler(200000, I, 800, 1);

  it('antes de fluir sigue la amplificación δ = δ₀/(1 − P/Pcr)', () => {
    const { P, delta } = estadoColumna(base, 0.3);
    expect(P).toBeLessThan(Pcr);
    expect(delta).toBeCloseTo(deflexionConImperfeccion(P, Pcr, 0.5), 6);
  });

  it('columna perfecta: recta hasta Pcr y luego se flexiona a carga constante', () => {
    const perfecta = { ...base, delta0: 0, sigmaLimite: undefined };
    const uCr = (Pcr * 800) / (200000 * perfecta.A);
    expect(estadoColumna(perfecta, uCr * 0.5).delta).toBe(0);
    const despues = estadoColumna(perfecta, uCr + 0.5);
    expect(despues.P).toBeCloseTo(Pcr, 6);
    expect(despues.delta).toBeGreaterThan(0);
  });

  it('tras la primera fluencia la carga cae (rótula plástica)', () => {
    const hito = hitoColumna(base)!;
    expect(hito.P).toBeLessThan(Pcr);
    const despues = estadoColumna(base, hito.u + 2);
    expect(despues.P).toBeLessThan(hito.P);
    expect(despues.delta).toBeGreaterThan(hito.delta);
  });

  it('la curva teórica sin imperfección queda acotada por Pcr', () => {
    const p = parametrosCurvaBilineal(a36)!;
    expect(p.sigmaY).toBe(250);
    const perfecta = { ...base, delta0: 0 };
    for (const u of [0.1, 0.5, 1, 3]) expect(estadoColumna(perfecta, u).P).toBeLessThanOrEqual(Pcr + 1e-6);
  });
});
