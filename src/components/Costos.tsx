import { useEffect, useMemo, useRef, useState } from 'react';
import { boletaEjemplo, leerBoletaConOCR } from '../lib/boletas';
import {
  archivarGasto, alertas, calculoMes, guardarBoleta, guardarGasto, guardarTrabajador, leerCostos,
  mesActual, mesesAtras, nombreMes, nuevoGasto, nuevoTrabajador, quitarTrabajador,
  restablecerCostos, useCostos, type Boleta, type Gasto, type Trabajador,
} from '../lib/costos';
import { guardarFoto, leerFoto } from '../lib/fotos';
import { reducirImagen } from '../lib/padron';
import { uid, useEmpresa } from '../lib/store';
import { Camera, Plus, Receipt, Trash, UsersThree, Warning } from './iconos';

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL');
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * Costos del taller, en Ajustes: quién trabaja y cuánto cuesta, qué gastos fijos y variables tiene,
 * y las boletas que llegan mes a mes. Todo junto alimenta el costo de la hora que usa la rentabilidad.
 */
export default function Costos() {
  const empresa = useEmpresa();
  const bd = useCostos(empresa.id);
  const periodo = mesActual();
  const calc = useMemo(() => calculoMes(bd, periodo), [bd, periodo]);
  const avisos = useMemo(() => alertas(bd), [bd]);
  const [boleta, setBoleta] = useState<{ gastoId: string; periodo: string } | null>(null);
  const [nuevo, setNuevo] = useState<Gasto | null>(null);

  const ultima = (gastoId: string) => bd.boletas
    .filter(b => b.gastoId === gastoId)
    .sort((a, b) => (a.periodo < b.periodo ? 1 : -1))[0];

  return (
    <>
      <section className="ajuste-tarjeta costos-hora">
        <h2>Costo de la hora de taller</h2>
        <p className="sub">Lo que cuesta tener el taller abierto una hora: sueldos con sus cargas y todos los gastos, repartidos entre las horas que de verdad producen.</p>
        {calc.horasProductivas > 0 ? (
          <>
            <p className="costo-hora-cifra">
              <b>{clp(calc.costoHora)}</b>
              <span>por hora · {nombreMes(periodo)} {calc.estimado ? '· con valores estimados' : '· con boletas reales'}</span>
            </p>
            <dl className="costo-hora-detalle">
              <div><dt>Mano de obra al mes</dt><dd>{clp(calc.manoObra)}</dd></div>
              <div><dt>Gastos del mes</dt><dd>{clp(calc.gastos)}</dd></div>
              <div><dt>Horas que producen</dt><dd>{Math.round(calc.horasProductivas)} h</dd></div>
            </dl>
          </>
        ) : (
          <p className="error" role="alert">Agrega al menos un trabajador activo para poder calcular el costo de la hora.</p>
        )}
        {calc.faltan.length > 0 && <p className="pista">Sin ninguna boleta, estos gastos cuentan como $0: {calc.faltan.join(', ')}.</p>}
      </section>

      <section className="ajuste-tarjeta costos-ancho">
        <h2><UsersThree size={22} /> Trabajadores</h2>
        <p className="sub">Cada uno con su sueldo bruto y sus horas. El recargo cubre cargas patronales y provisiones de vacaciones.</p>
        <div className="costos-lista">
          {bd.trabajadores.map(t => <FilaTrabajador key={t.id} t={t} onChange={x => guardarTrabajador(empresa.id, x)} onQuitar={() => quitarTrabajador(empresa.id, t.id)} />)}
          {!bd.trabajadores.length && <p className="pista">Todavía no hay trabajadores.</p>}
        </div>
        <button className="btn secundario" onClick={() => guardarTrabajador(empresa.id, nuevoTrabajador())}><Plus size={20} /> Agregar trabajador</button>
      </section>

      <section className="ajuste-tarjeta costos-ancho">
        <h2><Receipt size={22} /> Gastos del taller</h2>
        <p className="sub">Arriendo, luz, agua, teléfono, internet o lo que sea: cada gasto recibe sus boletas mes a mes.</p>
        <div className="costos-lista">
          {bd.gastos.map(g => {
            const u = ultima(g.id);
            return (
              <div className={`gasto-fila ${g.activo ? '' : 'apagado'}`} key={g.id}>
                <input className="gasto-nombre" value={g.nombre} aria-label="Nombre del gasto" onChange={e => guardarGasto(empresa.id, { ...g, nombre: e.target.value })} />
                <select aria-label={`Cada cuánto se paga ${g.nombre}`} value={g.periodicidad} onChange={e => guardarGasto(empresa.id, { ...g, periodicidad: e.target.value as Gasto['periodicidad'] })}>
                  <option value="mensual">Mensual</option>
                  <option value="semanal">Semanal</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="anual">Anual</option>
                </select>
                <small>{u ? `${nombreMes(u.periodo)}: ${clp(u.monto)}` : 'sin boletas'}</small>
                <button className="btn secundario chico" onClick={() => setBoleta({ gastoId: g.id, periodo })}>Boleta</button>
                <button className="icono" aria-label={g.activo ? `Archivar ${g.nombre}` : `Reactivar ${g.nombre}`} onClick={() => archivarGasto(empresa.id, g.id)}>{g.activo ? <Trash size={20} /> : <Plus size={20} />}</button>
              </div>
            );
          })}
        </div>
        {nuevo ? (
          <form className="gasto-nuevo" onSubmit={e => { e.preventDefault(); if (nuevo.nombre.trim()) { guardarGasto(empresa.id, nuevo); setNuevo(null); } }}>
            <label className="campo"><span>Nombre del gasto</span>
              <input value={nuevo.nombre} autoFocus placeholder="Ej. Uber semanal" onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} />
            </label>
            <label className="campo"><span>Cada cuánto</span>
              <select value={nuevo.periodicidad} onChange={e => setNuevo({ ...nuevo, periodicidad: e.target.value as Gasto['periodicidad'] })}>
                <option value="mensual">Mensual</option><option value="semanal">Semanal</option>
                <option value="trimestral">Trimestral</option><option value="anual">Anual</option>
              </select>
            </label>
            <button className="btn primario" disabled={!nuevo.nombre.trim()}>Agregar</button>
            <button type="button" className="enlace" onClick={() => setNuevo(null)}>Cancelar</button>
          </form>
        ) : (
          <button className="btn secundario" onClick={() => setNuevo(nuevoGasto())}><Plus size={20} /> Agregar gasto</button>
        )}
      </section>

      {avisos.length > 0 && (
        <section className="ajuste-tarjeta">
          <h2><Warning size={22} /> Avisos</h2>
          <ul className="costos-avisos">
            {avisos.map((a, i) => <li key={i} className={a.nivel}>{a.texto}</li>)}
          </ul>
        </section>
      )}

      <section className="ajuste-tarjeta">
        <h2>Datos de costos</h2>
        <p className="sub">Vuelve a los trabajadores, gastos y boletas de ejemplo.</p>
        <button className="btn secundario" onClick={() => { if (confirm('Se borrarán los costos cargados de esta empresa. ¿Continuar?')) restablecerCostos(empresa.id); }}>Restablecer costos</button>
      </section>

      {boleta && <HojaBoleta empresaId={empresa.id} gastoId={boleta.gastoId} periodo={boleta.periodo} onCerrar={() => setBoleta(null)} />}
    </>
  );
}

function FilaTrabajador({ t, onChange, onQuitar }: { t: Trabajador; onChange: (t: Trabajador) => void; onQuitar: () => void }) {
  const num = (v: string) => Number(v.replace(/[^\d]/g, '')) || 0;
  return (
    <div className="trabajador-fila">
      <label className="campo"><span>Nombre</span>
        <input value={t.nombre} placeholder="Ej. Juan Pérez" onChange={e => onChange({ ...t, nombre: e.target.value })} />
      </label>
      <label className="campo"><span>Sueldo bruto</span>
        <input inputMode="numeric" value={t.sueldoBruto.toLocaleString('es-CL')} onChange={e => onChange({ ...t, sueldoBruto: num(e.target.value) })} />
      </label>
      <label className="campo"><span>Horas por semana</span>
        <input inputMode="numeric" value={t.horasSemana} onChange={e => onChange({ ...t, horasSemana: num(e.target.value) })} />
      </label>
      <label className="campo"><span>Recargo (%)</span>
        <input inputMode="numeric" value={t.cargasPct} onChange={e => onChange({ ...t, cargasPct: num(e.target.value) })} />
      </label>
      <label className="campo"><span>Horas que producen (%)</span>
        <input inputMode="numeric" value={t.ocupacionPct} onChange={e => onChange({ ...t, ocupacionPct: num(e.target.value) })} />
      </label>
      <button className="icono" aria-label={`Quitar a ${t.nombre || 'trabajador'}`} onClick={onQuitar}><Trash size={20} /></button>
    </div>
  );
}

/**
 * Hoja para cargar una boleta. El mes que se elige es el que **cubre** la boleta, no el día en que
 * llegó: la luz de noviembre se paga en diciembre pero es costo de noviembre.
 */
function HojaBoleta({ empresaId, gastoId, periodo, onCerrar }: { empresaId: string; gastoId: string; periodo: string; onCerrar: () => void }) {
  const bd = leerCostos(empresaId);
  const gastos = bd.gastos;
  const [g, setG] = useState(gastoId);
  const [mes, setMes] = useState(periodo);
  const [monto, setMonto] = useState('');
  const [pagadaEl, setPagadaEl] = useState(hoyISO());
  const [folio, setFolio] = useState('');
  const [foto, setFoto] = useState<string | undefined>();
  const [avance, setAvance] = useState<number | null>(null);
  const [nota, setNota] = useState('');
  const [guardada, setGuardada] = useState<Boleta | null>(null);
  const fotoInput = useRef<HTMLInputElement>(null);
  const meses = useMemo(() => mesesAtras(periodo, 18).reverse(), [periodo]);
  const existente = bd.boletas.find(b => b.gastoId === g && b.periodo === mes);
  const nombre = gastos.find(x => x.id === g)?.nombre ?? 'Gasto';

  const leer = async (imagen: string) => {
    setAvance(0);
    try {
      const r = await leerBoletaConOCR(imagen, p => setAvance(p));
      if (r.monto) setMonto(String(r.monto));
      if (r.periodo && meses.includes(r.periodo)) setMes(r.periodo);
      setNota(r.monto ? 'Monto leído de la foto. Revísalo antes de guardar.' : 'No se pudo leer el monto. Escríbelo a mano.');
    } catch {
      setNota('No se pudo leer la foto. Escribe el monto a mano.');
    } finally {
      setAvance(null);
    }
  };

  const conFoto = async (imagen: string) => {
    const id = uid();
    setFoto(id);
    await guardarFoto(id, imagen).catch(() => setFoto(undefined));
    void leer(imagen);
  };

  const guardar = async () => {
    const n = Number(monto.replace(/[^\d]/g, ''));
    if (!n) return;
    const b = guardarBoleta(empresaId, { gastoId: g, periodo: mes, monto: n, pagadaEl, folio: folio || undefined, nota: nota || undefined, foto });
    setGuardada(b);
  };

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <section className="hoja" role="dialog" aria-modal="true" aria-label="Cargar boleta" onClick={e => e.stopPropagation()}>
        <div className="hoja-tit">
          <h2>Cargar boleta</h2>
          <button className="icono" aria-label="Cerrar" onClick={onCerrar}>×</button>
        </div>

        {guardada ? (
          <>
            <p className="aviso-ok" role="status">Boleta guardada: {nombre}, {nombreMes(guardada.periodo)}, {clp(guardada.monto)}.</p>
            <p className="pista">El costo de la hora se recalculó con este valor.</p>
            <div className="patente-acciones">
              <button className="btn secundario" onClick={() => { setGuardada(null); setMonto(''); setFoto(undefined); setNota(''); }}>Cargar otra</button>
              <button className="btn primario" onClick={onCerrar}>Listo</button>
            </div>
          </>
        ) : (
          <>
            <div className="campos">
              <label className="campo"><span>Gasto</span>
                <select value={g} onChange={e => setG(e.target.value)}>
                  {gastos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                </select>
              </label>
              <label className="campo"><span>Mes que cubre</span>
                <select value={mes} onChange={e => setMes(e.target.value)}>
                  {meses.map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
                </select>
              </label>
              <label className="campo"><span>Monto de la boleta</span>
                <input inputMode="numeric" value={monto} placeholder="$ 61.400" onChange={e => setMonto(e.target.value)} />
              </label>
              <label className="campo"><span>Fecha de pago (opcional)</span>
                <input type="date" value={pagadaEl} onChange={e => setPagadaEl(e.target.value)} />
              </label>
              <label className="campo"><span>N.º de boleta (opcional)</span>
                <input value={folio} onChange={e => setFolio(e.target.value)} />
              </label>
            </div>

            <div className="boleta-foto">
              <button className="btn secundario" onClick={() => fotoInput.current?.click()}><Camera size={20} /> Foto de la boleta</button>
              <button className="enlace" onClick={async () => { await conFoto(boletaEjemplo(nombreMes(mes), monto.replace(/[^\d]/g, '') || '61400')); }}>Probar con una boleta de ejemplo</button>
              <input ref={fotoInput} type="file" accept="image/*" capture="environment" hidden aria-label="Foto de la boleta"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) await conFoto(await reducirImagen(f, 1600));
                }} />
              {foto && <FotoBoleta id={foto} />}
              {avance !== null && <p className="pista" role="status">Leyendo la boleta… {Math.round(avance * 100)} %</p>}
              {nota && avance === null && <p className="aviso-ok" role="status">{nota}</p>}
            </div>

            {existente && <p className="aviso-atencion" role="alert">Ya hay {clp(existente.monto)} cargados de {nombreMes(mes)} en {nombre}. Al guardar se reemplazan, no se suman.</p>}
            <div className="patente-acciones">
              <button className="btn primario grande" disabled={!Number(monto.replace(/[^\d]/g, ''))} onClick={guardar}>Guardar boleta</button>
              <button className="enlace" onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FotoBoleta({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { void leerFoto(id).then(d => setSrc(d ?? null)).catch(() => setSrc(null)); }, [id]);
  return src ? <img className="boleta-mini" src={src} alt="Foto de la boleta" /> : null;
}
