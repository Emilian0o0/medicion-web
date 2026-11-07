import pg from 'pg';
import { hashPassword } from './auth.mjs';

if (!process.env.PGADMIN_PASSWORD) {
  throw Error('Configura PGADMIN_PASSWORD para cargar los datos de demostracion.');
}

const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'Medicion',
  user: process.env.PGADMIN_USER || 'postgres',
  password: process.env.PGADMIN_PASSWORD,
  connectionTimeoutMillis: 5000,
});
const client = await pool.connect();
const password = process.env.DEMO_PASSWORD || 'Demo2026!Celtel';

try {
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '120s'");
  const counts = await client.query(`
    SELECT
      (SELECT count(*) FROM medicion.usuario) AS usuarios,
      (SELECT count(*) FROM medicion.cajero) AS cajeros,
      (SELECT count(*) FROM medicion.centro) AS centros,
      (SELECT count(*) FROM medicion.periodo_evaluacion) AS periodos,
      (SELECT count(*) FROM medicion.tarea) AS tareas,
      (SELECT count(*) FROM medicion.cajero_periodo) AS participaciones,
      (SELECT count(*) FROM medicion.usuario WHERE rol = 'supervisor') AS supervisores,
      (SELECT count(*) FROM medicion.criterio) AS criterios,
      (SELECT count(*) FROM medicion.regla_criterio) AS reglas
  `);
  const state = counts.rows[0];
  const empty = ['usuarios', 'cajeros', 'centros', 'periodos', 'tareas', 'participaciones'].every(
    (key) => Number(state[key]) === 0,
  );
  if (!empty) throw Error('La carga de demostracion requiere una base sin usuarios ni periodos.');
  if (Number(state.criterios) !== 9 || Number(state.reglas) !== 30) {
    throw Error('No se encontraron los nueve criterios y las treinta reglas esperadas.');
  }
  if (password.length < 10 || password.length > 128) {
    throw Error('La clave de demostracion debe tener entre 10 y 128 caracteres.');
  }

  await client.query(`
    INSERT INTO medicion.centro (codigo, nombre)
    SELECT 92000 + n, 'Centro demo ' || lpad(n::text, 2, '0')
    FROM generate_series(1, 70) AS n
  `);

  await client.query(`
    INSERT INTO medicion.cajero (numero_empleado, nombre_completo, fecha_ingreso)
    SELECT 100000 + ((n * 356267 + 123457) % 900000),
           'Cajero demo ' || lpad(n::text, 3, '0'),
           DATE '2024-01-02' + ((n * 29) % 670)
    FROM generate_series(1, 250) AS n
  `);

  const cashiers = await client.query(
    `
    SELECT cajero_id, numero_empleado, nombre_completo,
           right(nombre_completo, 3)::integer AS demo_numero
    FROM medicion.cajero
    WHERE nombre_completo ~ '^Cajero demo [0-9]{3}$'
      AND right(nombre_completo, 3)::integer BETWEEN 1 AND 250
    ORDER BY demo_numero
  `,
  );

  for (let n = 1; n <= 5; n++) {
    const hash = await hashPassword(password);
    await client.query(
      `
      INSERT INTO medicion.usuario (nombre, correo, password_hash, rol)
      VALUES ($1, $2, $3, 'supervisor')
    `,
      [`Supervisor demo ${String(n).padStart(2, '0')}`, `supervisor${n}@medicion.local`, hash],
    );
  }

  for (const cashier of cashiers.rows) {
    const hash = await hashPassword(password);
    await client.query(
      `
      INSERT INTO medicion.usuario (nombre, correo, password_hash, rol, cajero_id)
      VALUES ($1, $2, $3, 'cajero', $4)
    `,
      [
        cashier.nombre_completo,
        `cajero${String(cashier.demo_numero).padStart(3, '0')}@medicion.local`,
        hash,
        cashier.cajero_id,
      ],
    );
  }

  await client.query(`
    WITH asignacion AS (
      SELECT c.cajero_id,
             ((right(c.nombre_completo, 3)::integer - 1) * 73) % 250 AS lugar
      FROM medicion.cajero c
      WHERE c.nombre_completo ~ '^Cajero demo [0-9]{3}$'
    ), grupos AS (
      SELECT a.cajero_id,
             1 + (a.lugar / 50) AS supervisor_numero,
             1 + 14 * (a.lugar / 50) +
             CASE WHEN a.lugar % 50 < 32 THEN (a.lugar % 50) / 4
                  ELSE 8 + ((a.lugar % 50) - 32) / 3 END AS centro_numero
      FROM asignacion a
    )
    UPDATE medicion.cajero c
    SET centro_id = ce.centro_id, supervisor_id = u.usuario_id
    FROM grupos g
    JOIN medicion.centro ce ON ce.codigo = 92000 + g.centro_numero
    JOIN medicion.usuario u ON u.correo = 'supervisor' || g.supervisor_numero || '@medicion.local'
    WHERE c.cajero_id = g.cajero_id
  `);

  await client.query(`
    INSERT INTO medicion.periodo_evaluacion (nombre, fecha_inicio, fecha_fin)
    SELECT 'Evaluación ' ||
           (ARRAY['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre'])[mes] ||
           ' 2026',
           make_date(2026, mes, 1),
           (make_date(2026, mes, 1) + interval '1 month - 1 day')::date
    FROM generate_series(1, 9) AS mes
  `);

  await client.query(
    `
    INSERT INTO medicion.cajero_periodo (periodo_id, cajero_id)
    SELECT p.periodo_id, c.cajero_id
    FROM medicion.periodo_evaluacion p
    CROSS JOIN medicion.cajero c
    WHERE c.nombre_completo ~ '^Cajero demo [0-9]{3}$'
      AND right(c.nombre_completo, 3)::integer BETWEEN 1 AND 250
      AND NOT EXISTS (SELECT 1 FROM medicion.cajero_periodo cp WHERE cp.periodo_id=p.periodo_id AND cp.cajero_id=c.cajero_id)
  `,
  );

  const specialCashiers = await client.query(`
    SELECT cajero_id, centro_id, right(nombre_completo, 3) AS numero
    FROM medicion.cajero
    WHERE nombre_completo IN ('Cajero demo 001', 'Cajero demo 025')
    ORDER BY nombre_completo
  `);
  if (
    specialCashiers.rows.length !== 2 ||
    String(specialCashiers.rows[0].centro_id) !== String(specialCashiers.rows[1].centro_id)
  ) {
    throw Error('Los dos casos de septiembre deben pertenecer al mismo centro.');
  }

  await client.query(
    `
    WITH base AS (
      SELECT p.periodo_id, extract(month FROM p.fecha_inicio)::integer AS mes,
             c.cajero_id, c.numero_empleado,
             abs(hashtext(
               CASE WHEN extract(month FROM p.fecha_inicio)=9
                    THEN 'septiembre:' || c.numero_empleado::text
                    ELSE p.periodo_id::text || ':' || c.numero_empleado::text END
             )::bigint) AS semilla
      FROM medicion.cajero_periodo cp
      JOIN medicion.periodo_evaluacion p USING (periodo_id)
      JOIN medicion.cajero c USING (cajero_id)
      WHERE c.nombre_completo ~ '^Cajero demo [0-9]{3}$'
        AND right(c.nombre_completo, 3)::integer BETWEEN 1 AND 250
    )
    INSERT INTO medicion.medicion_criterio_cajero (periodo_id, cajero_id, criterio_codigo, valor)
    SELECT b.periodo_id, b.cajero_id, v.criterio_codigo, v.valor
    FROM base b
    CROSS JOIN LATERAL (VALUES
      ('disciplinario', CASE WHEN b.semilla % 20 = 0 THEN 3 WHEN b.semilla % 11 = 0 THEN 2 WHEN b.semilla % 5 = 0 THEN 1 ELSE 0 END::numeric),
      ('entrega_valores', ((b.semilla / 3) % 6)::numeric),
      ('faltantes_sobrantes', (((b.semilla / 7) % 1001)::numeric / 100 * 100)::numeric),
      ('errores_incidencias', ((b.semilla / 11) % 5)::numeric),
      ('calidad_servicio', ((b.semilla / 13) % 4)::numeric),
      ('cursos', CASE WHEN b.semilla % 7 = 0 THEN 0 ELSE 1 END::numeric),
      ('encuestas', CASE WHEN b.semilla % 6 = 0 THEN 0 ELSE 1 END::numeric)
    ) AS v(criterio_codigo, valor)
  `,
  );

  await client.query(
    `
    WITH base AS (
      SELECT p.periodo_id, p.fecha_inicio, p.fecha_fin,
             c.cajero_id, c.numero_empleado,
             ce.centro_id
      FROM medicion.cajero_periodo cp
      JOIN medicion.periodo_evaluacion p USING (periodo_id)
      JOIN medicion.cajero c USING (cajero_id)
      JOIN medicion.centro ce ON ce.centro_id = c.centro_id
      WHERE c.nombre_completo ~ '^Cajero demo [0-9]{3}$'
        AND right(c.nombre_completo, 3)::integer BETWEEN 1 AND 250
    )
    INSERT INTO medicion.operacion_sicatel_diaria
      (periodo_id, cajero_id, centro_id, fecha, operaciones)
    SELECT b.periodo_id, b.cajero_id, b.centro_id, dias.fecha,
           45 + (abs(hashtext(
             CASE WHEN extract(month FROM b.fecha_inicio)=9
                  THEN 'septiembre:' || b.numero_empleado::text || ':' || dias.fecha::text
                  ELSE b.numero_empleado::text || ':' || dias.fecha::text END
           )::bigint) % 91)::integer
    FROM base b
    CROSS JOIN LATERAL (
      SELECT dia::date AS fecha
      FROM generate_series(b.fecha_inicio, b.fecha_fin, interval '1 day') AS dia
      WHERE extract(isodow FROM dia)::integer BETWEEN 1 AND 5
      ORDER BY dia
      LIMIT 10
    ) AS dias
  `,
  );

  await client.query(`
    UPDATE medicion.medicion_criterio_cajero m
    SET valor = CASE WHEN m.criterio_codigo IN ('cursos', 'encuestas') THEN 1 ELSE 0 END
    FROM medicion.cajero c, medicion.periodo_evaluacion p
    WHERE m.cajero_id = c.cajero_id
      AND m.periodo_id = p.periodo_id
      AND p.fecha_inicio = DATE '2026-09-01'
      AND c.nombre_completo IN ('Cajero demo 001', 'Cajero demo 025')
  `);
  await client.query(`
    DELETE FROM medicion.operacion_sicatel_diaria o
    USING medicion.cajero c, medicion.periodo_evaluacion p
    WHERE o.cajero_id = c.cajero_id
      AND o.periodo_id = p.periodo_id
      AND p.fecha_inicio = DATE '2026-09-01'
      AND c.nombre_completo IN ('Cajero demo 001', 'Cajero demo 025')
  `);
  await client.query(`
    INSERT INTO medicion.operacion_sicatel_diaria
      (periodo_id, cajero_id, centro_id, fecha, operaciones)
    SELECT p.periodo_id, c.cajero_id, c.centro_id, DATE '2026-09-15',
           CASE WHEN c.nombre_completo = 'Cajero demo 001' THEN 50 ELSE 100 END
    FROM medicion.cajero c
    CROSS JOIN medicion.periodo_evaluacion p
    WHERE p.fecha_inicio = DATE '2026-09-01'
      AND c.nombre_completo IN ('Cajero demo 001', 'Cajero demo 025')
  `);

  await client.query(
    `
    WITH base AS (
      SELECT p.fecha_inicio, p.fecha_fin,
             c.cajero_id, c.numero_empleado,
             abs(hashtext(p.periodo_id::text || ':t:' || c.numero_empleado::text)::bigint) AS semilla
      FROM medicion.cajero_periodo cp
      JOIN medicion.periodo_evaluacion p USING (periodo_id)
      JOIN medicion.cajero c USING (cajero_id)
      WHERE c.nombre_completo ~ '^Cajero demo [0-9]{3}$'
        AND right(c.nombre_completo, 3)::integer BETWEEN 1 AND 250
        AND extract(month FROM p.fecha_inicio) <= 8
    )
    INSERT INTO medicion.tarea
      (titulo, descripcion, cajero_id, supervisor_id, prioridad, fecha_limite, estado, completada_en, creada_en)
    SELECT
      (ARRAY['Revisar corte del turno', 'Validar comprobantes', 'Actualizar bitácora', 'Conciliar operaciones SAICEL'])[1 + (b.semilla % 4)::integer],
      'Actividad ficticia para probar el seguimiento mensual.',
      b.cajero_id,
      u.usuario_id,
      (ARRAY['Alta', 'Media', 'Baja'])[1 + ((b.semilla / 3) % 3)::integer],
      b.fecha_inicio + 12 + ((b.semilla / 5) % 12)::integer,
      CASE WHEN extract(month FROM b.fecha_inicio) = 8 AND b.semilla % 8 = 0 THEN 'En progreso'
           ELSE 'Completada' END,
      CASE WHEN extract(month FROM b.fecha_inicio) = 8 AND b.semilla % 8 = 0 THEN NULL
           ELSE (b.fecha_inicio + 10 + ((b.semilla / 7) % 10)::integer)::timestamp AT TIME ZONE 'America/Mexico_City' END,
      (b.fecha_inicio + 2)::timestamp AT TIME ZONE 'America/Mexico_City'
    FROM base b
    JOIN medicion.cajero c ON c.cajero_id=b.cajero_id
    JOIN medicion.usuario u ON u.usuario_id=c.supervisor_id
  `,
  );

  const summary = await client.query(`
    SELECT
      (SELECT count(*) FROM medicion.usuario WHERE rol = 'cajero') AS cuentas_cajero,
      (SELECT count(*) FROM medicion.usuario WHERE rol = 'supervisor') AS supervisores,
      (SELECT count(*) FROM medicion.centro) AS centros,
      (SELECT count(*) FROM medicion.periodo_evaluacion) AS periodos,
      (SELECT count(*) FROM medicion.cajero_periodo) AS participaciones,
      (SELECT count(*) FROM medicion.medicion_criterio_cajero) AS mediciones,
      (SELECT count(*) FROM medicion.operacion_sicatel_diaria) AS operaciones,
      (SELECT count(*) FROM medicion.tarea) AS tareas
  `);
  const result = summary.rows[0];
  const asignaciones = await client.query(`
    SELECT
      (SELECT count(*) FROM medicion.cajero WHERE centro_id IS NULL OR supervisor_id IS NULL) AS sin_asignar,
      (SELECT count(*) FROM (
        SELECT centro_id FROM medicion.cajero GROUP BY centro_id HAVING count(*) NOT BETWEEN 3 AND 4
      ) x) AS centros_incorrectos,
      (SELECT count(*) FROM (
        SELECT supervisor_id FROM medicion.cajero GROUP BY supervisor_id HAVING count(*) <> 50
      ) x) AS supervisores_incorrectos,
      (SELECT count(*) FROM medicion.operacion_sicatel_diaria o
        JOIN medicion.cajero c USING (cajero_id) WHERE o.centro_id <> c.centro_id) AS operaciones_otro_centro,
      (SELECT count(*) FROM medicion.tarea t
        JOIN medicion.cajero c USING (cajero_id) WHERE t.supervisor_id <> c.supervisor_id) AS tareas_otro_supervisor
  `);
  const asignacion = asignaciones.rows[0];
  if (
    Number(result.cuentas_cajero) !== 250 ||
    Number(result.supervisores) !== 5 ||
    Number(result.centros) !== 70 ||
    Number(result.periodos) !== 9 ||
    Number(result.participaciones) !== 2250 ||
    Number(result.mediciones) !== 15750 ||
    Number(result.operaciones) !== 22482 ||
    Number(result.tareas) !== 2000 ||
    Object.values(asignacion).some((value) => Number(value) !== 0)
  ) {
    throw Error('La carga no produjo las cantidades esperadas.');
  }

  await client.query('COMMIT');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await client.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
