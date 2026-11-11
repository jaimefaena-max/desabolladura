import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowsClockwise, Camera, Car, CheckCircle, MagnifyingGlass, PencilSimple, Sparkle } from '../components/iconos';
import PiezaPicker from '../components/PiezaPicker';
import { ir, Pantalla } from '../components/ui';
import { VISTAS } from '../lib/fichaModelo';
import { claveGemini, fichaModeloGemini, generarVistasGemini, leerPadronGemini } from '../lib/gemini';
import { leerConOCR, leerPatenteConOCR, padronEjemplo, reducirImagen, type DatosPadron } from '../lib/padron';
import { carroceriaDeTipo, consultarPatente } from '../lib/patentes';
import { PATENTE_EJEMPLO } from '../lib/patentesDemo';
import { conEvento, sincronizar } from '../lib/automatizacion';
import { fechaLocal } from '../lib/piezas';
import { sugerir } from '../lib/precios';
import { ASEGURADORAS, tareasGenerales } from '../lib/seed';
import { codigoCliente, guardarOrden, sesion, siguienteNumero, uid, ultimaOrdenDePatente } from '../lib/store';
import type { Carroceria, Item, Orden, Pagador, Recepcion, Vehiculo } from '../lib/types';
import { guardarVistas, vistasDe, type Vistas } from '../lib/vistas';
import { CARROCERIAS, carroceriaDe, CATALOGO, COLORES, colorHex, normalizarPatente, patenteValida, verPatente } from '../lib/vehiculos';

const PASOS = ['Padrón', 'Vehículo', 'Cliente', 'Trabajos'];

interface EstadoIA { clave: string; fase: 'buscando' | 'creando' | 'listo' | 'error'; vistas: Vistas; error?: string; }
/** Lo que define las fotos: si cambia, hay que crearlas de nuevo. */
const claveIA = (x: Vehiculo) => [x.marca, x.modelo, x.anio, x.color].join('|').toLowerCase();

export default function NuevoVehiculo() {
  const u = sesion()!;
  const [paso, setPaso] = useState(0);
  const [v, setV] = useState<Vehiculo>({ marca: '', modelo: '', anio: new Date().getFullYear(), patente: '', color: 'Plateado', colorHex: COLORES[1].hex, carroceria: 'sedan' });
  const [cliente, setCliente] = useState({ nombre: '', rut: '', telefono: '' });
  const [pagador, setPagador] = useState<Pagador>({ tipo: 'aseguradora', aseguradora: ASEGURADORAS[0], siniestro: '', deducible: 0 });
  const [items, setItems] = useState<Item[]>(tareasGenerales());
  const [recepcion, setRecepcion] = useState<Recepcion>({ km: null, combustible: 'Medio', observaciones: '' });
  const [leido, setLeido] = useState<string | null>(null);
  const [listo, setListo] = useState<Orden | null>(null);
  const [ia, setIa] = useState<EstadoIA | null>(null);
  const [guardando, setGuardando] = useState(false);

  /**
   * Busca el modelo exacto en internet y crea sus tres fotos. Parte sola al confirmar el vehículo,
   * mientras el maestro llena los datos del cliente. Cada resultado se descarta si el vehículo
   * cambió entre medio (la clave ya no coincide).
   */
  const crearConIA = async (x: Vehiculo, otraVersion = false) => {
    const clave = claveIA(x);
    if (!claveGemini() || (!otraVersion && ia?.clave === clave && ia.fase !== 'error')) return;
    setIa({ clave, fase: x.ficha ? 'creando' : 'buscando', vistas: {} });
    const seguir = (f: (e: EstadoIA) => EstadoIA) => setIa(e => (e && e.clave === clave ? f(e) : e));
    let ficha = x.ficha;
    if (!ficha) {
      try {
        const r = await fichaModeloGemini(x);
        ficha = r.ficha;
        // El tipo que dice internet solo se usa si el catálogo no conoce el modelo.
        const tipo = carroceriaDe(x.marca, x.modelo) ? undefined : r.carroceria;
        const f = ficha;
        setV(y => (claveIA(y) === clave ? { ...y, ficha: f, carroceria: tipo ?? y.carroceria } : y));
      } catch {
        ficha = { generacion: `${x.modelo} ${x.anio}`, rasgos: 'Respeta fielmente el diseño real de ese modelo y año.' };
      }
      seguir(e => ({ ...e, fase: 'creando' }));
    }
    try {
      await generarVistasGemini(x, ficha, (vista, src) => seguir(e => ({ ...e, vistas: { ...e.vistas, [vista]: src } })));
      seguir(e => ({ ...e, fase: 'listo' }));
    } catch (err) {
      seguir(e => ({ ...e, fase: 'error', error: (err as Error).message }));
    }
  };

  const aplicar = (d: DatosPadron & { tipo?: string }, aviso?: string) => {
    const marca = Object.keys(CATALOGO).find(k => k.toLowerCase() === (d.marca ?? '').toLowerCase()) ?? d.marca ?? '';
    const modelo = d.modelo ?? '', col = d.color ? colorHex(d.color) : COLORES[1];
    setV(x => ({
      ...x, marca, modelo, anio: d.anio ?? x.anio, patente: d.patente ?? '', motor: d.motor, chasis: d.chasis,
      color: col.nombre, colorHex: col.hex,
      // El catálogo propio manda; si no conoce el modelo, se usa el tipo que informa el registro.
      carroceria: carroceriaDe(marca, modelo) ?? carroceriaDeTipo(d.tipo) ?? x.carroceria,
    }));
    setCliente(c => ({ ...c, nombre: d.nombre ?? c.nombre, rut: d.rut ?? c.rut }));
    const n = [d.patente, d.marca, d.modelo, d.anio, d.color, d.chasis, d.nombre, d.rut].filter(Boolean).length;
    setLeido(aviso ?? `Se leyeron ${n} datos del padrón. Revísalos antes de seguir.`);
    setPaso(1);
  };

  // Vehículo que ya vino antes: sus datos se cargan solos con la patente.
  const buscarConocido = (patente: string) => {
    const previa = patenteValida(patente) ? ultimaOrdenDePatente(normalizarPatente(patente)) : undefined;
    if (!previa) return;
    setV(x => ({ ...previa.vehiculo, patente: x.patente }));
    setCliente(previa.cliente);
    // Sus fotos ya existen: no se gasta en crearlas de nuevo.
    const vistas = vistasDe(previa);
    if (vistas) setIa({ clave: claveIA(previa.vehiculo), fase: 'listo', vistas });
    setLeido('Este vehículo ya vino al taller. Se cargaron sus datos.');
  };

  const cambiarVehiculo = (c: Partial<Vehiculo>) => setV(x => {
    const n = { ...x, ...c };
    if (c.marca !== undefined || c.modelo !== undefined) n.carroceria = carroceriaDe(n.marca, n.modelo) ?? n.carroceria;
    // Otro modelo u otro año: lo averiguado ya no aplica.
    if (c.marca !== undefined || c.modelo !== undefined || c.anio !== undefined) delete n.ficha;
    return n;
  });

  const vehiculoOk = v.marca.trim() && v.modelo.trim() && patenteValida(v.patente) && v.anio >= 1980 && v.anio <= new Date().getFullYear() + 1;
  const clienteOk = cliente.nombre.trim().length > 2 && (pagador.tipo === 'particular' || (pagador.aseguradora && pagador.siniestro?.trim()));
  const hayTrabajos = items.some(i => i.trabajo !== 'general');

  const finalizar = async () => {
    if (guardando) return;
    setGuardando(true);
      try {
      const id = uid();
      const fotosIA = ia && ia.clave === claveIA(v) && Object.keys(ia.vistas).length ? ia.vistas : undefined;
      // Si IndexedDB falla, la orden se guarda igual, sin fotos: el 3D las reemplaza.
      const vistas = fotosIA && await guardarVistas(id, fotosIA).catch(() => undefined);
      const o: Orden = conEvento(sincronizar({
        id, numero: siguienteNumero(), codigo: codigoCliente(), creada: fechaLocal(), entrega: '', maestroId: u.id,
        vehiculo: { ...v, patente: normalizarPatente(v.patente) }, cliente, pagador,
        // El maestro pudo corregir el vehículo después de agregar trabajos: el rango se recalcula con el dato final.
        items: items.map(i => (i.trabajo === 'general' ? i : { ...i, sugerido: sugerir(i.trabajo, i.pieza, i.severidad ?? 'medio', v) })),
        notas: '', cobrada: false, vistas, aprobacion: 'pendiente', repuestos: [], fotos: [], historial: [], recepcion, entregadaEl: null,
      }), 'Vehículo ingresado al taller');
      guardarOrden(o);
    setListo(o);
    } finally {
      // Si algo falla al armar la orden, el botón vuelve a quedar disponible.
      setGuardando(false);
    }
  };

  if (listo) {
    return (
      <Pantalla titulo="Vehículo ingresado" sub={`Orden ${listo.numero}: ${listo.vehiculo.marca} ${listo.vehiculo.modelo}`}>
        <div className="exito">
          <CheckCircle size={72} weight="light" />
          <p>Código de seguimiento de este vehículo:</p>
          <p className="codigo">{listo.codigo}</p>
          <p className="sub">Patente {verPatente(listo.vehiculo.patente)}</p>
          <p className="pista">Demo: este código solo funciona en este mismo navegador. No lo entregues a un cliente real.</p>
          <button className="btn primario grande" onClick={() => ir(`/maestro/ot/${listo.id}`)}>Ver tareas</button>
        </div>
      </Pantalla>
    );
  }

  return (
    <Pantalla volver="/maestro" titulo="Ingresar vehículo">
      <ol className="pasos">
        {PASOS.map((p, i) => <li key={p} className={i === paso ? 'on' : i < paso ? 'hecho' : ''}><span>{i + 1}</span>{p}</li>)}
      </ol>

      {paso === 0 && <PasoIngreso onDatos={aplicar} onManual={() => setPaso(1)} />}

      {paso === 1 && (
        <section className="formulario">
          {leido && <p className="aviso-ok" role="status">{leido}</p>}
          <div className="campos">
            <label className="campo"><span>Marca</span>
              <input list="marcas" value={v.marca} onChange={e => cambiarVehiculo({ marca: e.target.value })} autoComplete="off" />
              <datalist id="marcas">{Object.keys(CATALOGO).map(m => <option key={m} value={m} />)}</datalist>
            </label>
            <label className="campo"><span>Modelo</span>
              <input list="modelos" value={v.modelo} onChange={e => cambiarVehiculo({ modelo: e.target.value })} autoComplete="off" />
              <datalist id="modelos">{Object.keys(CATALOGO[v.marca] ?? {}).map(m => <option key={m} value={m} />)}</datalist>
            </label>
            <label className="campo"><span>Año</span>
              <input type="number" inputMode="numeric" value={v.anio} onChange={e => cambiarVehiculo({ anio: Number(e.target.value) })} />
            </label>
            <label className="campo"><span>Patente</span>
              <input value={v.patente} onChange={e => { cambiarVehiculo({ patente: e.target.value.toUpperCase() }); buscarConocido(e.target.value); }} placeholder="ABCD-12" autoComplete="off" aria-invalid={!!v.patente && !patenteValida(v.patente)} />
              {v.patente && !patenteValida(v.patente) && <small className="error">Usa el formato ABCD-12 o AB-1234.</small>}
            </label>
            <label className="campo"><span>Número de motor</span><input value={v.motor ?? ''} onChange={e => cambiarVehiculo({ motor: e.target.value.toUpperCase() })} autoComplete="off" /></label>
            <label className="campo"><span>Número de chasis</span><input value={v.chasis ?? ''} onChange={e => cambiarVehiculo({ chasis: e.target.value.toUpperCase() })} autoComplete="off" /></label>
          </div>
          <p className="etiqueta">Color</p>
          <div className="colores">
            {COLORES.map(c => (
              <button key={c.nombre} aria-pressed={v.colorHex === c.hex} className={v.colorHex === c.hex ? 'on' : ''} onClick={() => cambiarVehiculo({ color: c.nombre, colorHex: c.hex })}>
                <i style={{ background: c.hex }} />{c.nombre}
              </button>
            ))}
          </div>
          <p className="etiqueta">Tipo de vehículo</p>
          <div className="segmentos">
            {CARROCERIAS.map(c => <button key={c.id} aria-pressed={v.carroceria === c.id} className={v.carroceria === c.id ? 'on' : ''} onClick={() => cambiarVehiculo({ carroceria: c.id as Carroceria })}>{c.nombre}</button>)}
          </div>
          <p className="etiqueta">Combustible al recibir</p>
          <div className="segmentos">
            {['Bajo', 'Medio', 'Lleno'].map(c => <button key={c} aria-pressed={recepcion.combustible === c} className={recepcion.combustible === c ? 'on' : ''} onClick={() => setRecepcion({ ...recepcion, combustible: c })}>{c}</button>)}
          </div>
          <div className="campos">
            <label className="campo"><span>Kilometraje</span><input type="number" inputMode="numeric" min={0} value={recepcion.km ?? ''} onChange={e => setRecepcion({ ...recepcion, km: e.target.value ? Number(e.target.value) : null })} /></label>
            <label className="campo"><span>Daños previos u objetos de valor</span><input value={recepcion.observaciones} onChange={e => setRecepcion({ ...recepcion, observaciones: e.target.value })} autoComplete="off" /></label>
          </div>
          <Navegar atras={() => setPaso(0)} siguiente={() => { setPaso(2); void crearConIA(v); }} ok={!!vehiculoOk} ayuda="Completa marca, modelo, año y patente." />
        </section>
      )}

      {paso === 2 && (
        <section className="formulario">
          {ia && ia.fase !== 'listo' && ia.fase !== 'error' && <p className="aviso-ia" role="status"><Sparkle size={20} /> La IA está preparando las fotos del {v.marca} {v.modelo} mientras completas estos datos.</p>}
          <p className="etiqueta">¿Quién paga la reparación?</p>
          <div className="segmentos">
            <button aria-pressed={pagador.tipo === 'aseguradora'} className={pagador.tipo === 'aseguradora' ? 'on' : ''} onClick={() => setPagador({ ...pagador, tipo: 'aseguradora' })}>Aseguradora</button>
            <button aria-pressed={pagador.tipo === 'particular'} className={pagador.tipo === 'particular' ? 'on' : ''} onClick={() => setPagador({ ...pagador, tipo: 'particular' })}>Particular</button>
          </div>
          {pagador.tipo === 'aseguradora' && (
            <div className="campos">
              <label className="campo"><span>Compañía</span>
                <select value={pagador.aseguradora} onChange={e => setPagador({ ...pagador, aseguradora: e.target.value })}>{ASEGURADORAS.map(a => <option key={a}>{a}</option>)}</select>
              </label>
              <label className="campo"><span>Número de siniestro</span><input value={pagador.siniestro ?? ''} onChange={e => setPagador({ ...pagador, siniestro: e.target.value })} autoComplete="off" /></label>
              <label className="campo"><span>Deducible en pesos</span><input type="number" inputMode="numeric" min={0} value={pagador.deducible ?? 0} onChange={e => setPagador({ ...pagador, deducible: Math.max(0, Number(e.target.value)) })} /></label>
            </div>
          )}
          <div className="campos">
            <label className="campo"><span>Nombre del dueño</span><input value={cliente.nombre} onChange={e => setCliente({ ...cliente, nombre: e.target.value })} autoComplete="off" /></label>
            <label className="campo"><span>RUT</span><input value={cliente.rut} onChange={e => setCliente({ ...cliente, rut: e.target.value })} autoComplete="off" /></label>
            <label className="campo"><span>Teléfono</span><input type="tel" value={cliente.telefono} onChange={e => setCliente({ ...cliente, telefono: e.target.value })} autoComplete="off" /></label>
          </div>
          <Navegar atras={() => setPaso(1)} siguiente={() => setPaso(3)} ok={!!clienteOk} ayuda="Falta el nombre del dueño o el número de siniestro." />
        </section>
      )}

      {paso === 3 && (
        <section>
          {ia ? <EstudioIA ia={ia} v={v} onOtra={() => crearConIA(v, true)} />
            : claveGemini() && <button className="btn secundario ancho crear-ia" onClick={() => crearConIA(v)}><Sparkle size={22} /> Crear fotos del modelo con IA</button>}
          <PiezaPicker vehiculo={v} items={items} onChange={setItems} />
          <Navegar atras={() => setPaso(2)} siguiente={finalizar} ok={hayTrabajos && !guardando} texto={guardando ? 'Guardando…' : 'Guardar vehículo'} ayuda="Agrega al menos un trabajo." />
        </section>
      )}
    </Pantalla>
  );
}

function Navegar({ atras, siguiente, ok, texto = 'Siguiente', ayuda }: { atras: () => void; siguiente: () => void; ok: boolean; texto?: string; ayuda: string }) {
  return (
    <div className="navegar">
      {!ok && <p className="pista">{ayuda}</p>}
      <div>
        <button className="btn secundario grande" onClick={atras}><ArrowLeft size={24} /> Atrás</button>
        <button className="btn primario grande" disabled={!ok} onClick={siguiente}>{texto} <ArrowRight size={24} weight="bold" /></button>
      </div>
    </div>
  );
}

type DatosIngreso = DatosPadron & { tipo?: string };

function PasoIngreso({ onDatos, onManual }: { onDatos: (d: DatosIngreso, aviso?: string) => void; onManual: () => void }) {
  const fotoPadron = useRef<HTMLInputElement>(null);
  const fotoPatente = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<{ avance: number; img: string; fuente: string } | null>(null);
  const [error, setError] = useState('');
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);
  // null = no se está pidiendo la patente; '' = pantalla abierta, todavía sin escribir.
  const [patente, setPatente] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [buscando, setBuscando] = useState(false);

  // Una foto real de padrón con Gemini conectado sale del equipo: se avisa antes de enviarla.
  const revisarPadron = (img: string) => { if (claveGemini()) setPorConfirmar(img); else void leerPadron(img); };

  const leerPadron = async (img: string) => {
    setPorConfirmar(null);
    setError('');
    const conGemini = !!claveGemini();
    setEstado({ avance: 0, img, fuente: conGemini ? 'Gemini está leyendo el padrón' : 'Leyendo el padrón' });
    try {
      const d = conGemini ? await leerPadronGemini(img) : await leerConOCR(img, p => setEstado(s => s && { ...s, avance: p }));
      onDatos(d);
    } catch (e) {
      setEstado(null);
      setError(`No se pudo leer el padrón (${(e as Error).message}). Prueba otra foto o escribe los datos.`);
    }
  };

  /** La foto de la patente se lee en el propio teléfono: la imagen no sale del equipo. */
  const leerPatente = async (img: string) => {
    setError(''); setNota(''); setPatente('');
    setEstado({ avance: 0, img, fuente: 'Leyendo la patente' });
    try {
      const p = await leerPatenteConOCR(img, x => setEstado(s => s && { ...s, avance: x }));
      setEstado(null);
      setPatente(p ?? '');
      if (p) setNota('Este es el número que se leyó de la foto. Corrígelo si no coincide.');
      else setError('No se pudo leer la patente de la foto. Escríbela abajo.');
    } catch (e) {
      setEstado(null); setPatente('');
      setError(`No se pudo leer la patente (${(e as Error).message}). Escríbela abajo.`);
    }
  };

  const buscar = async (p: string) => {
    setError('');
    setBuscando(true);
    try {
      const r = await consultarPatente(p);
      if (r.estado === 'ok') {
        const d = r.datos;
        const quien = [d.marca, d.modelo, d.anio].filter(Boolean).join(' ');
        const aviso = r.fuente === 'ejemplo'
          ? `Patente ${verPatente(d.patente)}: datos de ejemplo de la demo. En producción se consultan al registro.`
          : r.fuente === 'memoria'
            ? `Patente ${verPatente(d.patente)}: ya la habíamos consultado. Revisa que sea el mismo vehículo.`
            : `Patente ${verPatente(d.patente)}: ${quien}. Revísalos antes de seguir.`;
        onDatos({ patente: d.patente, marca: d.marca, modelo: d.modelo, anio: d.anio, motor: d.motor, chasis: d.chasis, color: d.color, tipo: d.tipo }, aviso);
        return;
      }
      setError(r.estado === 'no-encontrada'
        ? 'Esa patente no aparece en el registro. Revísala o escribe los datos a mano.'
        : `${r.motivo} Puedes escribir los datos a mano.`);
    } finally {
      setBuscando(false);
    }
  };

  if (porConfirmar) {
    return (
      <section className="confirmar" role="alertdialog" aria-label="Aviso antes de enviar la foto">
        <h2>Esta foto se enviará a Google</h2>
        <p>Gemini recibirá la imagen, que puede incluir nombre y RUT del dueño. En esta demo usa solo el padrón de ejemplo.</p>
        <div>
          <button className="btn primario grande" onClick={() => setPorConfirmar(null)}>Cancelar</button>
          <button className="btn secundario grande" onClick={() => leerPadron(porConfirmar)}>Enviar a Gemini</button>
        </div>
      </section>
    );
  }

  if (estado) {
    return (
      <div className="lectura">
        <div className="lectura-img"><img src={estado.img} alt="Foto en lectura" /><span className="scan" aria-hidden="true" /></div>
        <p role="status">{estado.fuente}{estado.avance > 0 ? `: ${Math.round(estado.avance * 100)}%` : '…'}</p>
      </div>
    );
  }

  if (patente !== null) {
    return (
      <section className="elegir">
        <p className="sub">Patente del vehículo</p>
        {nota && <p className="aviso-ok" role="status">{nota}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <form className="patente-caja" onSubmit={e => { e.preventDefault(); if (patenteValida(patente)) void buscar(patente); }}>
          <input value={patente} onChange={e => setPatente(e.target.value.toUpperCase())} placeholder="ABCD-12"
            aria-label="Patente del vehículo" autoComplete="off" autoFocus />
          <button className="btn primario grande" type="submit" disabled={!patenteValida(patente) || buscando}>
            <MagnifyingGlass size={22} weight="bold" /> {buscando ? 'Buscando…' : 'Buscar el vehículo'}
          </button>
        </form>
        <p className="pista">Formato ABCD-12 (nuevo) o AB-1234 (antiguo).</p>
        <div className="patente-acciones">
          <button className="enlace" onClick={() => { setPatente(null); setError(''); setNota(''); }}>Volver</button>
          <button className="enlace" onClick={onManual}>Escribir todos los datos a mano</button>
        </div>
      </section>
    );
  }

  return (
    <section className="elegir">
      <p className="sub">¿Cómo quieres ingresar los datos?</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="elegir-grid elegir-tres">
        <button className="elegir-op destacada" onClick={() => fotoPadron.current?.click()}>
          <Camera size={52} weight="light" />
          <b>Foto al padrón</b>
          <small>La app lee los datos sola</small>
        </button>
        <button className="elegir-op" onClick={() => { setError(''); setNota(''); fotoPatente.current?.click(); }}>
          <Car size={52} weight="light" />
          <b>Foto a la patente</b>
          <small>Se lee aquí mismo y se buscan los datos</small>
        </button>
        <button className="elegir-op" onClick={() => { setError(''); setNota(''); setPatente(''); }}>
          <MagnifyingGlass size={52} weight="light" />
          <b>Escribir la patente</b>
          <small>Marca, modelo y año llegan solos</small>
        </button>
      </div>
      <input ref={fotoPadron} type="file" accept="image/*" capture="environment" hidden aria-label="Foto del padrón"
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { revisarPadron(await reducirImagen(f)); } catch (err) { setError((err as Error).message); }
        }} />
      <input ref={fotoPatente} type="file" accept="image/*" capture="environment" hidden aria-label="Foto de la patente"
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { await leerPatente(await reducirImagen(f, 2000)); } catch (err) { setError((err as Error).message); }
        }} />
      <div className="patente-acciones">
        <button className="enlace" onClick={() => revisarPadron(padronEjemplo())}>Probar con un padrón de ejemplo</button>
        <button className="enlace" onClick={() => { setNota('Patente de ejemplo para la demostración.'); setPatente(PATENTE_EJEMPLO); }}>Probar con una patente de ejemplo</button>
        <button className="enlace" onClick={onManual}><PencilSimple size={18} /> Prefiero escribir todos los datos</button>
      </div>
    </section>
  );
}

function EstudioIA({ ia, v, onOtra }: { ia: EstadoIA; v: Vehiculo; onOtra: () => void }) {
  const n = Object.keys(ia.vistas).length, trabajando = ia.fase === 'buscando' || ia.fase === 'creando';
  const estado = ia.fase === 'buscando' ? 'Buscando en internet el modelo exacto…'
    : ia.fase === 'creando' ? `Creando las fotos: ${n} de 3`
      : ia.fase === 'error' ? 'No se pudieron crear las fotos. Puedes seguir: el 3D funciona igual.'
        : 'Imágenes referenciales creadas con IA para este modelo.';
  const m = v.ficha?.medidas;
  return (
    <section className="estudio-ia" aria-busy={trabajando}>
      <header>
        <Sparkle size={26} weight="duotone" className={trabajando ? 'pulso' : ''} aria-hidden="true" />
        <div><b>Fotos del modelo</b><small role="status">{estado}</small></div>
        {!trabajando && <button className="enlace" onClick={onOtra}><ArrowsClockwise size={18} /> {ia.fase === 'error' ? 'Reintentar' : 'Otra versión'}</button>}
      </header>
      <div className="estudio-vistas">
        {VISTAS.map(x => (
          <figure key={x.id}>
            {ia.vistas[x.id] ? <img src={ia.vistas[x.id]} alt={`${v.marca} ${v.modelo}, vista ${x.nombre.toLowerCase()}`} /> : <div className={trabajando ? 'esqueleto' : 'vacia'} />}
            <figcaption>{x.nombre}</figcaption>
          </figure>
        ))}
      </div>
      {v.ficha && (
        <p className="pista">
          {v.ficha.generacion}{m ? ` · ${m.largo.toFixed(2)} × ${m.ancho.toFixed(2)} × ${m.alto.toFixed(2)} m: el 3D usa estas medidas` : ''}
          {v.ficha.fuentes?.length ? <> · Fuentes: {v.ficha.fuentes.map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer noopener">{i + 1}</a>).reduce<React.ReactNode[]>((a, e, i) => (i ? [...a, ', ', e] : [e]), [])}</> : null}
        </p>
      )}
      {ia.error && <p className="error" role="alert">{ia.error}</p>}
    </section>
  );
}
