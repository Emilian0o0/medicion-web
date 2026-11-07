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
