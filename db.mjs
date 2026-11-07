import pg from 'pg';

export function createPool() {
  return new pg.Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'Medicion',
    user: process.env.PGUSER || 'medicion_app',
    password: process.env.PGPASSWORD,
    max: 8,
    connectionTimeoutMillis: 5000,
    options: '-c timezone=America/Mexico_City -c statement_timeout=10000',
  });
}
