import { readFile, writeFile, rename, unlink, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { emitKeypressEvents } from 'node:readline';
import * as util from 'node:util';

const directory = dirname(fileURLToPath(import.meta.url));
process.chdir(directory);
const envPath = join(directory, '.env');
const defaults = {
  PGHOST: '127.0.0.1',
  PGPORT: '5432',
  PGDATABASE: 'Medicion',
  PGUSER: 'medicion_app',
  PGADMIN_USER: 'postgres',
  PGADMIN_DATABASE: 'postgres',
  HOST: '127.0.0.1',
  PORT: '3000',
};
let config = {};

function missing(value) {
  return !value || /^(CHANGE_ME|ESCRIBE_|ELIGE_|TU_CONTRAS)/i.test(value);
}

function validate(values) {
  for (const key of ['PGDATABASE', 'PGUSER', 'PGADMIN_USER', 'PGADMIN_DATABASE']) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(values[key]))
      throw Error(`Revisa ${key} en .env: utiliza letras, numeros y guion bajo.`);
  }
  for (const key of ['PGPORT', 'PORT']) {
    if (!/^\d+$/.test(values[key]) || Number(values[key]) < 1 || Number(values[key]) > 65535)
      throw Error(`Revisa ${key} en .env: debe ser un puerto entre 1 y 65535.`);
  }
  if (values.PGUSER === values.PGADMIN_USER)
    throw Error('PGUSER debe ser diferente de PGADMIN_USER. Usa medicion_app para la aplicacion.');
}

async function loadConfig() {
  let original = '';
  try {
    original = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const saved = util.parseEnv(original);
  config = { ...defaults, ...saved };
  validate(config);
  return { original, saved };
}

function execute(file, args, environment = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: directory,
      env: environment,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(Error('El comando anterior no termino correctamente. Revisa el mensaje mostrado.'));
    });
  });
}

async function dependencies() {
  const manifest = JSON.parse(await readFile('package.json', 'utf8'));
  const version = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifest.packageManager)?.[1];
  if (!version) throw Error('No se encontro la version de pnpm en package.json. Descarga el proyecto completo.');
  await access('pnpm-lock.yaml');
  console.log('Descargando las dependencias. Se necesita internet; espera a que termine.');
  await execute(process.env.ComSpec || 'cmd.exe', [
    '/d', '/s', '/c', `npx.cmd --yes pnpm@${version} install --frozen-lockfile`,
  ]);
}

async function databaseClient(user, password, database) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    host: config.PGHOST,
    port: Number(config.PGPORT),
    user,
    password,
    database,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}

async function inspectApplication() {
  const client = await databaseClient(config.PGUSER, config.PGPASSWORD, config.PGDATABASE);
  try {
    const { rows } = await client.query(`SELECT
      (SELECT count(*) FROM medicion.usuario) AS usuarios,
      (SELECT count(*) FROM medicion.cajero) AS cajeros,
      (SELECT count(*) FROM medicion.periodo_evaluacion) AS periodos,
      (SELECT count(*) FROM medicion.tarea) AS tareas,
      to_regclass('medicion.resultado_final') IS NOT NULL AS resultados`);
    return rows[0];
  } finally {
    await client.end();
  }
}

function readPassword() {
  if (!process.stdin.isTTY)
    throw Error('Abre Instalar.cmd con doble clic para introducir la contrasena de PostgreSQL.');
  console.log(`Contrasena de PostgreSQL para ${config.PGADMIN_USER} en ${config.PGHOST}:${config.PGPORT}`);
  process.stdout.write('Escribela y presiona Enter; los caracteres permanecen ocultos: ');
  return new Promise((resolve, reject) => {
    let password = '';
    const wasRaw = process.stdin.isRaw;
    emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const finish = (error) => {
      process.stdin.removeListener('keypress', keypress);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(password);
    };
    const keypress = (text, key = {}) => {
      if (key.ctrl && key.name === 'c') finish(Error('Instalacion cancelada.'));
      else if (key.name === 'return' || key.name === 'enter') finish();
      else if (key.name === 'backspace') password = Array.from(password).slice(0, -1).join('');
      else if (text && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(text)) password += text;
    };
    process.stdin.on('keypress', keypress);
  });
}

function envValue(value) {
  const text = String(value);
  const quote = ['"', "'", '`'].find((character) => !text.includes(character));
  if (!quote || /[\r\n]/.test(text)) throw Error('Una clave contiene caracteres que requieren editar .env manualmente.');
  return quote + text + quote;
}

async function saveConfig(original, saved) {
  let result = original;
  for (const [key, value] of Object.entries(config)) {
    if (saved[key] === value) continue;
    const line = `${key}=${envValue(value)}`;
    const pattern = new RegExp(`^(?:export\\s+)?${key}\\s*=.*$`, 'm');
    if (pattern.test(result)) result = result.replace(pattern, () => line);
    else result += `${result && !result.endsWith('\n') ? '\n' : ''}${line}\n`;
  }
  if (result === original) return;
  const temporary = envPath + '.instalando';
  try {
    await writeFile(temporary, result, { mode: 0o600, flag: 'wx' });
    await rename(temporary, envPath);
  } catch (error) {
    if (error.code !== 'EEXIST') await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function showAccess() {
  const client = await databaseClient(config.PGUSER, config.PGPASSWORD, config.PGDATABASE);
  try {
    const { rows } = await client.query(
      "SELECT correo, password_hash FROM medicion.usuario WHERE activo AND correo IN ('supervisor1@medicion.local','cajero001@medicion.local') ORDER BY correo",
    );
    const { verifyPassword } = await import('./auth.mjs');
    let shown = false;
    if (!missing(config.DEMO_PASSWORD)) {
      for (const row of rows) {
        if (await verifyPassword(config.DEMO_PASSWORD, row.password_hash)) {
          console.log(`Cuenta: ${row.correo}`);
          shown = true;
        }
      }
    }
    if (shown) console.log(`Contrasena del portal: ${config.DEMO_PASSWORD}\nGuardala antes de cerrar esta ventana.`);
    else console.log('Las cuentas existentes conservan sus contrasenas. Usa las que ya tenias.');
  } finally {
    await client.end();
  }
  console.log('\nPreparacion terminada. Abre Iniciar.cmd para entrar al portal.');
}

async function install() {
  const { original, saved } = await loadConfig();
  await dependencies();
  if (!missing(config.PGPASSWORD)) {
    try {
      const state = await inspectApplication();
      if (state.resultados && Number(state.usuarios) > 0) {
        console.log('La base ya esta preparada. Se conservaron su configuracion y sus datos.');
        await showAccess();
        return;
      }
    } catch (error) {
      if (!['3D000', '42P01', '3F000'].includes(error.code)) throw error;
    }
  }
  let adminPassword = missing(config.PGADMIN_PASSWORD) ? process.env.PGADMIN_PASSWORD : config.PGADMIN_PASSWORD;
  if (missing(adminPassword)) adminPassword = await readPassword();
  if (!adminPassword) throw Error('Debes introducir la contrasena de PostgreSQL.');
  const admin = await databaseClient(config.PGADMIN_USER, adminPassword, config.PGADMIN_DATABASE);
  try {
    const version = await admin.query('SHOW server_version_num');
    if (Number(version.rows[0].server_version_num) < 180000)
      throw Error('Esta instalacion requiere PostgreSQL 18 o posterior. Revisa la conexion configurada.');
    const existingRole = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [config.PGUSER]);
    if (existingRole.rowCount) {
      if (missing(config.PGPASSWORD)) {
        config.PGUSER = 'medicion_app_' + randomBytes(6).toString('hex');
        console.log('Se usara una cuenta tecnica nueva para conservar la que ya existe.');
      } else {
        const existing = await databaseClient(config.PGUSER, config.PGPASSWORD, config.PGADMIN_DATABASE);
        await existing.end();
      }
    }
  } finally {
    await admin.end();
  }
  if (missing(config.PGPASSWORD)) config.PGPASSWORD = randomBytes(24).toString('base64url');
  if (missing(config.DEMO_PASSWORD)) config.DEMO_PASSWORD = randomBytes(15).toString('base64url');
  if (config.DEMO_PASSWORD.length < 10 || config.DEMO_PASSWORD.length > 128)
    throw Error('DEMO_PASSWORD debe tener entre 10 y 128 caracteres. Revisa .env.');
  await saveConfig(original, saved);
  console.log('Conexion comprobada. Preparando la base y los datos de prueba...');
  await execute(process.execPath, ['setup.mjs'], { ...process.env, ...config, PGADMIN_PASSWORD: adminPassword });
  const state = await inspectApplication();
  if (!state.resultados || Number(state.usuarios) === 0)
    throw Error('La base contiene informacion previa incompleta. Se conservo; consulta la guia antes de continuar.');
  await showAccess();
}

function openBrowser(url) {
  const browser = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:MEDICION_PORTAL_URL'], {
    env: { ...process.env, MEDICION_PORTAL_URL: url },
    windowsHide: true,
    stdio: 'ignore',
  });
  const manual = () => console.log(`Si el navegador no se abre, entra a ${url}`);
  browser.once('error', manual);
  browser.once('exit', (code) => { if (code) manual(); });
}

async function start() {
  const { original } = await loadConfig();
  if (!original || missing(config.PGPASSWORD)) throw Error('Primero abre Instalar.cmd para preparar el programa.');
  for (const [key, value] of Object.entries(config)) process.env[key] = value;
  const { createPool } = await import('./db.mjs');
  const { createApp } = await import('./server.mjs');
  const pool = createPool();
  const server = createApp(pool);
  try {
    await pool.query('SELECT usuario_id FROM medicion.usuario LIMIT 1');
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(Number(config.PORT), config.HOST, resolve);
    });
  } catch (error) {
    await pool.end();
    throw error;
  }
  const host = ['0.0.0.0', '::'].includes(config.HOST) ? '127.0.0.1' : config.HOST;
  const url = new URL(`http://${host.includes(':') ? `[${host}]` : host}:${config.PORT}`).href;
  console.log(`Medicion lista: ${url}\nDeja esta ventana abierta. Para detener el portal, presiona Ctrl + C.`);
  if (!process.argv.includes('--sin-navegador')) openBrowser(url);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => server.closeAllConnections(), 2000);
    server.close(() => {
      clearTimeout(timeout);
      pool.end().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function errorMessage(error) {
  if (error.code === '28P01') return 'PostgreSQL rechazo la contrasena. Revisa el usuario y su clave; no se restablecio ninguna contrasena.';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code))
    return `No se pudo conectar a PostgreSQL en ${config.PGHOST}:${config.PGPORT}. Comprueba que PostgreSQL 18 este instalado, encendido y use ese puerto.`;
  if (error.code === 'EADDRINUSE') return 'El puerto del portal esta ocupado. Cierra la otra ventana del portal o cambia PORT en .env.';
  if (error.code === 'ERR_MODULE_NOT_FOUND') return 'Faltan archivos o dependencias. Descarga el proyecto completo y abre Instalar.cmd.';
  if (error.code === 'ENOENT') return 'Falta un archivo o programa. Descarga el ZIP completo e instala Node.js con npm incluido.';
  if (error.code === '3D000') return 'La base todavia no existe. Abre Instalar.cmd para crearla.';
  if (['42P01', '3F000'].includes(error.code)) return 'Faltan las tablas del programa. Abre Instalar.cmd para preparar la base.';
  let message = error.message;
  for (const secret of [config.PGPASSWORD, config.PGADMIN_PASSWORD, config.DEMO_PASSWORD]) {
    if (secret) message = message.replaceAll(secret, '[oculto]');
  }
  return message;
}

try {
  if (Number(process.versions.node.split('.')[0]) < 24)
    throw Error('Instala Node.js 24 LTS o posterior desde https://nodejs.org/en/download y vuelve a abrir el archivo.');
  if (process.platform !== 'win32') throw Error('Estos asistentes estan preparados para Windows.');
  if (process.argv[2] === 'instalar') await install();
  else if (process.argv[2] === 'iniciar') await start();
  else throw Error('Abre Instalar.cmd o Iniciar.cmd.');
} catch (error) {
  console.error(`\nNo se pudo completar la operacion: ${errorMessage(error)}`);
  process.exitCode = 1;
}
