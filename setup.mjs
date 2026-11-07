import pg from 'pg';
import { readFile } from 'node:fs/promises';

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
  await client.query(await readFile(new URL('./medicion_schema.sql', import.meta.url), 'utf8'));
  await client.query('BEGIN');
  await client.query(
    await readFile(new URL('./migrations/001_portal.sql', import.meta.url), 'utf8'),
  );
  await client.query(
    await readFile(new URL('./migrations/002_asignaciones.sql', import.meta.url), 'utf8'),
  );

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
  await client.query('COMMIT');
  console.log(`Base ${database}, esquema, rol y permisos listos.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('No se pudo configurar PostgreSQL:', error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
