ALTER TABLE medicion.cajero
  ADD COLUMN IF NOT EXISTS centro_id bigint REFERENCES medicion.centro(centro_id);

ALTER TABLE medicion.cajero
  ADD COLUMN IF NOT EXISTS supervisor_id bigint REFERENCES medicion.usuario(usuario_id);

CREATE INDEX IF NOT EXISTS ix_cajero_centro ON medicion.cajero(centro_id);
CREATE INDEX IF NOT EXISTS ix_cajero_supervisor ON medicion.cajero(supervisor_id);
