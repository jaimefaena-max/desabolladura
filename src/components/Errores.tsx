import { Component, type ErrorInfo, type ReactNode } from 'react';
import { borrarTodo, useSinGuardar } from '../lib/store';

/**
 * Red de seguridad: si una pantalla falla al dibujarse (dato inesperado, 3D que no carga, versión
 * nueva publicada mientras la pestaña estaba abierta), se muestra `alternativa` en vez de dejar la
 * página en blanco. Al cambiar `clave` (la ruta) se vuelve a intentar.
 */
export class Barrera extends Component<{ children: ReactNode; alternativa?: ReactNode; clave?: string }, { fallo: boolean }> {
  state = { fallo: false };

  static getDerivedStateFromError() { return { fallo: true }; }

  componentDidCatch(error: unknown, info: ErrorInfo) { console.error('Pantalla con error', error, info.componentStack); }

  componentDidUpdate(antes: { clave?: string }) {
    if (this.state.fallo && antes.clave !== this.props.clave) this.setState({ fallo: false });
  }

  render() {
    if (!this.state.fallo) return this.props.children;
    return this.props.alternativa ?? <PantallaError />;
  }
}

function PantallaError() {
  const inicio = () => { location.hash = '/'; location.reload(); };
  const restablecer = () => {
    if (!confirm('Se borrarán los cambios hechos en esta demostración. ¿Continuar?')) return;
    borrarTodo();
    inicio();
  };
  return (
    <div className="login">
      <main className="login-caja angosta" role="alert">
        <h1>Algo no cargó bien</h1>
        <p className="sub">Puede ser la conexión o una versión nueva de la demostración. Recarga la página para continuar.</p>
        <button className="btn primario grande ancho" onClick={() => location.reload()}>Recargar</button>
        <button className="btn secundario grande ancho" onClick={inicio}>Volver al inicio</button>
        <button className="enlace centrado" onClick={restablecer}>Si sigue fallando, restablecer la demostración</button>
      </main>
    </div>
  );
}

/** Aviso fijo cuando el navegador no deja guardar (sin espacio o almacenamiento bloqueado). */
export function AvisoSinGuardar() {
  if (!useSinGuardar()) return null;
  return <p className="demo-franja alerta" role="alert">Este navegador no está guardando los cambios (sin espacio o modo privado). Se perderán al cerrar la pestaña.</p>;
}
