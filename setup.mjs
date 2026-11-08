import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { hashPassword } from './auth.mjs';

const schemaSql = String.raw`
CREATE SCHEMA IF NOT EXISTS medicion;
SET search_path TO medicion, public;

CREATE TABLE IF NOT EXISTS centro (
    centro_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo          integer NOT NULL UNIQUE,
    nombre          text NOT NULL
);

CREATE TABLE IF NOT EXISTS cajero (
    cajero_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero_empleado integer NOT NULL UNIQUE,
    nombre_completo text NOT NULL,
    fecha_ingreso   date NOT NULL,
    centro_id       bigint REFERENCES centro(centro_id)
);

CREATE TABLE IF NOT EXISTS periodo_evaluacion (
    periodo_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          text NOT NULL,
    fecha_inicio    date NOT NULL,
    fecha_fin       date NOT NULL,
    CONSTRAINT periodo_fechas_validas CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT periodo_nombre_unico UNIQUE (nombre, fecha_inicio, fecha_fin)
);

CREATE TABLE IF NOT EXISTS cajero_periodo (
    periodo_id      bigint NOT NULL REFERENCES periodo_evaluacion(periodo_id) ON DELETE CASCADE,
    cajero_id       bigint NOT NULL REFERENCES cajero(cajero_id),
    PRIMARY KEY (periodo_id, cajero_id)
);

CREATE TABLE IF NOT EXISTS criterio (
    codigo          text PRIMARY KEY,
    nombre          text NOT NULL UNIQUE,
    peso_maximo     numeric(6,5) NOT NULL CHECK (peso_maximo BETWEEN 0 AND 1),
    metodo_calculo  text NOT NULL CHECK (metodo_calculo IN ('reglas', 'sicatel', 'antiguedad')),
    descripcion     text NOT NULL
);

CREATE TABLE IF NOT EXISTS regla_criterio (
    regla_id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    criterio_codigo text NOT NULL REFERENCES criterio(codigo) ON DELETE CASCADE,
    minimo          numeric(12,2) NOT NULL,
    maximo          numeric(12,2),
    puntaje         numeric(6,5) NOT NULL CHECK (puntaje BETWEEN 0 AND 1),
    CONSTRAINT regla_intervalo_valido CHECK (maximo IS NULL OR maximo >= minimo),
    CONSTRAINT regla_puntaje_no_supera_criterio
        CHECK (puntaje <= 1)
);

CREATE TABLE IF NOT EXISTS medicion_criterio_cajero (
    periodo_id      bigint NOT NULL,
    cajero_id       bigint NOT NULL,
    criterio_codigo text NOT NULL REFERENCES criterio(codigo),
    valor           numeric(12,2) NOT NULL CHECK (valor >= 0),
    PRIMARY KEY (periodo_id, cajero_id, criterio_codigo),
    FOREIGN KEY (periodo_id, cajero_id)
        REFERENCES cajero_periodo(periodo_id, cajero_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operacion_sicatel_diaria (
    periodo_id      bigint NOT NULL,
    cajero_id       bigint NOT NULL,
    centro_id       bigint NOT NULL REFERENCES centro(centro_id),
    fecha           date NOT NULL,
    operaciones     integer NOT NULL CHECK (operaciones >= 0),
    PRIMARY KEY (periodo_id, cajero_id, centro_id, fecha),
    FOREIGN KEY (periodo_id, cajero_id)
        REFERENCES cajero_periodo(periodo_id, cajero_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sicatel_periodo_centro_fecha
    ON operacion_sicatel_diaria (periodo_id, centro_id, fecha);

INSERT INTO criterio (codigo, nombre, peso_maximo, metodo_calculo, descripcion) VALUES
    ('disciplinario', 'Amonestaciones, faltas y suspensiones', 0.30, 'reglas',
     'Valor: 0 sin incidencia; 1 amonestación; 2 suspensión; 3 falta. Si hay varias incidencias se debe registrar la de mayor severidad.'),
    ('sicatel', 'Pagos SAICEL', 0.29, 'sicatel',
     '29% por el promedio diario de operaciones del cajero entre el máximo de operaciones de su centro en ese día.'),
    ('entrega_valores', 'Entrega de valores', 0.15, 'reglas',
     'Valor: número de envases retenidos o incidencias del período.'),
    ('faltantes_sobrantes', 'Faltantes y sobrantes', 0.10, 'reglas',
     'Valor: importe absoluto en pesos que se evaluará contra los rangos.'),
    ('errores_incidencias', 'Errores o incidencias', 0.05, 'reglas',
     'Valor: número de errores o incidencias del período.'),
    ('calidad_servicio', 'Calidad en el servicio', 0.05, 'reglas',
     'Valor: número de buzones o incidencias de calidad del período.'),
    ('cursos', 'Cursos', 0.03, 'reglas',
     'Valor: 1 si completó los cursos mandatorios; 0 si no los completó.'),
    ('encuestas', 'Encuestas', 0.02, 'reglas',
     'Valor: 1 si cumplió con la campaña GSI; 0 si no la cumplió.'),
    ('antiguedad', 'Antigüedad', 0.01, 'antiguedad',
     'Hasta 1%, proporcional a los días hábiles desde fecha_ingreso hasta el fin del período frente al mayor valor del período.')
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    peso_maximo = EXCLUDED.peso_maximo,
    metodo_calculo = EXCLUDED.metodo_calculo,
    descripcion = EXCLUDED.descripcion;

INSERT INTO regla_criterio (criterio_codigo, minimo, maximo, puntaje)
SELECT * FROM (VALUES
    ('disciplinario',       0.00,   0.00, 0.30),
    ('disciplinario',       1.00,   1.00, 0.20),
    ('disciplinario',       2.00,   2.00, 0.10),
    ('disciplinario',       3.00,   NULL, 0.00),
    ('entrega_valores',     0.00,   0.00, 0.15),
    ('entrega_valores',     1.00,   2.00, 0.10),
    ('entrega_valores',     3.00,   4.00, 0.05),
    ('entrega_valores',     5.00,   NULL, 0.00),
    ('faltantes_sobrantes', 0.00,  50.00, 0.10),
    ('faltantes_sobrantes',50.01, 100.00, 0.09),
    ('faltantes_sobrantes',100.01,200.00, 0.08),
    ('faltantes_sobrantes',200.01,300.00, 0.07),
    ('faltantes_sobrantes',300.01,400.00, 0.06),
    ('faltantes_sobrantes',400.01,500.00, 0.05),
    ('faltantes_sobrantes',500.01,600.00, 0.04),
    ('faltantes_sobrantes',600.01,700.00, 0.03),
    ('faltantes_sobrantes',700.01,800.00, 0.02),
    ('faltantes_sobrantes',800.01,900.00, 0.01),
    ('faltantes_sobrantes',900.01,  NULL, 0.00),
    ('errores_incidencias', 0.00,   0.00, 0.05),
    ('errores_incidencias', 1.00,   2.00, 0.03),
    ('errores_incidencias', 3.00,   4.00, 0.02),
    ('errores_incidencias', 5.00,   NULL, 0.00),
    ('calidad_servicio',    0.00,   0.00, 0.05),
    ('calidad_servicio',    1.00,   2.00, 0.03),
    ('calidad_servicio',    3.00,   NULL, 0.00),
    ('cursos',              0.00,   0.00, 0.00),
    ('cursos',              1.00,   1.00, 0.03),
    ('encuestas',           0.00,   0.00, 0.00),
    ('encuestas',           1.00,   1.00, 0.02)
) AS nuevas_reglas(criterio_codigo, minimo, maximo, puntaje)
WHERE NOT EXISTS (
    SELECT 1
    FROM regla_criterio r
    WHERE r.criterio_codigo = nuevas_reglas.criterio_codigo
      AND r.minimo = nuevas_reglas.minimo
      AND r.maximo IS NOT DISTINCT FROM nuevas_reglas.maximo
);

CREATE OR REPLACE VIEW resultado_final AS
WITH dias_habiles AS (
    SELECT cp.periodo_id,
           cp.cajero_id,
           count(*) FILTER (WHERE extract(isodow FROM dia)::integer BETWEEN 1 AND 5) AS dias_antiguedad
    FROM cajero_periodo cp
    JOIN cajero c ON c.cajero_id = cp.cajero_id
    JOIN periodo_evaluacion p ON p.periodo_id = cp.periodo_id
    CROSS JOIN LATERAL generate_series(
        c.fecha_ingreso, p.fecha_fin, interval '1 day'
    ) AS dia
    GROUP BY cp.periodo_id, cp.cajero_id
),
antiguedad AS (
    SELECT periodo_id,
           cajero_id,
           0.01 * dias_antiguedad / NULLIF(max(dias_antiguedad) OVER (PARTITION BY periodo_id), 0) AS puntaje
    FROM dias_habiles
),
maximo_diario AS (
    SELECT periodo_id, centro_id, fecha, max(operaciones) AS operaciones_maximas
    FROM operacion_sicatel_diaria
    GROUP BY periodo_id, centro_id, fecha
),
sicatel AS (
    SELECT o.periodo_id,
           o.cajero_id,
           0.29 * avg(o.operaciones::numeric / NULLIF(m.operaciones_maximas, 0)) AS puntaje
    FROM operacion_sicatel_diaria o
    JOIN maximo_diario m USING (periodo_id, centro_id, fecha)
    GROUP BY o.periodo_id, o.cajero_id
),
por_regla AS (
    SELECT m.periodo_id,
           m.cajero_id,
           m.criterio_codigo,
           r.puntaje
    FROM medicion_criterio_cajero m
    JOIN regla_criterio r
      ON r.criterio_codigo = m.criterio_codigo
     AND m.valor >= r.minimo
     AND (r.maximo IS NULL OR m.valor <= r.maximo)
),
componentes AS (
    SELECT cp.periodo_id,
           cp.cajero_id,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'disciplinario'), 0) AS disciplinario,
           COALESCE(s.puntaje, 0) AS sicatel,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'entrega_valores'), 0) AS entrega_valores,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'faltantes_sobrantes'), 0) AS faltantes_sobrantes,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'errores_incidencias'), 0) AS errores_incidencias,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'calidad_servicio'), 0) AS calidad_servicio,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'cursos'), 0) AS cursos,
           COALESCE(max(pr.puntaje) FILTER (WHERE pr.criterio_codigo = 'encuestas'), 0) AS encuestas,
           COALESCE(a.puntaje, 0) AS antiguedad
    FROM cajero_periodo cp
    LEFT JOIN por_regla pr ON pr.periodo_id = cp.periodo_id AND pr.cajero_id = cp.cajero_id
    LEFT JOIN sicatel s ON s.periodo_id = cp.periodo_id AND s.cajero_id = cp.cajero_id
    LEFT JOIN antiguedad a ON a.periodo_id = cp.periodo_id AND a.cajero_id = cp.cajero_id
    GROUP BY cp.periodo_id, cp.cajero_id, s.puntaje, a.puntaje
)
SELECT c.periodo_id,
       p.nombre AS periodo,
       c.cajero_id,
       j.numero_empleado,
       j.nombre_completo,
       c.disciplinario,
       c.sicatel,
       c.entrega_valores,
       c.faltantes_sobrantes,
       c.errores_incidencias,
       c.calidad_servicio,
       c.cursos,
       c.encuestas,
       c.antiguedad,
       c.disciplinario + c.sicatel + c.entrega_valores + c.faltantes_sobrantes
       + c.errores_incidencias + c.calidad_servicio + c.cursos + c.encuestas + c.antiguedad
       AS porcentaje_final
FROM componentes c
JOIN cajero j ON j.cajero_id = c.cajero_id
JOIN periodo_evaluacion p ON p.periodo_id = c.periodo_id;

CREATE TABLE IF NOT EXISTS medicion.usuario (
  usuario_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre text NOT NULL,
  correo text NOT NULL UNIQUE CHECK (correo = lower(correo)),
  password_hash text NOT NULL,
  rol text NOT NULL CHECK (rol IN ('cajero', 'supervisor')),
  cajero_id bigint UNIQUE REFERENCES medicion.cajero(cajero_id),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK ((rol = 'cajero' AND cajero_id IS NOT NULL) OR (rol = 'supervisor' AND cajero_id IS NULL))
);
CREATE TABLE IF NOT EXISTS medicion.sesion (
  token_hash text PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES medicion.usuario(usuario_id) ON DELETE CASCADE,
  csrf_token text NOT NULL,
  expira_en timestamptz NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sesion_expira ON medicion.sesion(expira_en);
CREATE TABLE IF NOT EXISTS medicion.tarea (
  tarea_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  titulo text NOT NULL CHECK (length(titulo) BETWEEN 1 AND 160),
  descripcion text NOT NULL DEFAULT '',
  cajero_id bigint NOT NULL REFERENCES medicion.cajero(cajero_id),
  supervisor_id bigint NOT NULL REFERENCES medicion.usuario(usuario_id),
  prioridad text NOT NULL CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
  fecha_limite date NOT NULL,
  estado text NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'En progreso', 'Completada')),
  completada_en timestamptz,
  creada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_tarea_cajero ON medicion.tarea(cajero_id);

ALTER TABLE medicion.cajero
  ADD COLUMN IF NOT EXISTS centro_id bigint REFERENCES medicion.centro(centro_id);

ALTER TABLE medicion.cajero
  ADD COLUMN IF NOT EXISTS supervisor_id bigint REFERENCES medicion.usuario(usuario_id);

CREATE INDEX IF NOT EXISTS ix_cajero_centro ON medicion.cajero(centro_id);
CREATE INDEX IF NOT EXISTS ix_cajero_supervisor ON medicion.cajero(supervisor_id);
`;

const host = process.env.PGHOST || '127.0.0.1';
const port = Number(process.env.PGPORT || 5432);
const database = process.env.PGDATABASE || 'Medicion';
const appUser = process.env.PGUSER || 'medicion_app';
const appPassword = process.env.PGPASSWORD;
const adminUser = process.env.PGADMIN_USER || 'postgres';
const adminPassword = process.env.PGADMIN_PASSWORD;
const maintenanceDatabase = process.env.PGADMIN_DATABASE || 'postgres';

if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(database)) {
  throw Error('PGDATABASE debe ser un identificador de PostgreSQL valido.');
}
if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(appUser) || appUser === adminUser) {
  throw Error('PGUSER debe ser un rol de aplicacion distinto del administrador.');
}
if (!appPassword || !adminPassword) {
  throw Error('Configura PGPASSWORD y PGADMIN_PASSWORD antes de ejecutar setup.');
}

const identifier = (value) => `"${value}"`;
const password = appPassword.replaceAll("'", "''");
const connection = {
  host,
  port,
  user: adminUser,
  password: adminPassword,
  connectionTimeoutMillis: 5000,
};

async function loadDemo(client) {
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
  if (!empty) return null;
  if (Number(state.criterios) !== 9 || Number(state.reglas) !== 30) {
    throw Error('No se encontraron los nueve criterios y las treinta reglas esperadas.');
  }
  const generated = !process.env.DEMO_PASSWORD;
  const password = process.env.DEMO_PASSWORD || randomBytes(18).toString('base64url');
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

  return { summary: result, password, generated };
}

async function main() {
  const maintenance = new pg.Client({ ...connection, database: maintenanceDatabase });
  try {
    await maintenance.connect();
    const existing = await maintenance.query('SELECT 1 FROM pg_database WHERE datname=$1', [database]);
    if (!existing.rowCount) {
      await maintenance.query(`CREATE DATABASE ${identifier(database)}`);
    }
  } finally {
    await maintenance.end().catch(() => {});
  }

  const client = new pg.Client({ ...connection, database });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query(schemaSql);
    const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [appUser]);
    if (existing.rowCount) {
      await client.query(`ALTER ROLE ${identifier(appUser)} LOGIN PASSWORD '${password}'`);
    } else {
      await client.query(
        `CREATE ROLE ${identifier(appUser)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`,
      );
    }

    await client.query(`GRANT CONNECT ON DATABASE ${identifier(database)} TO ${identifier(appUser)}`);
    await client.query(`GRANT USAGE ON SCHEMA medicion TO ${identifier(appUser)}`);
    await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA medicion TO ${identifier(appUser)}`);
    await client.query(
      `GRANT INSERT, UPDATE ON medicion.cajero, medicion.cajero_periodo,
       medicion.periodo_evaluacion, medicion.operacion_sicatel_diaria,
       medicion.medicion_criterio_cajero, medicion.usuario, medicion.tarea
       TO ${identifier(appUser)}`,
    );
    await client.query(`GRANT INSERT, DELETE ON medicion.sesion TO ${identifier(appUser)}`);
    await client.query(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA medicion TO ${identifier(appUser)}`,
    );
    const loaded = await loadDemo(client);
    await client.query('COMMIT');
    console.log(`Base ${database}, esquema, rol y permisos listos.`);
    if (loaded) {
      console.log(JSON.stringify(loaded.summary, null, 2));
      console.log('Supervisor de prueba: supervisor1@medicion.local');
      if (loaded.generated) console.log(`Clave de prueba generada: ${loaded.password}`);
    } else {
      console.log('No se agregaron datos de prueba porque la base ya contiene registros.');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error('No se pudo preparar PostgreSQL:', error.message);
  process.exitCode = 1;
});
