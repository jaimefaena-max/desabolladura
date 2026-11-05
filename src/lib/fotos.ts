/** Las fotos pesan demasiado para localStorage: viven en IndexedDB y la orden guarda solo su identificador. */
function abrir() {
  return new Promise<IDBDatabase>((ok, mal) => {
    const r = indexedDB.open('dp-fotos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

export async function guardarFoto(id: string, data: string) {
  const db = await abrir();
  await new Promise<void>((ok, mal) => {
    const t = db.transaction('fotos', 'readwrite');
    t.objectStore('fotos').put(data, id);
    t.oncomplete = () => ok();
    t.onerror = () => mal(t.error);
  });
  db.close();
}

export async function leerFoto(id: string) {
  const db = await abrir();
  const data = await new Promise<string | undefined>((ok, mal) => {
    const r = db.transaction('fotos').objectStore('fotos').get(id);
    r.onsuccess = () => ok(r.result as string | undefined);
    r.onerror = () => mal(r.error);
  });
  db.close();
  return data;
}
