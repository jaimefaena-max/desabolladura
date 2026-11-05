import { useState } from 'react';
import { Backspace, Car } from '@phosphor-icons/react';
import { ir, Marca } from '../components/ui';
import { USUARIOS } from '../lib/seed';
import { iniciarSesion } from '../lib/store';
import type { Usuario } from '../lib/types';

const iniciales = (n: string) => n.split(' ').map(p => p[0]).slice(0, 2).join('');

export default function Login() {
  const [u, setU] = useState<Usuario | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const tecla = (d: string) => {
    const nuevo = (pin + d).slice(0, 4);
    setPin(nuevo); setError(false);
    if (nuevo.length === 4 && u) {
      const ok = iniciarSesion(u.id, nuevo);
      if (ok) ir(ok.rol === 'admin' ? '/admin' : '/maestro');
      else { setError(true); setPin(''); }
    }
  };

  return (
    <div className="login">
      <header className="login-top"><Marca /></header>
      {!u ? (
        <main className="login-caja">
          <h1>¿Quién eres?</h1>
          <p className="sub">Toca tu nombre para entrar.</p>
          <div className="perfiles">
            {USUARIOS.map(x => (
              <button key={x.id} className="perfil" onClick={() => setU(x)}>
                <span className="avatar">{iniciales(x.nombre)}</span>
                <span><b>{x.nombre}</b><small>{x.cargo}</small></span>
              </button>
            ))}
            <button className="perfil" onClick={() => ir('/cliente')}>
              <span className="avatar claro"><Car size={30} /></span>
              <span><b>Soy cliente</b><small>Ver cómo va mi auto</small></span>
            </button>
          </div>
        </main>
      ) : (
        <main className="login-caja angosta">
          <h1>Hola, {u.nombre.split(' ')[0]}</h1>
          <p className="sub">Escribe tu PIN de 4 números.</p>
          <div className="pin-puntos" aria-label={`${pin.length} de 4 números escritos`}>
            {[0, 1, 2, 3].map(i => <i key={i} className={i < pin.length ? 'on' : ''} />)}
          </div>
          {error && <p className="error" role="alert">PIN incorrecto. Intenta otra vez.</p>}
          <div className="teclado">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => <button key={n} onClick={() => tecla(n)}>{n}</button>)}
            <button className="suave" onClick={() => { setU(null); setPin(''); setError(false); }}>Atrás</button>
            <button onClick={() => tecla('0')}>0</button>
            <button className="suave" aria-label="Borrar" onClick={() => setPin(pin.slice(0, -1))}><Backspace size={30} /></button>
          </div>
          <p className="pista">PIN de demostración: {u.pin}</p>
        </main>
      )}
    </div>
  );
}
