// Tema claro/oscuro. Se carga en <head> (sin "defer") para pintar el tema correcto desde el primer instante.
(function () {
  var html = document.documentElement, KEY = 'tema', saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  html.setAttribute('data-tema', saved === 'dark' ? 'dark' : 'light');   // claro por defecto
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-tema-toggle]');
    if (!b) return;
    var next = html.getAttribute('data-tema') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-tema', next);
    try { localStorage.setItem(KEY, next); } catch (e2) {}
  });
})();
