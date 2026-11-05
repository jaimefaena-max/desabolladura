import { useState } from 'react';
import { Eye, EyeSlash, SignIn } from '@phosphor-icons/react';
import { ir, Marca } from '../components/ui';
import { iniciarSesion } from '../lib/store';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState(false);

  const entrar = (e: React.FormEvent) => {
    e.preventDefault();
    const u = iniciarSesion(usuario, clave);
    if (u) ir(u.rol === 'admin' ? '/admin' : '/maestro');
    else { setError(true); setClave(''); }
  };

  return (
    <div className="login">
      <header className="login-top"><Marca /></header>
      <main className="login-caja angosta">
        <h1>Entrar</h1>
        <p className="sub">Escribe tu usuario y tu clave.</p>
        <form className="formulario" onSubmit={entrar}>
          <label className="campo"><span>Usuario</span>
            <input value={usuario} onChange={e => { setUsuario(e.target.value); setError(false); }} autoCapitalize="none" autoCorrect="off" autoComplete="username" required />
          </label>
          <label className="campo"><span>Clave</span>
            <div className="con-boton">
              <input type={ver ? 'text' : 'password'} value={clave} onChange={e => { setClave(e.target.value); setError(false); }} autoComplete="current-password" required />
              <button type="button" className="icono" aria-label={ver ? 'Ocultar clave' : 'Mostrar clave'} onClick={() => setVer(!ver)}>{ver ? <EyeSlash size={26} /> : <Eye size={26} />}</button>
            </div>
          </label>
          {error && <p className="error" role="alert">Usuario o clave incorrectos.</p>}
          <button className="btn primario grande ancho"><SignIn size={26} /> Entrar</button>
        </form>
        <button className="enlace centrado" onClick={() => ir('/cliente')}>Soy cliente: ver cómo va mi auto</button>
      </main>
    </div>
  );
}
