/*
 * Salvavidas independiente de la app: si el programa principal no logra arrancar (archivo que no
 * bajó, datos guardados dañados, navegador muy antiguo), muestra un mensaje con salida en vez de
 * dejar la página en blanco. Cuando la app arranca, reemplaza el contenido de #root y esto no actúa.
 */
(function () {
  // Modo día o noche antes del primer dibujo: la elección guardada o, si no hay, la del equipo.
  try {
    var tema = localStorage.getItem('dp.tema');
    if (tema !== 'claro' && tema !== 'oscuro') tema = matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
    document.documentElement.setAttribute('data-tema', tema);
  } catch (e) { /* almacenamiento bloqueado: queda el modo noche */ }
  var restablecer = /[?&]restablecer=1/.test(location.search);
  if (restablecer) {
    try {
      Object.keys(localStorage).forEach(function (k) {
        if (/^dp\./.test(k) && k !== 'dp.gemini' && k !== 'dp.tema') localStorage.removeItem(k);
      });
    } catch (e) { /* almacenamiento bloqueado: no hay nada que borrar */ }
    history.replaceState(null, '', location.pathname);
  }
  function mostrar() {
    var aviso = document.getElementById('rescate');
    if (aviso) aviso.hidden = false;
  }
  // Los errores de carga de archivos no burbujean: se escuchan en la fase de captura.
  addEventListener('error', mostrar, true);
  addEventListener('DOMContentLoaded', function () { setTimeout(mostrar, 12000); });
})();
