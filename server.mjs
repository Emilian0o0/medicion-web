import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from './db.mjs';
import { hashPassword, verifyPassword, passwordValid, token, tokenHash, pageFor } from './auth.mjs';

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new ApiError(status, message);
};
const integer = (v, name) => {
  if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(Number(v)) || Number(v) <= 0)
    fail(400, `${name} no es válido.`);
  return Number(v);
};
const text = (v, name, max = 160) => {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    fail(400, `${name} no es válido.`);
  return v.trim();
};
const date = (v, name) => {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v ||
    v < '1900-01-01' ||
    v > '2200-12-31'
  )
    fail(400, `${name} no es válida.`);
  return v;
};
const safeUser = (u) => ({
  usuario_id: u.usuario_id,
  nombre: u.nombre,
  correo: u.correo,
  rol: u.rol,
  cajero_id: u.cajero_id,
});
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    fail(415, 'Se requiere un formulario JSON.');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 32768) fail(413, 'Formulario demasiado grande.');
  }
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error();
    return data;
  } catch {
    fail(400, 'Formulario inválido.');
  }
}
function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(value));
}
async function transaction(pool, action) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const result = await action(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export function createApp(pool) {
  const attempts = new Map();
  const dummyHash = hashPassword(token());
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",
    );
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      let session;
      const cookie = req.headers.cookie?.match(
        /(?:^|;\s*)medicion_session=([a-f0-9]{64})(?:;|$)/,
      )?.[1];
      if (cookie) {
        const data = await pool.query(
          `SELECT u.*, s.csrf_token FROM medicion.sesion s JOIN medicion.usuario u USING (usuario_id)
          WHERE s.token_hash=$1 AND s.expira_en>now() AND u.activo`,
          [tokenHash(cookie)],
        );
        session = data.rows[0];
      }
      const authorize = (role) => {
        if (!session) fail(401, 'Inicia sesión para continuar.');
        if (role && session.rol !== role) fail(403, 'No tienes permisos para esta acción.');
      };
      if (path.startsWith('/api/') && !['GET', 'POST', 'PATCH'].includes(req.method))
        fail(405, 'Método no permitido.');
      if (path.startsWith('/api/') && req.method !== 'GET') {
        let validOrigin = false;
        try {
          validOrigin =
            ['http:', 'https:'].includes(new URL(req.headers.origin).protocol) &&
            new URL(req.headers.origin).host === req.headers.host;
        } catch {}
        if (!validOrigin) fail(403, 'Origen de la solicitud no válido.');
        if (path !== '/api/login') {
          authorize();
          if (req.headers['x-csrf-token'] !== session.csrf_token)
            fail(403, 'La sesión del formulario caducó. Actualiza la página.');
        }
      }
      if (path === '/api/login' && req.method === 'POST') {
        const b = await body(req);
        const email = text(b.correo, 'Correo', 254).toLowerCase();
        if (typeof b.contrasena !== 'string' || b.contrasena.length > 128)
          fail(400, 'Contraseña inválida.');
        const key = req.socket.remoteAddress;
        const time = Date.now();
        const recent = (attempts.get(key) || []).filter((t) => t > time - 15 * 60 * 1000);
        if (recent.length >= 20) fail(429, 'Demasiados intentos. Espera 15 minutos.');
        const { rows } = await pool.query(
          'SELECT * FROM medicion.usuario WHERE correo=$1 AND activo',
          [email],
        );
        const u = rows[0];
        const ok = await verifyPassword(b.contrasena, u?.password_hash || (await dummyHash));
        if (!u || !ok) {
          attempts.set(key, [...recent, time]);
          fail(401, 'Correo o contraseña incorrectos.');
        }
        attempts.delete(key);
        const rawToken = token(),
          csrf = token();
        await pool.query('DELETE FROM medicion.sesion WHERE expira_en<=now()');
        await pool.query(
          `INSERT INTO medicion.sesion(token_hash,usuario_id,csrf_token,expira_en) VALUES ($1,$2,$3,now()+interval '8 hours')`,
          [tokenHash(rawToken), u.usuario_id, csrf],
        );
        res.setHeader(
          'Set-Cookie',
          `medicion_session=${rawToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`,
        );
        return json(res, 200, { user: safeUser(u), redirect: pageFor(u.rol) });
      }
      if (path === '/api/logout' && req.method === 'POST') {
        await pool.query('DELETE FROM medicion.sesion WHERE token_hash=$1', [tokenHash(cookie)]);
        res.setHeader(
          'Set-Cookie',
          'medicion_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
        );
        return json(res, 200, { ok: true });
      }
      if (path === '/api/me' && req.method === 'GET') {
        authorize();
        return json(res, 200, { user: safeUser(session), csrf: session.csrf_token });
      }
      if (path === '/api/dashboard' && req.method === 'GET') {
        authorize();
        const isSupervisor = session.rol === 'supervisor';
        const params = [isSupervisor ? session.usuario_id : session.cajero_id];
        const filter = isSupervisor ? 'WHERE c.supervisor_id=$1' : 'WHERE c.cajero_id=$1';
        const resultFilter = isSupervisor ? '' : 'WHERE c.cajero_id=$1';
        const resultParams = isSupervisor ? [] : [session.cajero_id];
        const [
          cashiers,
          tasks,
          results,
          periods,
          criteria,
          centers,
          operations,
          measures,
          monthlyAverages,
          regionalCashiers,
        ] = await Promise.all([
          pool.query(
            `SELECT c.*, ce.nombre AS centro_nombre, s.nombre AS supervisor_nombre, u.correo, u.usuario_id
            FROM medicion.cajero c LEFT JOIN medicion.centro ce ON ce.centro_id=c.centro_id
            LEFT JOIN medicion.usuario s ON s.usuario_id=c.supervisor_id
            LEFT JOIN medicion.usuario u ON u.cajero_id=c.cajero_id ${filter} ORDER BY c.numero_empleado`,
            params,
          ),
          pool.query(
            `SELECT t.*, c.nombre_completo, CASE WHEN t.estado<>'Completada' AND t.fecha_limite < CURRENT_DATE THEN 'Vencida' ELSE t.estado END AS estado_visible
            FROM medicion.tarea t JOIN medicion.cajero c USING (cajero_id) ${filter} ORDER BY t.fecha_limite,t.tarea_id`,
            params,
          ),
          pool.query(
            `SELECT r.*, c.centro_id, c.supervisor_id, ce.nombre AS centro_nombre, s.nombre AS supervisor_nombre, ARRAY(SELECT k.codigo FROM medicion.criterio k
            WHERE k.metodo_calculo='reglas' AND NOT EXISTS (SELECT 1 FROM medicion.medicion_criterio_cajero m
              JOIN medicion.regla_criterio g ON g.criterio_codigo=m.criterio_codigo AND m.valor>=g.minimo AND (g.maximo IS NULL OR m.valor<=g.maximo)
              WHERE m.periodo_id=r.periodo_id AND m.cajero_id=r.cajero_id AND m.criterio_codigo=k.codigo)
            UNION ALL SELECT 'sicatel' WHERE NOT EXISTS (SELECT 1 FROM medicion.operacion_sicatel_diaria o WHERE o.periodo_id=r.periodo_id AND o.cajero_id=r.cajero_id)
              OR EXISTS (SELECT 1 FROM medicion.operacion_sicatel_diaria o WHERE o.periodo_id=r.periodo_id AND o.cajero_id=r.cajero_id
                AND NOT EXISTS (
                  SELECT 1 FROM medicion.operacion_sicatel_diaria comparable
                  WHERE comparable.periodo_id=o.periodo_id
                    AND comparable.centro_id=o.centro_id
                    AND comparable.fecha=o.fecha
                    AND comparable.operaciones>0
                ))
            UNION ALL SELECT 'antiguedad' WHERE c.fecha_ingreso>=(SELECT fecha_fin+1 FROM medicion.periodo_evaluacion WHERE periodo_id=r.periodo_id)
            ) AS faltantes
            FROM medicion.resultado_final r JOIN medicion.cajero c USING (cajero_id)
            LEFT JOIN medicion.centro ce ON ce.centro_id=c.centro_id
            LEFT JOIN medicion.usuario s ON s.usuario_id=c.supervisor_id ${resultFilter} ORDER BY r.periodo_id DESC,r.numero_empleado`,
            resultParams,
          ),
          pool.query(
            `SELECT p.* FROM medicion.periodo_evaluacion p
             ${isSupervisor ? '' : 'WHERE EXISTS (SELECT 1 FROM medicion.cajero_periodo cp WHERE cp.periodo_id=p.periodo_id AND cp.cajero_id=$1)'}
             ORDER BY p.fecha_inicio DESC,p.periodo_id DESC`,
            isSupervisor ? [] : params,
          ),
          pool.query('SELECT * FROM medicion.criterio ORDER BY peso_maximo DESC,codigo'),
          pool.query(
            `SELECT ce.* FROM medicion.centro ce
             WHERE EXISTS (
               SELECT 1 FROM medicion.cajero c
               WHERE c.centro_id=ce.centro_id
                 AND ${isSupervisor ? 'c.supervisor_id' : 'c.cajero_id'}=$1
             ) ORDER BY ce.codigo`,
            params,
          ),
          pool.query(
            `SELECT o.*, ce.nombre AS centro_nombre
             FROM medicion.operacion_sicatel_diaria o
             JOIN medicion.cajero c USING (cajero_id)
             JOIN medicion.centro ce ON ce.centro_id=o.centro_id
             ${filter} ORDER BY fecha DESC`,
            params,
          ),
          pool.query(
            `SELECT m.* FROM medicion.medicion_criterio_cajero m JOIN medicion.cajero c USING (cajero_id) ${filter}`,
            params,
          ),
          pool.query(`SELECT r.periodo_id, p.nombre AS periodo, p.fecha_inicio,
              count(*)::integer AS cajeros,
              avg(r.disciplinario) AS disciplinario,
              avg(r.sicatel) AS sicatel,
              avg(r.entrega_valores) AS entrega_valores,
              avg(r.faltantes_sobrantes) AS faltantes_sobrantes,
              avg(r.errores_incidencias) AS errores_incidencias,
              avg(r.calidad_servicio) AS calidad_servicio,
              avg(r.cursos) AS cursos,
              avg(r.encuestas) AS encuestas,
              avg(r.antiguedad) AS antiguedad,
              avg(r.porcentaje_final) AS porcentaje_final
            FROM medicion.resultado_final r
            JOIN medicion.periodo_evaluacion p USING (periodo_id)
            GROUP BY r.periodo_id, p.nombre, p.fecha_inicio
            ORDER BY p.fecha_inicio DESC, r.periodo_id DESC`),
          isSupervisor
            ? pool.query(`SELECT c.*, ce.nombre AS centro_nombre, s.nombre AS supervisor_nombre,
              u.correo, u.usuario_id, COALESCE(tc.tareas_total,0) AS tareas_total,
              COALESCE(tc.tareas_completadas,0) AS tareas_completadas
            FROM medicion.cajero c
            LEFT JOIN medicion.centro ce ON ce.centro_id=c.centro_id
            LEFT JOIN medicion.usuario s ON s.usuario_id=c.supervisor_id
            LEFT JOIN medicion.usuario u ON u.cajero_id=c.cajero_id
            LEFT JOIN (SELECT cajero_id, count(*)::integer AS tareas_total,
              count(*) FILTER (WHERE estado='Completada')::integer AS tareas_completadas
              FROM medicion.tarea GROUP BY cajero_id) tc ON tc.cajero_id=c.cajero_id
            ORDER BY c.numero_empleado`)
            : Promise.resolve({ rows: [] }),
        ]);
        return json(res, 200, {
          cashiers: cashiers.rows,
          regionalCashiers: regionalCashiers.rows,
          tasks: tasks.rows,
          results: results.rows,
          periods: periods.rows,
          criteria: criteria.rows,
          centers: centers.rows,
          operations: operations.rows,
          measures: measures.rows,
          monthlyAverages: monthlyAverages.rows,
        });
      }
      if (path === '/api/profile' && req.method === 'PATCH') {
        authorize();
        const b = await body(req);
        const name = text(b.nombre, 'Nombre', 120);
        await transaction(pool, async (c) => {
          await c.query('UPDATE medicion.usuario SET nombre=$1 WHERE usuario_id=$2', [
            name,
            session.usuario_id,
          ]);
          if (session.cajero_id)
            await c.query('UPDATE medicion.cajero SET nombre_completo=$1 WHERE cajero_id=$2', [
              name,
              session.cajero_id,
            ]);
        });
        return json(res, 200, { ok: true });
      }
      if (path === '/api/password' && req.method === 'POST') {
        authorize();
        const b = await body(req);
        if (typeof b.actual !== 'string' || b.actual.length > 128 || !passwordValid(b.nueva))
          fail(400, 'La nueva contraseña debe tener entre 10 y 128 caracteres.');
        if (!(await verifyPassword(b.actual, session.password_hash)))
          fail(400, 'La contraseña actual no es correcta.');
        await transaction(pool, async (c) => {
          await c.query('UPDATE medicion.usuario SET password_hash=$1 WHERE usuario_id=$2', [
            await hashPassword(b.nueva),
            session.usuario_id,
          ]);
          await c.query('DELETE FROM medicion.sesion WHERE usuario_id=$1 AND token_hash<>$2', [
            session.usuario_id,
            tokenHash(cookie),
          ]);
        });
        return json(res, 200, { ok: true });
      }
      if (path === '/api/users' && req.method === 'POST') {
        authorize('supervisor');
        const b = await body(req);
        const name = text(b.nombre, 'Nombre', 120),
          email = text(b.correo, 'Correo', 254).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Correo no válido.');
        if (!passwordValid(b.contrasena))
          fail(400, 'La contraseña debe tener entre 10 y 128 caracteres.');
        if (!['cajero', 'supervisor'].includes(b.rol)) fail(400, 'Rol no válido.');
        const hash = await hashPassword(b.contrasena);
        await transaction(pool, async (c) => {
          let cashierId = null;
          if (b.rol === 'cajero') {
            if (b.cajero_id) {
              cashierId = integer(b.cajero_id, 'Cajero');
              const found = await c.query(
                'SELECT nombre_completo FROM medicion.cajero WHERE cajero_id=$1 AND supervisor_id=$2',
                [cashierId, session.usuario_id],
              );
              if (!found.rowCount) fail(400, 'Cajero no encontrado.');
            } else {
              const employee = integer(b.numero_empleado, 'Número de empleado'),
                joined = date(b.fecha_ingreso, 'Fecha de ingreso'),
                center = integer(b.centro_id, 'Centro');
              if (employee < 100000 || employee > 999999)
                fail(400, 'El número de empleado debe tener seis dígitos.');
              const assigned = await c.query('SELECT 1 FROM medicion.centro WHERE centro_id=$1', [
                center,
              ]);
              if (!assigned.rowCount) fail(400, 'Centro no encontrado.');
              const row = await c.query(
                'INSERT INTO medicion.cajero(numero_empleado,nombre_completo,fecha_ingreso,centro_id,supervisor_id) VALUES ($1,$2,$3,$4,$5) RETURNING cajero_id',
                [employee, name, joined, center, session.usuario_id],
              );
              cashierId = row.rows[0].cajero_id;
            }
          }
          await c.query(
            'INSERT INTO medicion.usuario(nombre,correo,password_hash,rol,cajero_id) VALUES ($1,$2,$3,$4,$5)',
            [name, email, hash, b.rol, cashierId],
          );
        });
        return json(res, 201, { ok: true });
      }
      if (path === '/api/tasks' && req.method === 'POST') {
        authorize('supervisor');
        const b = await body(req);
        if (!['Alta', 'Media', 'Baja'].includes(b.prioridad)) fail(400, 'Prioridad inválida.');
        if (typeof b.descripcion !== 'string' || b.descripcion.length > 3000)
          fail(400, 'Descripción inválida.');
        const cashier = integer(b.cajero_id, 'Cajero');
        const assigned = await pool.query(
          'SELECT 1 FROM medicion.cajero WHERE cajero_id=$1 AND supervisor_id=$2',
          [cashier, session.usuario_id],
        );
        if (!assigned.rowCount) fail(403, 'El cajero no pertenece a tu equipo.');
        const data = await pool.query(
          `INSERT INTO medicion.tarea(titulo,descripcion,cajero_id,supervisor_id,prioridad,fecha_limite)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING tarea_id`,
          [
            text(b.titulo, 'Título'),
            b.descripcion,
            cashier,
            session.usuario_id,
            b.prioridad,
            date(b.fecha_limite, 'Fecha límite'),
          ],
        );
        return json(res, 201, { tarea_id: data.rows[0].tarea_id });
      }
      const taskMatch = path.match(/^\/api\/tasks\/(\d+)$/);
      if (taskMatch && req.method === 'PATCH') {
        authorize();
        const b = await body(req);
        if (!['Pendiente', 'En progreso', 'Completada'].includes(b.estado))
          fail(400, 'Estado inválido.');
        const id = integer(taskMatch[1], 'Tarea');
        const params = [b.estado, id];
        if (session.rol === 'cajero') params.push(session.cajero_id);
        else params.push(session.usuario_id);
        const data = await pool.query(
          `UPDATE medicion.tarea SET estado=$1, completada_en=CASE WHEN $1='Completada' THEN COALESCE(completada_en,now()) ELSE NULL END
          WHERE tarea_id=$2 AND ${
            session.rol === 'cajero'
              ? 'cajero_id=$3'
              : 'EXISTS (SELECT 1 FROM medicion.cajero c WHERE c.cajero_id=medicion.tarea.cajero_id AND c.supervisor_id=$3)'
          }
          RETURNING tarea_id`,
          params,
        );
        if (!data.rowCount) fail(404, 'Tarea no encontrada.');
        return json(res, 200, { ok: true });
      }
      if (path === '/api/periods' && req.method === 'POST') {
        authorize('supervisor');
        const b = await body(req);
        const start = date(b.fecha_inicio, 'Fecha inicial'),
          end = date(b.fecha_fin, 'Fecha final');
        if (end < start || (Date.parse(end) - Date.parse(start)) / 86400000 > 366)
          fail(400, 'El período debe durar de 1 a 367 días.');
        const row = await pool.query(
          'INSERT INTO medicion.periodo_evaluacion(nombre,fecha_inicio,fecha_fin) VALUES ($1,$2,$3) RETURNING periodo_id',
          [text(b.nombre, 'Nombre del período', 100), start, end],
        );
        return json(res, 201, { periodo_id: row.rows[0].periodo_id });
      }
      if (path === '/api/measurements' && req.method === 'POST') {
        authorize('supervisor');
        const b = await body(req);
        const period = integer(b.periodo_id, 'Período'),
          cashier = integer(b.cajero_id, 'Cajero');
        const assigned = await pool.query(
          'SELECT 1 FROM medicion.cajero WHERE cajero_id=$1 AND supervisor_id=$2',
          [cashier, session.usuario_id],
        );
        if (!assigned.rowCount) fail(403, 'El cajero no pertenece a tu equipo.');
        const keys = [
          'disciplinario',
          'entrega_valores',
          'faltantes_sobrantes',
          'errores_incidencias',
          'calidad_servicio',
          'cursos',
          'encuestas',
        ];
        if (!b.valores || typeof b.valores !== 'object') fail(400, 'Valores inválidos.');
        const values = keys.map((k) => {
          const v = b.valores[k];
          if (
            v === '' ||
            v === null ||
            v === undefined ||
            typeof v === 'boolean' ||
            !Number.isFinite(Number(v)) ||
            Number(v) < 0 ||
            Number(v) > 9999999999
          )
            fail(400, 'Completa todos los criterios con valores válidos.');
          if (k !== 'faltantes_sobrantes' && !Number.isInteger(Number(v)))
            fail(400, 'Los conteos deben ser enteros.');
          if (['cursos', 'encuestas'].includes(k) && ![0, 1].includes(Number(v)))
            fail(400, 'Cursos y encuestas deben ser 0 o 1.');
          if (k === 'disciplinario' && Number(v) > 3)
            fail(400, 'El código disciplinario debe estar entre 0 y 3.');
          return Number(v);
        });
        await transaction(pool, async (c) => {
          await c.query(
            'INSERT INTO medicion.cajero_periodo(periodo_id,cajero_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [period, cashier],
          );
          for (const [i, k] of keys.entries())
            await c.query(
              `INSERT INTO medicion.medicion_criterio_cajero(periodo_id,cajero_id,criterio_codigo,valor)
            VALUES ($1,$2,$3,$4) ON CONFLICT (periodo_id,cajero_id,criterio_codigo) DO UPDATE SET valor=EXCLUDED.valor`,
              [period, cashier, k, values[i]],
            );
        });
        return json(res, 200, { ok: true });
      }
      if (path === '/api/operations' && req.method === 'POST') {
        authorize('supervisor');
        const b = await body(req);
        const period = integer(b.periodo_id, 'Período'),
          cashier = integer(b.cajero_id, 'Cajero'),
          center = integer(b.centro_id, 'Centro'),
          day = date(b.fecha, 'Fecha');
        const assigned = await pool.query(
          'SELECT 1 FROM medicion.cajero WHERE cajero_id=$1 AND supervisor_id=$2 AND centro_id=$3',
          [cashier, session.usuario_id, center],
        );
        if (!assigned.rowCount) fail(403, 'El cajero o el centro no pertenece a tu equipo.');
        const operations = Number(b.operaciones);
        if (
          b.operaciones === '' ||
          !Number.isSafeInteger(operations) ||
          operations < 0 ||
          operations > 2147483647
        )
          fail(400, 'Operaciones no válidas.');
        await transaction(pool, async (c) => {
          const p = await c.query(
            'SELECT 1 FROM medicion.periodo_evaluacion WHERE periodo_id=$1 AND $2::date BETWEEN fecha_inicio AND fecha_fin',
            [period, day],
          );
          if (!p.rowCount) fail(400, 'La fecha debe estar dentro del período elegido.');
          await c.query(
            'INSERT INTO medicion.cajero_periodo(periodo_id,cajero_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [period, cashier],
          );
          await c.query(
            `INSERT INTO medicion.operacion_sicatel_diaria(periodo_id,cajero_id,centro_id,fecha,operaciones) VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT (periodo_id,cajero_id,centro_id,fecha) DO UPDATE SET operaciones=EXCLUDED.operaciones`,
            [period, cashier, center, day, operations],
          );
        });
        return json(res, 200, { ok: true });
      }
      if (path.startsWith('/api/')) fail(404, 'Ruta no encontrada.');
      if (!['GET', 'HEAD'].includes(req.method)) fail(405, 'Método no permitido.');
      const assets = new Map([
        ['/', 'index.html'],
        ['/index.html', 'index.html'],
        ['/usuarioempleado.html', 'usuarioempleado.html'],
        ['/usuariosupervisor.html', 'usuariosupervisor.html'],
        ['/styles.css', 'styles.css'],
        ['/celtel.css', 'celtel.css'],
        ['/celtel-logo.svg', 'celtel-logo.svg'],
        ['/celtel-icon.svg', 'celtel-icon.svg'],
        ['/app.js', 'app.js'],
      ]);
      const file = assets.get(path);
      if (!file) fail(404, 'Página no encontrada.');
      if (file === 'index.html' && session) {
        res.writeHead(302, { Location: pageFor(session.rol) });
        return res.end();
      }
      if (['usuarioempleado.html', 'usuariosupervisor.html'].includes(file)) {
        if (!session) {
          res.writeHead(302, { Location: '/' });
          return res.end();
        }
        if (file !== pageFor(session.rol).slice(1)) {
          res.writeHead(302, { Location: pageFor(session.rol) });
          return res.end();
        }
      }
      const content = await readFile(new URL(`./public/${file}`, import.meta.url));
      res.writeHead(200, {
        'Content-Type': file.endsWith('.css')
          ? 'text/css; charset=utf-8'
          : file.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : file.endsWith('.svg')
              ? 'image/svg+xml'
              : 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      return res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) {
      if (!e.status) console.error('Error de solicitud:', e.code || e.message);
      const message = e.status
        ? e.message
        : e.code === '23505'
          ? 'Ese correo, empleado o período ya existe.'
          : e.code === '23503'
            ? 'El registro relacionado no existe.'
            : 'No fue posible guardar o consultar los datos. Revisa la conexión con PostgreSQL.';
      if (!res.headersSent)
        json(res, e.status || (['23505', '23503', '23514'].includes(e.code) ? 400 : 500), {
          error: message,
        });
      else res.end();
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const pool = createPool();
  await pool.query('SELECT 1');
  const server = createApp(pool);
  server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () =>
    console.log(
      `Medición lista: http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3000}`,
    ),
  );
  const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
