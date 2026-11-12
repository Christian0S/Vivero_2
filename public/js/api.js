// Cliente único para hablar con la API. Si la sesión vence, vuelve al inicio de sesión.
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && location.pathname.endsWith('app.html')) location.replace('/login.html');
    throw new ApiError(res.status, data?.error || 'Ocurrió un error inesperado');
  }
  return data;
}
