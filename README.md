# Instrucciones para reeplicar el programa

- Hay que tener PostgreSQL 18, Node.js 24 o posterior y pnpm
- Abrir pawershell y ejecutar:
  
git clone https://github.com/Emilian0o0/medicion-web.git /n
cd medicion-web /n
Copy-Item .env.example .env
notepad .env

-En .env, cambia PGADMIN_PASSWORD por la contraseña real del usuario postgres.
- En PGPASSWORD, elige una contraseña para la cuenta que usará la aplicación.
- luego hay que ejecutar

pnpm install --frozen-lockfile
pnpm setup
pnpm start

-abrir http://127.0.0.1:3000
