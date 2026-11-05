import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, CheckCircle, PencilSimple, Sparkle } from '@phosphor-icons/react';
import PiezaPicker from '../components/PiezaPicker';
import { ir, Pantalla } from '../components/ui';
import { claveGemini, generarImagenGemini, leerPadronGemini } from '../lib/gemini';
import { leerConOCR, padronEjemplo, reducirImagen, type DatosPadron } from '../lib/padron';
import { fechaLocal } from '../lib/piezas';
import { sugerir } from '../lib/precios';
import { ASEGURADORAS, tareasGenerales } from '../lib/seed';
import { codigoCliente, guardarOrden, sesion, siguienteNumero, uid } from '../lib/store';
import type { Carroceria, Item, Orden, Pagador, Vehiculo } from '../lib/types';
import { CARROCERIAS, carroceriaDe, CATALOGO, COLORES, colorHex, normalizarPatente, patenteValida, verPatente } from '../lib/vehiculos';

const PASOS = ['Padrón', 'Vehículo', 'Cliente', 'Trabajos'];

export default function NuevoVehiculo() {
  const u = sesion()!;
  const [paso, setPaso] = useState(0);
  const [v, setV] = useState<Vehiculo>({ marca: '', modelo: '', anio: new Date().getFullYear(), patente: '', color: 'Plateado', colorHex: COLORES[1].hex, carroceria: 'sedan' });
  const [cliente, setCliente] = useState({ nombre: '', rut: '', telefono: '' });
  const [pagador, setPagador] = useState<Pagador>({ tipo: 'aseguradora', aseguradora: ASEGURADORAS[0], siniestro: '', deducible: 0 });
  const [items, setItems] = useState<Item[]>(tareasGenerales());
  const [leido, setLeido] = useState<string | null>(null);
  const [listo, setListo] = useState<Orden | null>(null);
  const [imagen, setImagen] = useState<{ cargando: boolean; src?: string; error?: string }>({ cargando: false });

  const aplicar = (d: DatosPadron) => {
    const marca = Object.keys(CATALOGO).find(k => k.toLowerCase() === (d.marca ?? '').toLowerCase()) ?? d.marca ?? '';
    const modelo = d.modelo ?? '', col = d.color ? colorHex(d.color) : COLORES[1];
    setV(x => ({
      ...x, marca, modelo, anio: d.anio ?? x.anio, patente: d.patente ?? '', motor: d.motor, chasis: d.chasis,
      color: col.nombre, colorHex: col.hex, carroceria: carroceriaDe(marca, modelo) ?? x.carroceria,
    }));
    setCliente(c => ({ ...c, nombre: d.nombre ?? c.nombre, rut: d.rut ?? c.rut }));
    const n = [d.patente, d.marca, d.modelo, d.anio, d.color, d.chasis, d.nombre, d.rut].filter(Boolean).length;
    setLeido(`Se leyeron ${n} datos del padrón. Revísalos antes de seguir.`);
    setPaso(1);
  };

  const cambiarVehiculo = (c: Partial<Vehiculo>) => setV(x => {
    const n = { ...x, ...c };
    if (c.marca !== undefined || c.modelo !== undefined) n.carroceria = carroceriaDe(n.marca, n.modelo) ?? n.carroceria;
    return n;
  });

  const vehiculoOk = v.marca.trim() && v.modelo.trim() && patenteValida(v.patente) && v.anio >= 1980 && v.anio <= new Date().getFullYear() + 1;
  const clienteOk = cliente.nombre.trim().length > 2 && (pagador.tipo === 'particular' || (pagador.aseguradora && pagador.siniestro?.trim()));
  const hayTrabajos = items.some(i => i.trabajo !== 'general');

  const finalizar = () => {
    const o: Orden = {
      id: uid(), numero: siguienteNumero(), codigo: codigoCliente(), creada: fechaLocal(), entrega: fechaLocal(7), maestroId: u.id,
      vehiculo: { ...v, patente: normalizarPatente(v.patente) }, cliente, pagador,
      // El maestro pudo corregir el vehículo después de agregar trabajos: el rango se recalcula con el dato final.
      items: items.map(i => (i.trabajo === 'general' ? i : { ...i, sugerido: sugerir(i.trabajo, i.pieza, i.severidad ?? 'medio', v) })),
      notas: '', cobrada: false, imagenIA: imagen.src,
    };
    guardarOrden(o);
    setListo(o);
  };

  const crearImagen = async () => {
    setImagen({ cargando: true });
    try { setImagen({ cargando: false, src: await generarImagenGemini(v) }); }
    catch (e) { setImagen({ cargando: false, error: (e as Error).message }); }
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

      {paso === 0 && <PasoPadron onDatos={aplicar} onManual={() => setPaso(1)} />}

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
              <input value={v.patente} onChange={e => cambiarVehiculo({ patente: e.target.value.toUpperCase() })} placeholder="ABCD-12" autoComplete="off" aria-invalid={!!v.patente && !patenteValida(v.patente)} />
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
          <Navegar atras={() => setPaso(0)} siguiente={() => setPaso(2)} ok={!!vehiculoOk} ayuda="Completa marca, modelo, año y patente." />
        </section>
      )}

      {paso === 2 && (
        <section className="formulario">
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
          {claveGemini() && (
            <div className="caja-ia">
              {imagen.src ? <img src={imagen.src} alt={`Imagen generada de ${v.marca} ${v.modelo}`} /> : (
                <button className="btn secundario" disabled={imagen.cargando} onClick={crearImagen}><Sparkle size={22} /> {imagen.cargando ? 'Generando imagen…' : 'Generar imagen con Gemini'}</button>
              )}
              {imagen.error && <p className="error" role="alert">{imagen.error}</p>}
            </div>
          )}
          <PiezaPicker vehiculo={v} items={items} onChange={setItems} />
          <Navegar atras={() => setPaso(2)} siguiente={finalizar} ok={hayTrabajos} texto="Guardar vehículo" ayuda="Agrega al menos un trabajo." />
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

function PasoPadron({ onDatos, onManual }: { onDatos: (d: DatosPadron) => void; onManual: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<{ avance: number; img: string; fuente: string } | null>(null);
  const [error, setError] = useState('');
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);

  // Una foto real con Gemini conectado sale del equipo: se avisa antes de enviarla.
  const revisar = (img: string) => { if (claveGemini()) setPorConfirmar(img); else void leer(img); };

  const leer = async (img: string) => {
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

  if (porConfirmar) {
    return (
      <section className="confirmar" role="alertdialog" aria-label="Aviso antes de enviar la foto">
        <h2>Esta foto se enviará a Google</h2>
        <p>Gemini recibirá la imagen, que puede incluir nombre y RUT del dueño. En esta demo usa solo el padrón de ejemplo.</p>
        <div>
          <button className="btn primario grande" onClick={() => setPorConfirmar(null)}>Cancelar</button>
          <button className="btn secundario grande" onClick={() => leer(porConfirmar)}>Enviar a Gemini</button>
        </div>
      </section>
    );
  }

  if (estado) {
    return (
      <div className="lectura">
        <div className="lectura-img"><img src={estado.img} alt="Padrón en lectura" /><span className="scan" aria-hidden="true" /></div>
        <p role="status">{estado.fuente}{estado.avance > 0 ? `: ${Math.round(estado.avance * 100)}%` : '…'}</p>
      </div>
    );
  }

  return (
    <section className="elegir">
      <p className="sub">¿Cómo quieres ingresar los datos?</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="elegir-grid">
        <button className="elegir-op destacada" onClick={() => input.current?.click()}>
          <Camera size={52} weight="light" />
          <b>Sacar foto al padrón</b>
          <small>La app lee los datos sola</small>
        </button>
        <button className="elegir-op" onClick={onManual}>
          <PencilSimple size={52} weight="light" />
          <b>Escribir los datos</b>
          <small>Marca, modelo, año y patente</small>
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden aria-label="Foto del padrón"
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try { revisar(await reducirImagen(f)); } catch (err) { setError((err as Error).message); }
        }} />
      <button className="enlace" onClick={() => revisar(padronEjemplo())}>Probar con un padrón de ejemplo</button>
    </section>
  );
}
