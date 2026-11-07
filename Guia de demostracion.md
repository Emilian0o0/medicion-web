# Medicion - Guia de demostracion

[[Medición - Index|Volver al proyecto]] · [[Medicion - Portal y arquitectura|Arquitectura]] · [[Medicion - Criterios y calculos|Cálculos]] · [[Medicion - Base de datos|Base de datos]]

> [!info] Propósito
> Guion para presentar el estado actual del portal **celtel**. Los usuarios, centros, tareas y evaluaciones son ficticios. Los números de esta guía se comprobaron el **25 de octubre de 2026**; las acciones de la demostración cambiarán algunos conteos.

## Resumen que puedes decir al comenzar

> «Este sistema registra actividades y mide el rendimiento mensual de cajeros de centros de atención. Hay dos perfiles: el supervisor administra su equipo y captura las mediciones; el cajero consulta sus datos y actualiza sus tareas. El navegador se comunica con un servidor Node.js y éste guarda o consulta los datos en PostgreSQL. La demostración usa datos inventados: 250 cajeros, cinco supervisores y 70 centros. Los porcentajes se calculan con nueve criterios a partir de los datos almacenados, no se escriben a mano en la pantalla».

Si tienes poco tiempo, muestra **Inicio → Mi equipo → Tareas → Rendimiento → Registrar mediciones → ingreso de cajero → actualización de tarea**. El resto queda para preguntas.

## Preparación antes de conectar el proyector

1. Ten abierta esta guía y `C:\Users\jecha\Desktop\Instrucciones.txt`. Allí están las credenciales de **prueba**. No muestres contraseñas de PostgreSQL ni el archivo `.env` en el proyector.
2. Abre PowerShell y comprueba el servicio:

   ```powershell
   Get-Service -Name postgresql-x64-18
   ```

   Si está `Stopped`, abre PowerShell **como administrador** y ejecuta `Start-Service -Name postgresql-x64-18`.
3. En otra ventana inicia la copia del Escritorio:

   ```powershell
   powershell -ExecutionPolicy Bypass -File "C:\Users\jecha\Desktop\medicion-web\iniciar.ps1"
   ```

   Deja abierta esa ventana. En el navegador entra a `http://127.0.0.1:3000`. Abrir los HTML directamente no inicia el servidor ni la conexión con la base.
4. Prepara dos correos: `supervisor1@medicion.local` y `cajero001@medicion.local`. Ambos son cuentas ficticias. El cajero 001 pertenece al supervisor 1 y al **Centro demo 01**. El cajero 025 comparte ese centro y supervisor, útil si quieres comparar operaciones SAICEL.
5. Si mostrarás DBeaver, deja lista una conexión existente a `localhost:5432`, base `Medicion`, esquema `medicion`. No abras en público la configuración privada de la conexión.
6. Septiembre ya contiene las evaluaciones completas de los 250 cajeros, incluidos los dos casos del ejercicio. Octubre sigue libre. No crees otro período de septiembre.

## Recorrido principal de la presentación

Cada paso incluye la acción y una frase sugerida. No hace falta leerla literalmente.

### 1. Entrar como supervisor

- **Haz:** Inicia sesión con `supervisor1@medicion.local` y la contraseña de demostración de `Instrucciones.txt`.
- **Di:** «El acceso identifica el rol y abre la página correspondiente. Un cajero no puede abrir la página de supervisor sólo con cambiar la dirección».
- **Señala:** La navegación lateral y la identidad del usuario.

### 2. Mostrar Inicio

- **Haz:** Señala las tarjetas de cajeros, tareas completadas, pendientes y vencidas, la actividad reciente, los cinco cajeros de vista previa y el promedio mensual más reciente.
- **Di:** «Esta pantalla resume las tareas de mi equipo. La tarjeta de porcentaje es el promedio de los cajeros evaluados en el último período con resultados; indica cuántos participaron. La vista previa de cinco cajeros evita que Inicio sea una página enorme».
- **Aclara si preguntan:** El cumplimiento de tareas **no suma puntos** a la evaluación de rendimiento.

### 3. Mi equipo: región y asignaciones

- **Haz:** Pulsa **Ver equipo** o entra a **Mi equipo**. Muestra **Toda la región** (250 cajeros), cambia a **Mis cajeros** (50) y busca `Cajero demo 001` o `Centro demo 01`.
- **Di:** «Los cinco supervisores pueden consultar el directorio regional. Cada uno tiene 50 cajeros para administrar y 14 centros; cada centro reúne tres o cuatro cajeros. El centro y supervisor responsable se guardan como relaciones en la base».
- **Señala:** Número de empleado, centro, supervisor y conteos de tareas. Si un cajero no tiene cuenta de acceso, aparece **Pendiente** en naranja debajo del nombre; eso no significa que el cajero haya sido eliminado.

### 4. Tareas: asignar, filtrar y actualizar

- **Haz:** Abre **Tareas**. El formulario **Asignar una tarea** está arriba. Selecciona `Cajero demo 001`, escribe un título único como `Demostración de seguimiento`, una descripción breve, prioridad y una fecha límite válida. Guarda la tarea.
- **Haz después:** En la tabla inferior busca el título; prueba los filtros de cajero, estado, prioridad y fecha y pulsa **Limpiar filtros**.
- **Di:** «La tarea queda guardada en PostgreSQL y vinculada al cajero y al supervisor. El estado puede ser Pendiente, En progreso o Completada. Vencida se muestra cuando la fecha límite ya pasó y la tarea no está completada».
- **Si preguntan por el nombre:** Las tareas precargadas de conciliación ya muestran **SAICEL**; el identificador interno antiguo de las operaciones no aparece en sus títulos.
- **Consejo:** Usa una fecha posterior al día de la exposición si quieres que la nueva tarea aparezca como Pendiente y no Vencida. Anota el título para encontrarla luego al entrar como cajero.

### 5. Rendimiento: tres alcances

- **Haz:** Abre **Rendimiento** y elige un mes histórico, por ejemplo **Evaluación agosto 2026**. Enseña las tarjetas de promedios y el desglose por criterio.
- **Haz:** Pulsa **Ver gráfica** en una tarjeta. La gráfica mensual ocupa la tarjeta; señala la escala y el punto del mes seleccionado. Pulsa **Ver resumen** para recuperar los porcentajes por criterio. Repite en un centro o un cajero para mostrar que cada serie corresponde al alcance de esa tarjeta.
- **Haz después:** Cambia **Vista** de **Región completa** a **Mis cajeros** y luego **Mis centros**. En centros selecciona **Centro demo 01**. Usa el filtro de cajero para ver una evaluación individual. Al final pulsa **Ver tabla completa** y, si conviene, **Ocultar tabla completa**.
- **Di:** «La región agrupa a los 250 cajeros evaluados; mi equipo a los 50 asignados; la vista de centros presenta el promedio de cada centro a mi cargo. Las tarjetas muestran promedios y el detalle individual muestra cada evaluación. El filtro de cajero cambia el detalle, pero no altera los promedios de las tarjetas».
- **Aclara:** La tabla detallada se construye al pedirla; esto mantiene más ágil la vista inicial.

### 6. Registrar mediciones: formularios y operaciones

- **Haz:** Abre **Registrar mediciones**. Enseña **Evaluación por criterios**, **Operaciones SAICEL**, **Crear período** y la tabla **Operaciones registradas**. Filtra esa tabla por fecha y centro.
- **Di:** «El supervisor captura siete criterios manuales. SAICEL se deriva de operaciones registradas por cajero, centro y día. Antigüedad se deriva de la fecha de ingreso. Al guardar, los porcentajes se recalculan en la vista de PostgreSQL».
- **Señala:** En el formulario de operaciones, el centro se selecciona según el cajero. La fecha debe estar dentro del período elegido. Si ya hay una fila para el mismo cajero, período, centro y día, guardar actualiza su cantidad.
- **Para explicar septiembre:** Sigue el apartado [[#Ejemplo en vivo: septiembre y SAICEL|Ejemplo de septiembre]]. Los datos de ese ejercicio ya están guardados.

### 7. Crear cuentas y Mi perfil

- **Haz:** Abre **Crear cuentas**. Enseña que se puede crear una cuenta de cajero vinculada a uno existente o crear un cajero nuevo con número de empleado único de seis dígitos, fecha de ingreso y centro. También existe el rol supervisor. Recorre la lista de la derecha con su scroll propio. Abre **Mi perfil** y muestra los campos de nombre y cambio de contraseña.
- **Di:** «Las cuentas de acceso se guardan aparte de los datos del cajero. Para un cajero nuevo se registra también a qué centro y supervisor pertenece. El usuario puede cambiar su nombre y contraseña desde el perfil».
- **Importante:** No cambies la contraseña de las cuentas compartidas de prueba durante la exposición. Crear un cajero adicional hace que los conteos de 250 y 50 cambien; si no planeas demostrar ese cambio, explica el formulario sin enviarlo. Tampoco hay una pantalla de eliminación de usuarios en esta versión.

### 8. Salir y entrar como cajero

- **Haz:** Cierra sesión y entra con `cajero001@medicion.local`. Abre **Mi perfil** para mostrar su centro y supervisor. En **Tareas**, localiza la nueva tarea y cambia el estado a **En progreso** o **Completada**. Enseña los filtros. En **Mi rendimiento**, muestra sus evaluaciones y el desglose de los criterios.
- **Di:** «El cajero sólo recibe sus datos y puede actualizar el estado de sus tareas. No puede asignar tareas, crear cuentas, registrar mediciones ni consultar las evaluaciones individuales de los demás».
- **Haz para cerrar el ciclo:** Cierra sesión, vuelve a entrar como supervisor y recarga o visita **Tareas**. Busca la misma tarea y muestra el estado actualizado. La página consulta la API al cargar o después de guardar; no usa actualización en tiempo real entre dos navegadores abiertos.

### 9. Enseñar la base en DBeaver si queda tiempo

- **Haz:** Abre la conexión `Medicion` y expande **Schemas → medicion → Tables** y **Views**. Señala `usuario`, `sesion`, `cajero`, `centro`, `tarea`, `periodo_evaluacion`, `cajero_periodo`, `medicion_criterio_cajero`, `operacion_sicatel_diaria`, `criterio`, `regla_criterio` y la vista `resultado_final`.
- **Di:** «Las tablas guardan los datos de origen. La vista `resultado_final` calcula los componentes y el porcentaje final. `usuario` y `cajero` son registros distintos: borrar una cuenta de acceso no borra necesariamente al cajero».
- **Si necesitas una comprobación rápida:** Ejecuta una consulta **de sólo lectura**:

   ```sql
   SELECT codigo, nombre, peso_maximo
   FROM medicion.criterio
   ORDER BY peso_maximo DESC;
   ```

   El nombre visible es **Pagos SAICEL**. El código interno `sicatel` y la tabla `operacion_sicatel_diaria` conservan su nombre histórico por compatibilidad; eso no cambia el nombre que ve el usuario.

## Ejemplo en vivo: septiembre y SAICEL

> [!info] Estado actual
> El ejemplo se completó después de la presentación: septiembre ya tiene 250 participantes. Los cajeros 001 y 025 tienen sus siete criterios y operaciones del 15 de septiembre. Los pasos siguientes documentan cómo se realizó el ejercicio; no vuelvas a guardar esos valores si deseas conservar este estado.

Antes de completar el ejercicio, **Evaluación septiembre 2026** contenía 248 evaluaciones completas y 2,480 operaciones ficticias. Los cajeros 001 y 025, ambos del **Centro demo 01**, se habían reservado para mostrar los siguientes pasos.

1. En **Registrar mediciones → Evaluación por criterios**, selecciona `Cajero demo 001` y `Evaluación septiembre 2026`. Usa valores fáciles de explicar: sin incidencias disciplinarias, `0` en entrega, faltantes/sobrantes, errores y calidad; cursos y encuestas cumplidos. Guarda. El cajero ya participa en septiembre, pero su evaluación permanece **parcial** porque falta SAICEL.
2. En **Operaciones SAICEL**, selecciona el mismo cajero, período y **Centro demo 01**. Cambia la fecha predeterminada a `2026-09-15` y registra `50` operaciones. Como es la primera operación de ese centro y día, el cajero 001 queda momentáneamente con el máximo de SAICEL y su resultado se completa.
3. Repite los siete criterios para `Cajero demo 025`. En operaciones usa el mismo período, centro y fecha `2026-09-15`, con `100` operaciones.
4. Explica el cálculo: al guardar el segundo registro, la comparación diaria se recalcula con máximo 100. El cajero 001 pasa a `50 / 100 × 29% = 14.5%` por SAICEL y el 025 obtiene `100 / 100 × 29% = 29%`.
5. En **Rendimiento**, selecciona septiembre. Ahora el promedio mensual reúne a los 248 cajeros precargados y los dos que acabas de capturar: **250 participantes**. Inicio mostrará septiembre como el último período con resultado.

> [!warning] Después del ejemplo
> Septiembre ya tiene 250 participantes. No ejecutes `cargar_demo_2026.mjs` ni vuelvas a cargar el escenario anterior sobre la base actual.

## Lo esencial del cálculo

| Criterio | Máximo | Procedencia |
| --- | ---: | --- |
| Disciplina | 30% | Valor manual y reglas de severidad |
| Pagos SAICEL | 29% | Operaciones comparadas con el máximo del mismo centro, día y período |
| Entrega de valores | 15% | Conteo manual y rangos |
| Faltantes y sobrantes | 10% | Importe manual y rangos |
| Errores o incidencias | 5% | Conteo manual y rangos |
| Calidad en el servicio | 5% | Conteo manual y rangos |
| Cursos | 3% | Cumplidos o no cumplidos |
| Encuestas | 2% | Campaña cumplida o no cumplida |
| Antigüedad | 1% | Días de lunes a viernes desde el ingreso, relativos al mayor valor del período |
| **Total** | **100%** | Suma de los nueve componentes |

La evaluación es **parcial** si falta un criterio necesario; los componentes faltantes pueden entrar como cero en un promedio hasta completar la captura. La tarjeta mensual usa `AVG` de los resultados de quienes sí tienen una evaluación en ese período. «Calidad en el servicio: 0%» puede ser un resultado legítimo de la regla (por ejemplo, tres o más incidencias), y no significa automáticamente que la interfaz esté vacía. Las reglas se documentan con detalle en [[Medicion - Criterios y calculos]].

## Si pide ver el codigo

No hace falta abrir todos los archivos ni leer líneas completas. Abre la carpeta `C:\Users\jecha\Desktop\medicion-web` en tu editor y sigue este orden. Usa `Ctrl+P` para abrir el archivo y `Ctrl+F` para buscar el nombre indicado.

| Orden | Archivo y buscar | Qué muestras | Qué puedes decir |
| --- | --- | --- | --- |
| 1 | `public/app.js` → `api(` | La función que usa `fetch` para llamar a rutas `/api`. | «La interfaz no se conecta directamente a PostgreSQL. Esta función envía solicitudes JSON al servidor y recibe los datos para actualizar la pantalla». |
| 2 | `public/app.js` → `performanceCard` y `trendChart` | La tarjeta y su gráfica. | «La tarjeta alterna entre el resumen y la serie mensual. La gráfica se dibuja con SVG a partir de los resultados ya consultados, con una escala visible ajustada a la serie». |
| 3 | `public/app.js` → `formAction` | El manejador común de formularios. | «Centralicé el envío de formularios para que tareas, cuentas y mediciones sigan el mismo proceso: validar, enviar a la API, recargar datos y mostrar un aviso». |
| 4 | `server.mjs` → `createApp` | El servidor y sus rutas. | «Aquí se reciben las solicitudes. El servidor revisa sesión, rol y datos antes de consultar o modificar la base». |
| 5 | `server.mjs` → `/api/dashboard` | Consultas del panel. | «Esta ruta reúne cajeros, tareas, resultados, períodos y promedios para armar las vistas. El cajero queda filtrado a sus propios datos; el supervisor obtiene las vistas permitidas por su rol». |
| 6 | `server.mjs` → `/api/measurements` o `/api/operations` | Guardado de mediciones y operaciones SAICEL. | «Antes de guardar, se comprueba que el cajero y el centro correspondan al supervisor y que la fecha pertenezca al período. La operación se ejecuta como transacción». |
| 7 | `db.mjs` → `createPool` | La creación del pool de conexiones. | «Este archivo crea el grupo de conexiones de Node.js hacia PostgreSQL. La configuración se toma del entorno del servidor, no del navegador». |
| 8 | `auth.mjs` → `hashPassword` y `verifyPassword` | Protección de contraseñas. | «Las contraseñas no se guardan en texto plano. Se genera una sal aleatoria y se guarda un hash con scrypt; al iniciar sesión se verifica el hash». |
| 9 | `medicion_schema.sql` → `CREATE TABLE` | Tablas principales: centro, cajero, período, criterio, reglas, mediciones y operaciones. | «Estas tablas conservan los datos fuente y sus relaciones. Las claves como `cajero_id`, `centro_id` y `supervisor_id` conectan los registros». |
| 10 | `medicion_schema.sql` → `CREATE OR REPLACE VIEW resultado_final` | La vista que calcula el porcentaje. | «La vista combina mediciones, reglas, operaciones y antigüedad. Por eso el porcentaje se calcula al consultar y no se captura manualmente». |
| 11 | `migrations/001_portal.sql` | Tablas de usuario, sesión y tarea. | «Estas tablas complementan la medición con acceso por rol, sesiones y seguimiento de tareas». |
| 12 | `test/portal.test.mjs` | Pruebas automatizadas. | «Incluye pruebas de acceso, separación de roles, validaciones, tareas, evaluaciones y permisos. Sirve para verificar que los cambios no rompan los casos principales». |

### Explicacion corta de la arquitectura

> «El código está separado por responsabilidades. `app.js` se ocupa de la pantalla y los formularios. `server.mjs` aplica las reglas y expone la API. `db.mjs` abre el pool hacia PostgreSQL. `auth.mjs` maneja contraseñas y sesiones. Los archivos SQL crean las tablas y la vista de cálculo. Así la interfaz no contiene credenciales ni reglas críticas de acceso».

### Preguntas de seguimiento sobre el codigo

| Si pregunta | Respuesta breve |
| --- | --- |
| ¿Por qué no conectaron JavaScript del navegador directamente a PostgreSQL? | Porque expondría credenciales y permitiría saltarse permisos. El servidor controla qué puede consultar o modificar cada rol. |
| ¿Cómo evitan inyección SQL? | Las consultas usan parámetros como `$1`, `$2` y envían los valores por separado; no concatenan lo que escribe el usuario dentro del SQL. |
| ¿Por qué usar transacciones? | Para que una operación con varios pasos se guarde completa o se revierta completa si algo falla. |
| ¿Qué hace la vista `resultado_final`? | Reúne los datos de origen y aplica las reglas para devolver cada componente y el porcentaje total sin duplicar resultados en otra tabla. |
| ¿Qué parte se modifica si cambia una regla de porcentajes? | Los valores y rangos de `criterio` y `regla_criterio`, además de la vista si cambia la fórmula. La interfaz sigue mostrando el resultado que devuelve PostgreSQL. |
| ¿Cómo se documentó el código? | Cada función tiene solo un comentario breve que describe su propósito. Los detalles funcionales se documentan en estas notas para no llenar el código con texto repetido. |

### Que no debes proyectar

- `.env`, porque contiene la configuración privada de la base.
- Contraseñas de PostgreSQL o de cuentas reales.
- El archivo completo `server.mjs` sin explicar una ruta específica; es mejor mostrar una función y decir qué responsabilidad tiene.

Si pregunta algo que no recuerdas, puedes decir: «Esa parte está separada en este archivo para mantener el proyecto ordenado. Puedo mostrar la función y explicar el flujo de datos que sigue». Luego vuelve al recorrido navegador → servidor → PostgreSQL.

## Preguntas que puede hacer la maestra

| Pregunta | Respuesta breve |
| --- | --- |
| ¿Qué lenguajes y programas se usaron? | HTML, CSS y JavaScript para la interfaz; JavaScript en Node.js para el servidor; SQL y PostgreSQL para guardar y calcular. La biblioteca `pg` conecta Node.js con PostgreSQL y `pnpm` gestiona dependencias. PowerShell inicia el proyecto, DBeaver permite inspeccionar la base y Obsidian conserva la documentación. Los Excel fueron referencias de criterios, no datos reales importados. |
| ¿Se usó alguna herramienta de apoyo para programar? | Codex ayudó a implementar, revisar y documentar el prototipo. Las reglas de cálculo se contrastaron con los Excel y los casos ambiguos quedaron documentados como decisiones que requieren validación antes de uso real. |
| ¿Usaron React, Express o un ORM? | No. La interfaz usa JavaScript del navegador; el servidor usa el módulo HTTP de Node.js y `pg` para consultar PostgreSQL. |
| ¿Cómo se conectan las páginas con la base? | Navegador → API HTTP del servidor Node.js → `pg` → PostgreSQL. La contraseña de la base queda en la configuración del servidor, no en el HTML. |
| ¿Por qué usar una base en vez de seguir en Excel? | Para relacionar cajeros, centros, supervisores, períodos, tareas y criterios; validar datos y consultar el mismo estado desde ambos roles. |
| ¿Qué son una clave primaria y una foránea aquí? | Un ID identifica cada fila; columnas como `centro_id`, `supervisor_id` y `cajero_id` enlazan filas relacionadas y ayudan a mantener la integridad. |
| ¿Dónde se guarda la calificación? | Los valores capturados se guardan en las tablas de mediciones y operaciones. La vista SQL `resultado_final` calcula los porcentajes al consultar; el promedio mensual se calcula a partir de esa vista. |
| ¿Qué diferencia hay entre tabla y vista? | La tabla almacena filas; la vista representa una consulta que combina y calcula datos de tablas. |
| ¿Las tareas forman parte del 100%? | No. Las tareas sirven para seguimiento operativo y sus conteos se muestran por separado. |
| ¿Por qué septiembre tenía 248 cajeros? | Se reservaron los cajeros 001 y 025 para capturar dos casos. Ambos ya se completaron y el promedio de septiembre reúne a los 250 cajeros. |
| ¿Cómo se calcula SAICEL? | Se compara la operación del cajero con el máximo del mismo centro, día y período; se promedian sus proporciones y se aplica un máximo de 29%. |
| ¿Por qué sigue apareciendo `sicatel` en SQL? | Se corrigió el nombre visible a SAICEL. Se conservaron identificadores técnicos antiguos para que las consultas, la vista y los datos existentes siguieran funcionando. |
| ¿Qué pasa si calidad da 0%? | Puede ser el puntaje previsto por la regla para tres o más incidencias. Hay que revisar el valor capturado; no es necesariamente un dato ausente. |
| ¿Cómo se calcula antigüedad? | Cuenta lunes a viernes hasta el fin del período y compara con la mayor antigüedad de los participantes. No descuenta feriados. |
| ¿Qué puede ver un supervisor de otro equipo? | Puede consultar directorio y evaluaciones de la región, pero las operaciones que modifica, la captura y las tareas que administra se restringen a sus cajeros y centros. |
| ¿Qué puede hacer el cajero? | Ver su perfil, tareas, resultados propios y promedio regional; actualizar el estado de sus tareas y su perfil. No gestiona cuentas ni mediciones. |
| ¿Cómo protegen contraseñas y sesiones? | Las claves se guardan como hash con `scrypt` y sal aleatoria. Hay sesión con cookie `HttpOnly`, validación de rol y propiedad, protección CSRF y consultas SQL parametrizadas. |
| ¿Qué contiene `.env`? | Datos privados de configuración para que Node.js se conecte a PostgreSQL y escuche en el puerto configurado. Se usa en el servidor y no se entrega al navegador. |
| ¿Cómo se comprobó el funcionamiento? | Hay pruebas automatizadas de autenticación, permisos, validaciones, cálculos y operaciones, además de comprobaciones directas de la base y pruebas manuales de las pantallas. Para ejecutar la batería de integración se necesita la contraseña administrativa local en el entorno de pruebas. |
| ¿Por qué borrar un usuario no quitó a alguien de Mi equipo? | `usuario` es la cuenta de acceso; `cajero` es el registro del empleado. Son entidades distintas. Además, una pantalla abierta necesita volver a consultar los datos para reflejar cambios hechos directamente en la base. |
| ¿Los 250 cajeros son reales? | No. Son datos ficticios para probar pantallas, filtros, roles y promedios. Hay cinco supervisores, 50 cajeros por supervisor, 70 centros y nueve períodos completos de enero a septiembre. |
| ¿Cómo se recrea el proyecto en otra máquina? | Se necesitan los archivos del portal y del esquema, PostgreSQL, Node.js, dependencias, configuración privada propia, roles/permisos y los scripts o un respaldo de datos. Copiar sólo HTML no copia la base. |
| ¿Ya funciona en un servidor externo? | Todavía no. Funciona localmente en `127.0.0.1`. Para despliegue externo harían falta alojamiento, HTTPS, configuración segura y acceso privado a PostgreSQL. |
| ¿Qué limitaciones reconocen? | Es un prototipo con datos ficticios. Algunos límites de reglas se concretaron porque el Excel no resolvía todos los casos; deben validarse con quien defina la política real. Los días festivos no se descuentan y todavía no hay despliegue público. |

## Si algo falla durante la exposición

- **No abre `127.0.0.1:3000`:** comprueba que PowerShell siga mostrando el servidor iniciado y que PostgreSQL esté `Running`.
- **La pantalla muestra datos anteriores:** recarga el navegador. Las ediciones directas en DBeaver no actualizan una página que ya estaba abierta.
- **No deja guardar SAICEL:** revisa que la fecha corresponda al período, que el cajero pertenezca a ese supervisor y que el centro sea el asignado.
- **No ves septiembre:** recarga el navegador y selecciona `Evaluación septiembre 2026`. Ya está creado; no crees otro con el mismo nombre.
- **Un resultado dice Parcial:** comprueba siete criterios manuales y operaciones SAICEL válidas del cajero en ese período.
- **Una tarea aparece Vencida:** compara su fecha límite con la fecha actual; Vencida es un estado visible calculado para tareas sin completar.
- **Cambió el número de cajeros o supervisores:** una cuenta nueva puede crear un cajero nuevo. Menciona que los números iniciales eran el estado de prueba antes de la demostración.
- **Te piden ver una contraseña de PostgreSQL o `.env`:** explica su función sin proyectar su contenido. Para mostrar la conexión usa la interfaz de DBeaver ya configurada.

## Cierre sugerido

> «Hoy se puede recorrer el ciclo completo: acceder por rol, consultar los equipos, asignar y completar tareas, registrar mediciones y operaciones, y ver los resultados individuales y promedios calculados desde PostgreSQL. Es una versión local con datos de prueba. Lo siguiente para una versión real sería validar todas las reglas de negocio, probar con usuarios de la organización y preparar un despliegue seguro».

## Diapositiva de desarrollo y conexión

El archivo `Desarrollo_base_datos_interfaces.pptx` está en `C:\Users\jecha\Desktop\medicion-web`. Contiene una sola diapositiva editable para explicar el recorrido de datos: interfaces web → API Node.js (`server.mjs` y `db.mjs`) → PostgreSQL.

Para comprobar la creación de la base durante la exposición, abre DBeaver y muestra la base `Medicion`, el esquema `medicion`, sus tablas y la vista `resultado_final`. Una consulta de solo lectura hecha el 25 de octubre de 2026 confirmó `Medicion`, 11 tablas y `medicion.resultado_final`. Como prueba de conexión, registra una tarea desde el portal, recarga la página y consulta ese registro en DBeaver.
