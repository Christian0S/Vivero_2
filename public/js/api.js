// Cliente único para hablar con la API. Si el token de acceso vence, renueva la sesión solo (una vez) y reintenta.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const dormir = ms => new Promise(r => setTimeout(r, ms));

// Un solo refresh a la vez aunque varias peticiones fallen juntas
let refrescando = null;
const refrescar = () => (refrescando ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
  .then(r => r.status).catch(() => 0).finally(() => { refrescando = null; }));

async function enviar(path, method, body, blob) {
  let res;
  try {
    res = await fetch('/api' + path, { method, credentials: 'same-origin',
      headers: blob ? { 'Content-Type': blob.type } : body ? { 'Content-Type': 'application/json' } : {}, body: blob ?? (body ? JSON.stringify(body) : undefined) });
  } catch { throw new ApiError(0, 'No hay conexión con el servidor'); }
  return { res, data: await res.json().catch(() => null) };
}

export async function api(path, { method = 'GET', body, blob } = {}) {
  let { res, data } = await enviar(path, method, body, blob);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const estado = await refrescar();
    if (estado === 409) await dormir(400);               // otra pestaña acaba de renovar: sus cookies ya sirven
    if (estado === 200 || estado === 409) ({ res, data } = await enviar(path, method, body, blob));
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/') && location.pathname.endsWith('app.html')) location.replace('/login.html');
    throw new ApiError(res.status, data?.error || 'Ocurrió un error inesperado');
  }
  return data;
}
