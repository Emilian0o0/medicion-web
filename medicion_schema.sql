BEGIN;

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

COMMIT;
