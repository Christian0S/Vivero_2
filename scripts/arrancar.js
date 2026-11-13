// Arranca identidad (3001) y negocio (3000) como DOS procesos, cada uno con su propio entorno.   Uso: npm start | npm run dev
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { envPara, RAIZ } = require('./lib-env');

const watch = process.argv.includes('--watch');
const SERVICIOS = [
  { nombre: 'identidad', archivo: 'identidad/server.js', color: '\x1b[35m' },
  { nombre: 'negocio', archivo: 'src/server.js', color: '\x1b[36m' },
];
const hijos = [];
let saliendo = false;
const apagar = codigo => { if (saliendo) return; saliendo = true; hijos.forEach(h => h.kill()); setTimeout(() => process.exit(codigo), 800); };

for (const s of SERVICIOS) {
  const h = spawn(process.execPath, [...(watch ? ['--watch'] : []), path.join(RAIZ, s.archivo)], { cwd: RAIZ, env: envPara(s.nombre), stdio: ['ignore', 'pipe', 'pipe'] });
  for (const flujo of [h.stdout, h.stderr]) readline.createInterface({ input: flujo }).on('line', l => console.log(`${s.color}[${s.nombre}]\x1b[0m ${l}`));
  h.on('exit', c => { if (!saliendo) { console.error(`[${s.nombre}] se detuvo (código ${c}). Apagando todo.`); apagar(c || 1); } });
  hijos.push(h);
}
process.on('SIGINT', () => apagar(0)); process.on('SIGTERM', () => apagar(0));
