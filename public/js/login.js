import { api } from './api.js';
import { watchImages } from './ui.js';

watchImages();
const form = document.getElementById('form'), err = document.getElementById('err'), btn = document.getElementById('submit');
const email = document.getElementById('email'), pass = document.getElementById('password');

api('/auth/me').then(() => location.replace('/app.html')).catch(() => {});   // si ya hay sesión, entra directo

document.getElementById('toggle').onclick = e => {
  const show = pass.type === 'password';
  pass.type = show ? 'text' : 'password';
  e.currentTarget.textContent = show ? 'Ocultar' : 'Mostrar';
};

form.addEventListener('submit', async e => {
  e.preventDefault();
  err.hidden = true; btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Ingresando…';
  try {
    await api('/auth/login', { method: 'POST', body: { email: email.value, password: pass.value } });
    location.replace('/app.html');
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    btn.disabled = false; btn.textContent = 'Ingresar';
    pass.select();
  }
});

// Cuentas de demostración: solo se muestran en un equipo local
if (['localhost', '127.0.0.1'].includes(location.hostname)) {
  const demo = document.getElementById('demo'); demo.hidden = false;
  demo.querySelectorAll('button').forEach(b => b.onclick = () => { email.value = b.dataset.email; pass.value = 'Vivero2026!'; pass.focus(); });
}
