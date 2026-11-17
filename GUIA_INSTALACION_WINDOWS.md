# Cómo instalar y ejecutar Medición en Windows desde cero

Esta guía permite preparar una computadora para probar el portal de cajeros y supervisores. Está escrita para Windows 10 u 11 de 64 bits, con procesador Intel o AMD. Si tu equipo usa macOS, Linux o un procesador ARM, solicita las instrucciones correspondientes antes de instalar estos programas.

Al terminar tendrás una base PostgreSQL con datos ficticios y podrás entrar al portal desde el navegador. Cada computadora tendrá su propia base: los cambios de una persona no aparecerán en la computadora de otra.

Guía revisada el 16 de noviembre de 2026 para el proyecto [Emilian0o0/medicion-web](https://github.com/Emilian0o0/medicion-web).

## Contenido

- [Antes de comenzar](#antes-de-comenzar)
- [1. Node.js](#1-instalar-nodejs)
- [2. pnpm](#2-instalar-pnpm)
- [3. PostgreSQL 18](#3-instalar-postgresql-18)
- [4. Comprobar PostgreSQL](#4-comprobar-postgresql-y-su-contraseña)
- [5. Descargar el proyecto](#5-descargar-y-extraer-el-proyecto)
- [6. Abrir la carpeta correcta en PowerShell](#6-abrir-powershell-dentro-del-proyecto)
- [7. Configurar .env y las contraseñas](#7-crear-y-completar-el-archivo-env)
- [8. Instalar dependencias](#8-descargar-las-dependencias-del-proyecto)
- [9. Crear y llenar la base](#9-crear-la-base-y-cargar-los-datos-de-prueba)
- [10. Encender el portal](#10-encender-el-portal)
- [11. Iniciar sesión](#11-entrar-y-comprobar-el-funcionamiento)
- [12. Volver a abrirlo otro día](#12-detenerlo-y-volver-a-abrirlo-otro-día)
- [13. Consultar la base en pgAdmin](#13-ver-la-base-directamente-en-pgadmin-si-lo-necesitas)
- [14. Resolver errores](#14-problemas-frecuentes)

## Antes de comenzar

Necesitas conexión a internet, un navegador y permiso para instalar programas en Windows. Si la computadora es de la escuela o del trabajo y solicita una contraseña de administrador que desconoces, pide ayuda al responsable del equipo.

Sigue los pasos en orden. Cuando un paso muestre un error, resuélvelo antes de continuar. Al final de la guía hay soluciones para los errores más comunes.

| Programa | Para qué sirve | Versión que usaremos |
| --- | --- | --- |
| PostgreSQL | Guarda usuarios, tareas y evaluaciones | 18, con la actualización disponible de esa versión |
| Node.js | Ejecuta el servidor del portal | 24 LTS; el proyecto también admite versiones posteriores |
| npm | Permite instalar pnpm; se instala junto con Node.js | La incluida con Node.js |
| pnpm | Descarga las dependencias y ejecuta los comandos del proyecto | 11.25.0, indicada en `package.json` |
| Navegador | Muestra el portal | Edge, Chrome, Firefox u Opera |

La descarga se hará como ZIP. No necesitas instalar Git ni usar `git clone`. Tampoco necesitas Visual Studio, Docker o DBeaver para ejecutar el portal. pgAdmin, incluido en el instalador de PostgreSQL, permite consultar la base si deseas verla.

### Cómo escribir los comandos

1. Abre **Inicio** en Windows.
2. Escribe **Windows PowerShell** y abre la aplicación.
3. Copia únicamente el contenido del recuadro de comandos y pégalo en esa ventana.
4. Presiona **Enter** y espera el resultado antes de escribir el siguiente comando.

No copies los símbolos que delimitan los recuadros ni el texto `PS C:\...>` que aparece al inicio de una línea de PowerShell. Esa parte la escribe Windows.

Los comandos `npm.cmd` y `pnpm.cmd` ejecutan las versiones de Windows de esas herramientas y evitan el error de los archivos `.ps1` bloqueados por PowerShell. No hace falta cambiar la política de ejecución para seguir esta guía.

## 1. Instalar Node.js

1. Abre la [descarga oficial de Node.js](https://nodejs.org/en/download).
2. Selecciona la versión **24 LTS**, sistema **Windows**, arquitectura **x64** y **Windows Installer (.msi)**. Usa la actualización disponible dentro de la versión 24. Si ya tienes Node.js 24 o una versión LTS posterior, puedes verificarla abajo y conservarla.
3. Abre el archivo `.msi` descargado.
4. Pulsa **Next**, acepta la licencia y conserva la carpeta propuesta.
5. Conserva los componentes predeterminados, incluidos **npm package manager** y **Add to PATH**.
6. Si aparece una opción para instalar herramientas adicionales de compilación, puedes dejarla desmarcada para este proyecto.
7. Pulsa **Install**, acepta el aviso de Windows y termina con **Finish**.
8. Cierra todas las ventanas de PowerShell y de Windows Terminal. Abre una nueva ventana de PowerShell.

Comprueba Node.js:

```powershell
node --version
```

Debe mostrar una versión cuyo primer número sea 24 o mayor, por ejemplo `v24.x.x`; las `x` representan números de actualización.

Comprueba npm:

```powershell
npm.cmd --version
```

Debe aparecer un número de versión. Si alguno dice que no reconoce el comando, consulta la sección de problemas antes de continuar.

## 2. Instalar pnpm

En PowerShell ejecuta:

```powershell
npm.cmd install --global pnpm@11.25.0
```

Espera a que termine y vuelva a aparecer la línea donde puedes escribir. Comprueba la instalación:

```powershell
pnpm.cmd --version
```

Debe mostrar `11.25.0`. Usamos esa versión porque es la que declara este proyecto. El método de instalación con npm está documentado en la [guía oficial de pnpm](https://pnpm.io/installation).

## 3. Instalar PostgreSQL 18

Si ya tienes PostgreSQL 18, conoces la contraseña del usuario `postgres` y sabes qué puerto utiliza, ve a la comprobación del paso 4.

1. Abre la [descarga oficial de PostgreSQL para Windows](https://www.postgresql.org/download/windows/).
2. Pulsa **Download the installer**. Te llevará a EDB, el proveedor del instalador.
3. Descarga PostgreSQL **18.x** para **Windows x86-64**.
4. Ejecuta el instalador y acepta el permiso de Windows.
5. Conserva la carpeta `C:\Program Files\PostgreSQL\18`.
6. Instala **PostgreSQL Server**, **Command Line Tools** y **pgAdmin 4**. Stack Builder es opcional.
7. Conserva la carpeta de datos propuesta.
8. En **Password**, elige y confirma una contraseña para `postgres`. Guárdala: la necesitarás en `PGADMIN_PASSWORD`.
9. En **Port**, conserva `5432` si está libre. Si debes usar otro, anótalo.
10. Conserva la configuración regional predeterminada y completa la instalación.
11. Al terminar, desmarca la opción de abrir **Stack Builder**.

Puedes consultar las pantallas en la [guía del instalador de EDB](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/).

## 4. Comprobar PostgreSQL y su contraseña

Abre PowerShell. Esta guía usa la ruta completa de las herramientas, por lo que no necesitas agregar PostgreSQL al `PATH`.

Comprueba la versión:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" --version
```

Debe aparecer `psql (PostgreSQL) 18...`. Si elegiste otra carpeta durante la instalación, sustituye la ruta del comando por esa carpeta, conservando `\bin\psql.exe` al final.

Comprueba que PostgreSQL esté encendido:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -h 127.0.0.1 -p 5432
```

Debe indicar `accepting connections`. Si instalaste PostgreSQL en otro puerto, reemplaza `5432` en este comando y en los siguientes.

Comprueba la contraseña del administrador:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h 127.0.0.1 -p 5432 -U postgres -d postgres -W -c "SELECT version();"
```

Cuando solicite la contraseña, escribe la que elegiste en el instalador y presiona Enter. Es normal que no aparezcan letras ni asteriscos al escribirla. Debe mostrarse la versión del servidor. Si aparece una pantalla con `(END)`, pulsa `q` para salir de esa vista.

La contraseña solicitada pertenece al usuario PostgreSQL `postgres`. Una contraseña maestra que pgAdmin pudiera pedir para abrir o desbloquear su aplicación puede ser distinta.

## 5. Descargar y extraer el proyecto

1. Abre [el repositorio del proyecto](https://github.com/Emilian0o0/medicion-web).
2. Comprueba que esté seleccionada la rama **main**.
3. Pulsa el botón **Code** y después **Download ZIP**. Este es el [procedimiento de descarga de GitHub](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives).
4. En Descargas, haz clic derecho sobre el ZIP y selecciona **Extraer todo**. Completa la extracción.
5. Abre la carpeta extraída. Puede contener otra carpeta llamada `medicion-web-main`: entra hasta encontrar directamente `package.json`, `setup.mjs`, `server.mjs` y la carpeta `public`.
6. Copia esa carpeta completa al Escritorio y ponle el nombre **medicion-web**. Si ya existe una carpeta con ese nombre, conserva la anterior y usa otro nombre para la nueva.
7. Abre la carpeta del Escritorio. Debes ver `package.json` directamente dentro de ella.

Trabaja con la carpeta extraída. La vista que Windows muestra al abrir un ZIP todavía corresponde al archivo comprimido.

Si GitHub muestra `404`, confirma que el enlace sea correcto. Si el propietario cambió el repositorio a privado, necesitas iniciar sesión con la cuenta que recibió acceso y aceptar su invitación.

## 6. Abrir PowerShell dentro del proyecto

1. En el Explorador de archivos, abre la carpeta que contiene `package.json`.
2. Haz clic en la barra de direcciones superior, donde aparece la ubicación de la carpeta.
3. Escribe `powershell` y presiona Enter.
4. Se abrirá una ventana de PowerShell en esa ubicación.

Comprueba que estás en la carpeta correcta:

```powershell
Test-Path .\package.json
```

Debe responder `True`. Si responde `False`, vuelve al Explorador y busca la carpeta interior que contiene ese archivo.

Puedes ver la ubicación actual con:

```powershell
Get-Location
```

Desde aquí, ejecuta los comandos del proyecto en esta ventana. Una ventana que esté en `C:\Windows\System32` no está dentro del proyecto.

## 7. Crear y completar el archivo .env

`.env` guarda la configuración local de conexión. El ZIP incluye una plantilla llamada `.env.example`; debes crear tu propia copia.

Primero comprueba si ya tienes `.env`:

```powershell
Test-Path .\.env
```

Si responde `False`, créalo con:

```powershell
Copy-Item -LiteralPath .\.env.example -Destination .\.env
```

Si responde `True`, conserva el archivo existente y revisa sus valores. No lo sobrescribas con la plantilla porque perderías la configuración anterior.

Ábrelo en el Bloc de notas:

```powershell
notepad.exe .\.env
```

Para una instalación nueva con el puerto predeterminado, deja el siguiente contenido y reemplaza los tres textos de contraseña por tus propias claves:

```dotenv
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=Medicion
PGUSER=medicion_app
PGPASSWORD="ESCRIBE_UNA_CLAVE_NUEVA_PARA_LA_APP"
PGADMIN_USER=postgres
PGADMIN_PASSWORD="ESCRIBE_LA_CLAVE_DE_POSTGRES"
PORT=3000
HOST=127.0.0.1
DEMO_PASSWORD="ELIGE_UNA_CLAVE_PARA_EL_PORTAL"
```

Los textos en mayúsculas son instrucciones para reemplazar, no contraseñas que debas usar literalmente. Conserva los nombres a la izquierda del signo `=` y las comillas rectas que rodean las contraseñas.

| Campo | Qué debes escribir | Para qué se usa |
| --- | --- | --- |
| `PGADMIN_PASSWORD` | La contraseña real que elegiste para `postgres` durante su instalación | El script prepara la base y los permisos |
| `PGPASSWORD` | Una contraseña nueva que tú elijas para el usuario técnico `medicion_app` | El servidor web se conecta a la base |
| `DEMO_PASSWORD` | Una contraseña nueva que tú elijas para las cuentas ficticias del portal | Inicias sesión como supervisor o cajero |

El script crea `medicion_app` automáticamente. No debes crearlo a mano ni sustituir `PGUSER` por `postgres`.

Para las dos claves nuevas, puedes usar al menos 16 letras y números. `DEMO_PASSWORD` debe tener entre 10 y 128 caracteres. Guarda las claves para usarlas después. Para evitar errores de edición, usa comillas rectas y evita introducir saltos de línea dentro de una clave.

Si el puerto de PostgreSQL es distinto, cambia `PGPORT`. `PORT=3000` corresponde al portal web y es independiente del puerto de PostgreSQL.

Guarda con **Ctrl + S** y cierra el Bloc de notas. El archivo debe llamarse exactamente `.env`, sin `.txt`. Puedes comprobar los nombres con:

```powershell
Get-ChildItem -Force -Name .env*
```

Debes ver `.env` y `.env.example`. Si aparece `.env.txt`, activa las extensiones de archivo en el Explorador y cambia ese nombre a `.env`. En Windows 11: **Ver > Mostrar > Extensiones de nombre de archivo**. En Windows 10: pestaña **Vista > Extensiones de nombre de archivo**.

Conserva `.env` en tu computadora. Contiene tus contraseñas y no debe subirse a GitHub ni enviarse junto con capturas para pedir ayuda.

## 8. Descargar las dependencias del proyecto

En PowerShell, dentro de la carpeta del proyecto, ejecuta:

```powershell
pnpm.cmd install --frozen-lockfile
```

Espera a que termine y vuelva el indicador de PowerShell. Se creará `node_modules`, donde se guardan las bibliotecas necesarias.

`--frozen-lockfile` indica que se respeten las versiones registradas en `pnpm-lock.yaml`; si ese archivo no coincide con `package.json`, la instalación se detiene para evitar una combinación diferente. Puedes consultar la [explicación de pnpm](https://pnpm.io/cli/install#--frozen-lockfile).

No necesitas ejecutar `npm install` ni descargar a mano los archivos de `node_modules`.

## 9. Crear la base y cargar los datos de prueba

Ejecuta exactamente este comando, incluyendo la palabra `run`:

```powershell
pnpm.cmd run setup
```

**No lo acortes a `pnpm setup`.** Ese nombre corresponde a una función propia de pnpm. `pnpm.cmd run setup` ejecuta el script de preparación definido en `package.json`. La distinción está descrita en la [documentación de ejecución de scripts](https://pnpm.io/cli/run) y la [documentación de pnpm setup](https://pnpm.io/cli/setup).

Espera a que termine. El script crea la base `Medicion` si no existe, prepara sus tablas y cálculos, configura el usuario técnico y carga los datos ficticios cuando la base está vacía.

En una instalación nueva debes obtener un mensaje como:

```text
Base Medicion, esquema, rol y permisos listos.
```

También se mostrarán las cantidades cargadas y este correo:

```text
Supervisor de prueba: supervisor1@medicion.local
```

La carga inicial contiene:

| Datos | Cantidad |
| --- | --- |
| Cuentas de cajeros | 250 |
| Cuentas de supervisores | 5 |
| Centros de atención | 70 |
| Períodos de enero a septiembre de 2026 | 9 |
| Participaciones de cajeros en períodos | 2,250 |
| Mediciones de criterios | 15,750 |
| Registros diarios de operaciones | 22,482 |
| Tareas | 2,000 |

Como configuraste `DEMO_PASSWORD`, la clave del portal será la que elegiste; el programa no necesita imprimirla. Si omitiste esa variable en una base nueva, el script genera una clave y muestra `Clave de prueba generada: ...`. Guárdala antes de cerrar la ventana.

Si aparece `No se agregaron datos de prueba porque la base ya contiene registros.`, se conservó la información existente. Volver a ejecutar el script no restablece las contraseñas de las cuentas ni vuelve a llenar una base parcialmente usada. Cambiar `DEMO_PASSWORD` después de la carga tampoco cambia las contraseñas ya guardadas.

## 10. Encender el portal

Después de terminar la preparación, ejecuta:

```powershell
pnpm.cmd run start
```

Debe aparecer:

```text
Medición lista: http://127.0.0.1:3000
```

Es normal que PowerShell ya no muestre otra línea para escribir: está ejecutando el servidor. **Deja esta ventana abierta mientras uses el portal.**

Abre tu navegador y escribe esta dirección en la barra superior:

[http://127.0.0.1:3000](http://127.0.0.1:3000)

Usa `http`, tal como aparece en el mensaje. No necesitas abrir `index.html` con doble clic: las páginas deben servirse desde el programa para comunicarse con PostgreSQL.

`127.0.0.1` significa esta misma computadora. Abre el navegador en el equipo donde ejecutaste el servidor. Esta configuración es para una prueba local; ese enlace no permite entrar desde otra computadora o un teléfono.

## 11. Entrar y comprobar el funcionamiento

Las siguientes son cuentas ficticias creadas por la carga inicial:

| Rol | Correo para entrar | Contraseña |
| --- | --- | --- |
| Supervisor | `supervisor1@medicion.local` | El valor que elegiste para `DEMO_PASSWORD` |
| Cajero | `cajero001@medicion.local` | El mismo valor inicial de `DEMO_PASSWORD` |

Los supervisores van de `supervisor1@medicion.local` a `supervisor5@medicion.local`. Los cajeros van de `cajero001@medicion.local` a `cajero250@medicion.local`; conserva los ceros de los primeros números. Estos correos funcionan como identificadores de acceso y no necesitan existir como buzones de correo.

Para comprobar la réplica:

1. Entra como `supervisor1@medicion.local` con tu clave del portal.
2. Comprueba que aparezca el panel del supervisor y sus datos en Inicio.
3. En **Mi equipo**, revisa la lista regional y el filtro del equipo asignado. La región contiene 250 cajeros y el supervisor tiene 50 asignados.
4. En **Rendimiento**, selecciona un período y revisa los resultados. La carga trae enero a septiembre de 2026; no esperes datos de octubre o noviembre de esa carga.
5. En **Tareas**, comprueba que existan registros y que funcionen los filtros.
6. Cierra sesión desde el portal.
7. Entra como `cajero001@medicion.local` y confirma que se abra el panel de cajero, con sus tareas y rendimiento.

Si puedes entrar con ambos roles y consultar los registros, comprobaste que las interfaces y la base están comunicándose. Las acciones de guardar o cambiar estados sí modifican tu base local de prueba.

## 12. Detenerlo y volver a abrirlo otro día

Para detener el portal, regresa a PowerShell y presiona **Ctrl + C**. Si Windows pregunta si deseas terminar el trabajo, confírmalo. Los datos guardados en PostgreSQL permanecen.

La próxima vez:

1. Abre la carpeta `medicion-web` del Escritorio.
2. Escribe `powershell` en la barra de direcciones del Explorador y presiona Enter.
3. Ejecuta:

```powershell
pnpm.cmd run start
```

4. Abre [http://127.0.0.1:3000](http://127.0.0.1:3000).

No necesitas reinstalar programas, copiar nuevamente `.env` ni ejecutar la carga cada vez. PostgreSQL suele iniciarse como servicio de Windows; si no está funcionando, consulta la solución de conexión más abajo.

## 13. Ver la base directamente en pgAdmin, si lo necesitas

Este paso es opcional para evaluar las tablas; el portal ya puede usarse sin abrir pgAdmin.

1. Busca **pgAdmin 4** en Inicio y ábrelo.
2. Si solicita configurar o introducir una contraseña maestra, sigue ese diálogo. Esa clave protege pgAdmin y no reemplaza la de `postgres`.
3. En **Servers**, abre el servidor PostgreSQL 18. Si no aparece, haz clic derecho en **Servers > Register > Server**.
4. En **General**, escribe un nombre como `PostgreSQL local`.
5. En **Connection**, usa host `127.0.0.1`, puerto `5432` o el que elegiste, base de mantenimiento `postgres`, usuario `postgres` y la contraseña que pusiste en `PGADMIN_PASSWORD`.
6. Guarda la conexión y abre **Databases > Medicion > Schemas > medicion > Tables**.
7. Haz clic derecho en `usuario` o `cajero` y selecciona **View/Edit Data > First 100 Rows** para consultar registros.
8. Los resultados calculados están en **Schemas > medicion > Views > resultado_final**.

La base se llama `Medicion`, con M mayúscula; su esquema se llama `medicion`, en minúsculas. Una vista muestra el resultado de una consulta, por eso `resultado_final` aparece en Views y no en Tables. Puedes consultar las pantallas de [conexión](https://www.pgadmin.org/docs/pgadmin4/latest/server_dialog.html) y [consulta de datos](https://www.pgadmin.org/docs/pgadmin4/latest/editgrid.html) en la documentación de pgAdmin.

## 14. Problemas frecuentes

### «node», «npm» o «pnpm» no se reconoce como comando

Primero cierra todas las ventanas de terminal y abre PowerShell otra vez. Windows necesita actualizar las rutas disponibles después de una instalación.

Si `node --version` sigue fallando, repara o reinstala Node.js con **Add to PATH**. Si Node y npm funcionan pero pnpm no, vuelve a ejecutar:

```powershell
npm.cmd install --global pnpm@11.25.0
```

Si la instalación termina bien y pnpm sigue sin encontrarse, comprueba la ubicación global:

```powershell
npm.cmd config get prefix
```

Guarda la ruta que muestra. En Inicio busca **Editar las variables de entorno de esta cuenta**; en las variables del usuario, edita **Path**, pulsa **Nuevo** y agrega esa ruta sin borrar las entradas existentes. Acepta los diálogos y abre una terminal nueva. Si no tienes permiso para modificarla, pide ayuda al responsable del equipo.

Si la instalación global muestra `EACCES` o `EPERM`, cierra las terminales que estén usando pnpm y vuelve a intentar. Si señala una carpeta protegida, pide al administrador que complete esa instalación.

### «No se puede cargar npm.ps1» o «la ejecución de scripts está deshabilitada»

Usa `npm.cmd` y `pnpm.cmd`, con la terminación `.cmd`, como en esta guía. Por ejemplo:

```powershell
pnpm.cmd run start
```

### No encuentra package.json o muestra ERR_PNPM_NO_IMPORTER_MANIFEST_FOUND

La terminal está en otra carpeta o abriste la carpeta exterior del ZIP. Vuelve al paso 6 y comprueba que `Test-Path .\package.json` devuelva `True`.

### Dice que falta .env o pide configurar PGPASSWORD y PGADMIN_PASSWORD

Revisa el paso 7. `.env` debe estar junto a `package.json`, con ese nombre exacto. Guarda el archivo antes de ejecutar comandos. La plantilla `.env.example` por sí sola no configura el portal.

### «password authentication failed for user postgres»

La contraseña administrativa no coincide. Repite la comprobación con `psql` del paso 4 y coloca esa misma contraseña en `PGADMIN_PASSWORD`. Si la desconoces, pide ayuda al responsable de esa instalación: descargar el proyecto no proporciona la contraseña de PostgreSQL de tu equipo.

### «password authentication failed for user medicion_app»

Comprueba que estés usando el `.env` de la misma carpeta donde preparaste la base. Si la preparación nunca terminó, corrige primero sus errores y ejecuta `pnpm.cmd run setup`.

Si cambiaste `PGPASSWORD` después de preparar la base, el servidor intentará usar la nueva clave aunque PostgreSQL todavía tenga la anterior. Puedes restaurar el valor con el que preparaste la base. Para una instalación dedicada a esta prueba, volver a ejecutar `pnpm.cmd run setup` actualiza la clave del rol técnico; si otra copia usa ese mismo rol, también tendría que usar la nueva clave.

### ECONNREFUSED, «no response» o error al conectar con PostgreSQL

Comprueba host y puerto en `.env`. Para ver los servicios instalados, ejecuta:

```powershell
Get-Service *postgres*
```

Si PostgreSQL 18 aparece como `Stopped`, abre **PowerShell como administrador** y ejecuta el siguiente comando si el nombre mostrado es `postgresql-x64-18`:

```powershell
Start-Service -Name postgresql-x64-18
```

Si el servicio tiene otro nombre, usa el que aparece en la columna **Name**. Comprueba de nuevo con `pg_isready`, como en el paso 4. Si no aparece ningún servicio, revisa que instalaste el componente PostgreSQL Server.

### «Base ... lista», pero no hay datos o no funciona mi clave de demostración

Lee el mensaje final del paso 9. Una base que ya tenía registros conserva esos datos y contraseñas. Modificar `DEMO_PASSWORD` no cambia las cuentas existentes.

Si necesitas una réplica nueva y conservar la anterior, detén el portal y edita `.env` para usar nombres nuevos que no existan, por ejemplo:

```dotenv
PGDATABASE=MedicionPrueba2
PGUSER=medicion_prueba2
```

Elige una nueva `PGPASSWORD`, confirma tu `DEMO_PASSWORD` y ejecuta `pnpm.cmd run setup`. Después ejecuta `pnpm.cmd run start`. Esto crea otra base y otro usuario técnico, y el portal usará esa nueva configuración. Si esos nombres ya existen, elige otros. No necesitas borrar la base anterior.

### ERR_PNPM_OUTDATED_LOCKFILE o falta pnpm-lock.yaml

Descarga otra vez el ZIP completo del repositorio y comprueba que `package.json` y `pnpm-lock.yaml` provengan de esa misma descarga. Verifica `pnpm.cmd --version`. Si vuelve a fallar, envía el error al autor; no cambies las versiones ni elimines el archivo de bloqueo para ocultar el problema.

### La descarga de dependencias falla por conexión, certificado o acceso

Comprueba que tengas internet y que puedas abrir las páginas de descarga. Si es una red escolar o laboral, puede necesitar autorización del responsable. Reintenta la instalación cuando la conexión esté disponible; no desactives la comprobación de certificados.

### «Cannot find package pg» o ERR_MODULE_NOT_FOUND

Faltan las dependencias en esa copia del proyecto. Dentro de su carpeta ejecuta de nuevo `pnpm.cmd install --frozen-lockfile` y espera a que termine correctamente antes de iniciar el portal.

### EADDRINUSE o el puerto 3000 está ocupado

Puede haber otra ventana ejecutando el portal. Detén esa ejecución con Ctrl + C o usa su dirección si ya funciona.

Si el puerto lo usa otro programa, cambia `PORT=3000` por `PORT=3001` en `.env`, guarda e inicia de nuevo. Abre entonces [http://127.0.0.1:3001](http://127.0.0.1:3001). No cambies `PGPORT` para resolver un conflicto del puerto del navegador.

### El navegador dice que no puede acceder a este sitio

Revisa la ventana de PowerShell. Debe seguir abierta y mostrar `Medición lista: ...`. Si terminó con un error, resuelve ese error primero. Copia la dirección exacta que imprime el programa y ábrela en el mismo equipo, usando `http`.

### El portal dice «Correo o contraseña incorrectos»

Comprueba el correo completo de la tabla del paso 11 y que estés usando la clave del portal: `DEMO_PASSWORD` de la primera carga o la clave generada que guardaste. Las contraseñas distinguen mayúsculas y minúsculas. Si un usuario cambió su clave desde el portal, debe usar esa nueva clave.

### El programa parece no hacer nada al ejecutar setup

Verifica que escribiste `pnpm.cmd run setup`. Espera a que termine; crear y calcular los datos puede tardar. Si aparece un error, copia su texto. Ejecutar `pnpm setup` puede configurar la propia herramienta sin preparar la base del proyecto.

### Cómo pedir ayuda con información útil

Envía el paso donde te detuviste, el comando que ejecutaste y el mensaje completo de error. También puedes enviar los resultados de:

```powershell
node --version
npm.cmd --version
pnpm.cmd --version
Get-Location
Test-Path .\package.json
Test-Path .\.env
```

Estos comandos muestran versiones, ubicación y existencia de archivos; no imprimen las contraseñas. Omite cualquier clave que aparezca en otra salida y no compartas el contenido de `.env`.

## Comprobación final

- [ ] Node.js muestra versión 24 o posterior y npm responde.
- [ ] pnpm muestra `11.25.0`.
- [ ] PostgreSQL 18 acepta conexiones y la clave de `postgres` funciona.
- [ ] El ZIP está extraído y PowerShell está en la carpeta con `package.json`.
- [ ] `.env` tiene los valores propios de esta computadora y una clave de demostración elegida.
- [ ] `pnpm.cmd install --frozen-lockfile` terminó sin errores.
- [ ] `pnpm.cmd run setup` confirmó la creación y carga esperadas.
- [ ] `pnpm.cmd run start` imprimió la dirección del portal.
- [ ] Pude entrar como supervisor y como cajero y consultar los datos.

Para los siguientes usos solo necesitas encender el portal desde su carpeta y abrir su dirección en el navegador.
