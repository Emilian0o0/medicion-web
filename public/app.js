const page = document.body.dataset.page;
const $ = (s) => document.querySelector(s);
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const html = (parts, ...values) =>
  parts.reduce(
    (text, part, index) => text + part + (index < values.length ? values[index] : ''),
    '',
  );
const pct = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 2 }).format(
    Number(n || 0),
  );
const shortDate = (v) =>
  v
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(v))
    : 'Sin dato';
const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
let user,
  csrf,
  data,
  view = 'inicio',
  filterPeriod = '',
  filterCashier = '',
  filterScope = 'region',
  filterCenter = '',
  teamScope = 'region',
  teamQuery = '',
  taskQuery = '',
  taskStatus = '',
  taskPriority = '',
  taskCashier = '',
  taskDate = '',
  operationDate = '',
  operationCenter = '';
const titles = {
  inicio: 'Inicio',
  equipo: 'Mi equipo',
  tareas: 'Tareas',
  rendimiento: 'Rendimiento',
  evaluacion: 'Registrar mediciones',
  cuentas: 'Crear cuentas',
  perfil: 'Mi perfil',
};
const supervisor = () => user?.rol === 'supervisor';
async function api(path, method = 'GET', payload) {
  const r = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const result = await r.json();
  if (!r.ok) {
    if (r.status === 401 && page !== 'login') location.assign('/');
    throw Error(result.error || 'No fue posible completar la solicitud.');
  }
  return result;
}
function toast(message, error = false) {
  const box = $('#toast');
  box.hidden = false;
  box.textContent = message;
  box.classList.toggle('is-error', error);
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (box.hidden = true), 5000);
}
function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join('')
    .toUpperCase();
}
function heading(title, subtitle) {
  return html`<div class="page-heading">
    <div>
      <span class="eyebrow">${supervisor() ? 'SUPERVISIÓN' : 'MI ESPACIO'}</span>
      <h1>${esc(title)}</h1>
      <p>${esc(subtitle)}</p>
    </div>
    <span class="role-label">${supervisor() ? 'SUPERVISOR' : 'CAJERO'}</span>
  </div>`;
}
function stat(label, value, foot, accent = false) {
  return html`<div class="stat${accent ? ' accent' : ''}">
    <span class="stat-label">${esc(label)}</span>
    <div class="stat-value">${esc(value)}</div>
    <span class="stat-foot">${esc(foot)}</span>
  </div>`;
}
const badge = (status) =>
  html`<span
    class="pill ${status === 'Completada' ? 'good' : status === 'Vencida' ? 'bad' : status === 'Pendiente' ? 'warn' : ''}"
    >${esc(status)}</span
  >`;
const empty = (message) => html`<div class="empty">${esc(message)}</div>`;
function options(rows, value, label, selected = '') {
  return rows
    .map(
      (r) =>
        html`<option
          value="${esc(r[value])}"
          ${String(selected) === String(r[value]) ? 'selected' : ''}
        >
          ${esc(typeof label === 'function' ? label(r) : r[label])}
        </option>`,
    )
    .join('');
}
function counts(tasks = data.tasks) {
  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.estado === 'Completada').length,
    pending: tasks.filter((t) => t.estado !== 'Completada' && t.estado_visible !== 'Vencida')
      .length,
    overdue: tasks.filter((t) => t.estado_visible === 'Vencida').length,
  };
}
function tasksTable(tasks, full = true) {
  if (!tasks.length) return empty('No hay tareas asignadas todavía.');
  return html`<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Tarea</th>
          ${supervisor() ? '<th>Cajero</th>' : ''}
          <th>Prioridad</th>
          <th>Fecha límite</th>
          <th>Estado</th>
          ${full ? '<th>Actualizar</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${tasks
          .map(
            (t) =>
              html`<tr>
                <td>
                  ${esc(t.titulo)}${full ? html`<small class="task-description">${esc(t.descripcion)}</small>` : ''}
                </td>
                ${supervisor() ? html`<td>${esc(t.nombre_completo)}</td>` : ''}
                <td>${esc(t.prioridad)}</td>
                <td>${shortDate(t.fecha_limite)}</td>
                <td>${badge(t.estado_visible)}</td>
                ${
                  full
                    ? html`<td>
                        <select
                          class="task-select"
                          data-task="${esc(t.tarea_id)}"
                          aria-label="Estado de ${esc(t.titulo)}"
                        >
                          ${['Pendiente', 'En progreso', 'Completada'].map((s) => html`<option ${s === t.estado ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                      </td>`
                    : ''
                }
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function filteredTasks() {
  const query = taskQuery.toLocaleLowerCase();
  return data.tasks.filter((t) => {
    const text =
      `${t.titulo} ${t.descripcion || ''} ${t.nombre_completo || ''}`.toLocaleLowerCase();
    return (
      (!query || text.includes(query)) &&
      (!taskStatus || t.estado_visible === taskStatus) &&
      (!taskPriority || t.prioridad === taskPriority) &&
      (!taskCashier || String(t.cajero_id) === taskCashier) &&
      (!taskDate || String(t.fecha_limite).slice(0, 10) === taskDate)
    );
  });
}
function updateTaskList() {
  const rows = filteredTasks();
  $('#task-list').innerHTML = tasksTable(rows);
  $('#task-count').textContent = `${rows.length} de ${data.tasks.length} en total`;
}
function filteredOperations() {
  return data.operations.filter(
    (o) =>
      (!operationDate || String(o.fecha).slice(0, 10) === operationDate) &&
      (!operationCenter || String(o.centro_id) === operationCenter),
  );
}
function operationsTable(rows) {
  if (!rows.length) return empty('No se encontraron operaciones con esa búsqueda.');
  const cashiers = new Map(data.cashiers.map((c) => [c.cajero_id, c.nombre_completo]));
  const periods = new Map(data.periods.map((p) => [p.periodo_id, p.nombre]));
  return html`<div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Cajero</th>
          <th>Período</th>
          <th>Centro</th>
          <th>Fecha</th>
          <th>Operaciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (o) =>
              html`<tr>
                <td>${esc(cashiers.get(o.cajero_id))}</td>
                <td>${esc(periods.get(o.periodo_id))}</td>
                <td>${esc(o.centro_nombre)}</td>
                <td>${shortDate(o.fecha)}</td>
                <td>${esc(o.operaciones)}</td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function updateOperationList() {
  const rows = filteredOperations();
  $('#operation-list').innerHTML = operationsTable(rows);
  $('#operation-count').textContent = `${rows.length} de ${data.operations.length} registros`;
}
function registeredOperations() {
  const rows = filteredOperations();
  return html`<section class="card">
    <div class="card-head">
      <h2>Operaciones registradas</h2>
      <span id="operation-count" class="muted"
        >${rows.length} de ${data.operations.length} registros</span
      >
    </div>
    <div class="toolbar">
      <label
        >Fecha<input id="operation-date-filter" type="date" value="${esc(operationDate)}" /></label
      ><label
        >Centro de atención<select id="operation-center-filter">
          <option value="">Todos los centros</option>
          ${options(data.centers, 'centro_id', (r) => `${r.codigo} · ${r.nombre}`, operationCenter)}
        </select></label
      >
    </div>
    <div id="operation-list">${operationsTable(rows)}</div>
  </section>`;
}
function teamTable(rows = data.cashiers, wrapClass = '') {
  return html`<div class="table-wrap ${esc(wrapClass)}">
    <table>
      <thead>
        <tr>
          <th>Cajero</th>
          <th>N.º empleado</th>
          <th>Centro de atención</th>
          ${supervisor() ? '<th>Supervisor</th>' : ''}
          <th>Tareas</th>
          <th>Completadas</th>
          <th>Cumplimiento</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((c) => {
            const ct =
              c.tareas_total === undefined
                ? counts(data.tasks.filter((t) => t.cajero_id === c.cajero_id))
                : { total: Number(c.tareas_total), completed: Number(c.tareas_completadas) };
            return html`<tr>
              <td>
                ${esc(c.nombre_completo)}<small
                  >${c.correo ? esc(c.correo) : '<span class="pending-text">Pendiente</span>'}</small
                >
              </td>
              <td>${esc(c.numero_empleado)}</td>
              <td>${esc(c.centro_nombre || 'Sin asignar')}</td>
              ${supervisor() ? html`<td>${esc(c.supervisor_nombre || 'Sin asignar')}</td>` : ''}
              <td>${ct.total}</td>
              <td>${ct.completed}</td>
              <td>${ct.total ? pct(ct.completed / ct.total) : '—'}</td>
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  </div>`;
}
function metricSummary(r) {
  if (!r) return empty('El supervisor aún no ha registrado una evaluación.');
  return html`<span class="eyebrow">${esc(r.periodo)}</span>
    <div class="score">${pct(r.porcentaje_final)}</div>
    <p class="score-note">
      ${r.faltantes.length ? 'Puntaje parcial · faltan ' + r.faltantes.length + ' criterios' : 'Evaluación completa'}
      ·
      ${esc(r.nombre_completo)}${supervisor() && r.centro_nombre ? ' · ' + esc(r.centro_nombre) : ''}
    </p>
    ${data.criteria
      .map(
        (c) =>
          html`<div class="metric">
            <div class="metric-line">
              <span>${esc(c.nombre)}</span
              ><strong
                >${r.faltantes.includes(c.codigo) ? 'Pendiente' : pct(r[c.codigo])} /
                ${pct(c.peso_maximo)}</strong
              >
            </div>
            <progress
              value="${Number(r[c.codigo] || 0)}"
              max="${Number(c.peso_maximo)}"
              aria-label="${esc(c.nombre)}"
            ></progress>
          </div>`,
      )
      .join('')}`;
}
function monthlySummary(r) {
  if (!r) return empty('Todavía no hay evaluaciones mensuales.');
  return html`<span class="eyebrow">${esc(r.periodo)}</span>
    <div class="score">${pct(r.porcentaje_final)}</div>
    <p class="score-note">
      Promedio de ${esc(r.cajeros)}
      ${Number(r.cajeros) === 1 ? 'cajero evaluado' : 'cajeros evaluados'}
    </p>
    ${data.criteria
      .map(
        (c) =>
          html`<div class="metric">
            <div class="metric-line">
              <span>${esc(c.nombre)}</span
              ><strong>${pct(r[c.codigo])} / ${pct(c.peso_maximo)}</strong>
            </div>
            <progress
              value="${Number(r[c.codigo] || 0)}"
              max="${Number(c.peso_maximo)}"
              aria-label="Promedio de ${esc(c.nombre)}"
            ></progress>
          </div>`,
      )
      .join('')}`;
}
function trendChart(r, scope) {
  const periods = [...data.periods].sort((a, b) =>
    String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)),
  );
  const active = periods.findIndex((p) => String(p.periodo_id) === String(r.periodo_id));
  const start = Math.max(0, Math.min(active - 5, periods.length - 12));
  const points = periods.slice(start, start + 12).map((p) => {
    let value = null;
    if (scope === 'region')
      value =
        data.monthlyAverages.find((a) => String(a.periodo_id) === String(p.periodo_id))
          ?.porcentaje_final ?? null;
    else {
      const rows = data.results.filter(
        (result) =>
          String(result.periodo_id) === String(p.periodo_id) &&
          (scope === 'cashier'
            ? String(result.cajero_id) === String(r.cajero_id)
            : scope === 'team'
              ? String(result.supervisor_id) === String(user.usuario_id)
              : String(result.centro_id) === String(r.centro_id)),
      );
      if (rows.length)
        value =
          rows.reduce((sum, result) => sum + Number(result.porcentaje_final || 0), 0) / rows.length;
    }
    const month = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(
      new Date(p.fecha_inicio),
    );
    return {
      period: p,
      month,
      value: value === null ? null : Number(value),
      active: String(p.periodo_id) === String(r.periodo_id),
    };
  });
  const values = points.filter((p) => p.value !== null).map((p) => p.value * 100);
  const minimum = Math.min(...values),
    maximum = Math.max(...values);
  const padding = Math.max(1, (maximum - minimum) * 0.15);
  const lower = Math.max(0, Math.floor((minimum - padding) * 10) / 10);
  const upper = Math.min(100, Math.ceil((maximum + padding) * 10) / 10);
  const x = (index) => 28 + (544 * (index + 0.5)) / points.length;
  const y = (value) => 202 - ((value * 100 - lower) * 178) / (upper - lower);
  const segments = points
    .slice(1)
    .map((p, index) =>
      p.value === null || points[index].value === null
        ? ''
        : html`<line
            class="trend-chart-line"
            x1="${x(index)}"
            y1="${y(points[index].value)}"
            x2="${x(index + 1)}"
            y2="${y(p.value)}"
          />`,
    )
    .join('');
  const dots = points
    .map((p, index) =>
      p.value === null
        ? ''
        : html`<circle
            class="trend-chart-dot${p.active ? ' active' : ''}"
            cx="${x(index)}"
            cy="${y(p.value)}"
            r="${p.active ? 6 : 4}"
            ><title>${esc(p.period.nombre)}: ${pct(p.value)}</title></circle
          >`,
    )
    .join('');
  const description = points
    .map((p) => `${p.period.nombre}: ${p.value === null ? 'sin evaluación' : pct(p.value)}`)
    .join(', ');
  return html`<figure
    class="trend-chart"
    role="img"
    aria-label="Evolución del porcentaje final. ${esc(description)}"
  >
    <figcaption>
      Evolución mensual <span>Escala ${lower.toFixed(1)}% a ${upper.toFixed(1)}%</span>
    </figcaption>
    <div class="trend-chart-plot" aria-hidden="true">
      <div class="trend-chart-axis">
        <span>${upper.toFixed(1)}%</span><span>${lower.toFixed(1)}%</span>
      </div>
      <svg viewBox="0 0 600 226" preserveAspectRatio="none" focusable="false">
        <line class="trend-chart-grid" x1="0" y1="24" x2="600" y2="24" />
        <line class="trend-chart-grid" x1="0" y1="113" x2="600" y2="113" />
        <line class="trend-chart-grid" x1="0" y1="202" x2="600" y2="202" />
        ${segments}${dots}
      </svg>
    </div>
    <div class="trend-chart-labels" aria-hidden="true">
      ${points.map((p) => html`<span class="trend-chart-label${p.active ? ' active' : ''}">${esc(p.month)}</span>`).join('')}
    </div>
    <p class="trend-chart-current">${esc(r.periodo)} · ${pct(r.porcentaje_final)}</p>
  </figure>`;
}
function performanceCard(r, scope, average = false) {
  return html`<section class="card performance-card">
    <div class="performance-card-head">
      <span>${average ? 'Promedio mensual' : 'Evaluación individual'}</span
      ><button type="button" class="small-button" data-chart-toggle aria-pressed="false">
        Ver gráfica
      </button>
    </div>
    <div class="performance-card-summary">${average ? monthlySummary(r) : metricSummary(r)}</div>
    <div class="performance-card-chart" hidden>${trendChart(r, scope)}</div>
  </section>`;
}
function home() {
  const ct = counts();
  const r = data.monthlyAverages[0];
  return (
    heading(
      `Hola, ${user.nombre.split(' ')[0]}`,
      supervisor()
        ? 'Aquí tienes el estado del equipo y sus actividades.'
        : 'Aquí tienes tus tareas y el promedio mensual de todos los cajeros.',
    ) +
    html`<div class="stats">
        ${stat(
          supervisor() ? 'Cajeros del equipo' : 'Tareas asignadas',
          supervisor() ? data.cashiers.length : ct.total,
          supervisor() ? 'Directorio de empleados' : 'En tu cuenta',
          true,
        )}
        ${stat('Completadas', ct.completed, 'Tareas finalizadas')}
        ${stat('Pendientes', ct.pending, 'Por hacer o en progreso')}
        ${stat('Vencidas', ct.overdue, 'Fuera de la fecha límite')}
      </div>
      <div class="grid-two">
        <div>
          <section class="card">
            <div class="card-head">
              <h2>${supervisor() ? 'Actividad del equipo' : 'Mis tareas recientes'}</h2>
              <button class="small-button" data-go="tareas">Ver todas →</button>
            </div>
            ${tasksTable(data.tasks.slice(0, 5), false)}
          </section>
          ${
            supervisor()
              ? html`<section class="card">
                  <div class="card-head">
                    <h2>Cajeros</h2>
                    <button class="small-button" data-go="equipo">Ver equipo →</button>
                  </div>
                  ${teamTable(data.cashiers.slice(0, 5))}
                </section>`
              : ''
          }
        </div>
        <section class="card">
          <div class="card-head">
            <h2>Último promedio mensual</h2>
            <button class="small-button" data-go="rendimiento">Detalle →</button>
          </div>
          ${monthlySummary(r)}
        </section>
      </div>`
  );
}
function profile() {
  const c = data.cashiers.find((c) => c.cajero_id === user.cajero_id);
  return (
    heading('Mi perfil', 'Consulta tus datos y actualiza tu información de acceso.') +
    html`<div class="grid-even">
      <section class="card">
        <div class="profile-info">
          <div class="avatar large">${esc(initials(user.nombre))}</div>
          <div>
            <h2>${esc(user.nombre)}</h2>
            <p>${supervisor() ? 'Supervisor de operaciones' : 'Cajero'}</p>
          </div>
        </div>
        <dl class="details">
          <div>
            <dt>Correo electrónico</dt>
            <dd>${esc(user.correo)}</dd>
          </div>
          <div>
            <dt>Rol</dt>
            <dd>${supervisor() ? 'Supervisor' : 'Cajero'}</dd>
          </div>
          ${
            c
              ? html`<div>
                    <dt>N.º de empleado</dt>
                    <dd>${esc(c.numero_empleado)}</dd>
                  </div>
                  <div>
                    <dt>Centro de atención</dt>
                    <dd>${esc(c.centro_nombre || 'Sin asignar')}</dd>
                  </div>
                  <div>
                    <dt>Supervisor</dt>
                    <dd>${esc(c.supervisor_nombre || 'Sin asignar')}</dd>
                  </div>
                  <div>
                    <dt>Fecha de ingreso</dt>
                    <dd>${shortDate(c.fecha_ingreso)}</dd>
                  </div>`
              : ''
          }
        </dl>
        <hr class="divider" />
        <form id="profile-form">
          <label
            >Nombre completo<input
              name="nombre"
              value="${esc(user.nombre)}"
              maxlength="120"
              required /></label
          ><button class="primary">Guardar nombre</button>
          <p class="form-message" role="status"></p>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h2>Cambiar contraseña</h2></div>
        <p class="help">
          Usa entre 10 y 128 caracteres. Al cambiarla se cerrarán las demás sesiones de tu cuenta.
        </p>
        <form id="password-form">
          <label
            >Contraseña actual<input
              type="password"
              name="actual"
              autocomplete="current-password"
              required
              maxlength="128" /></label
          ><label
            >Nueva contraseña<input
              type="password"
              name="nueva"
              autocomplete="new-password"
              minlength="10"
              maxlength="128"
              required /></label
          ><label
            >Confirmar nueva contraseña<input
              type="password"
              name="confirmacion"
              autocomplete="new-password"
              minlength="10"
              maxlength="128"
              required /></label
          ><button class="primary">Actualizar contraseña</button>
          <p class="form-message" role="status"></p>
        </form>
      </section>
    </div>`
  );
}
function tasksPage() {
  const assignment = supervisor()
    ? html`<section class="card">
        <div class="card-head"><h2>Asignar una tarea</h2></div>
        <form id="task-form">
          <div class="row">
            <label
              >Título<input
                name="titulo"
                placeholder="Ej. Revisar corte diario"
                maxlength="160"
                required /></label
            ><label
              >Cajero<select name="cajero_id" required>
                <option value="">Selecciona un cajero</option>
                ${options(data.cashiers, 'cajero_id', 'nombre_completo')}
              </select></label
            >
          </div>
          <label
            >Descripción<textarea
              name="descripcion"
              maxlength="3000"
              placeholder="Indica los detalles de la actividad"
            ></textarea>
          </label>
          <div class="row">
            <label
              >Prioridad<select name="prioridad">
                <option>Media</option>
                <option>Alta</option>
                <option>Baja</option>
              </select></label
            ><label
              >Fecha límite<input name="fecha_limite" type="date" required value="${today()}"
            /></label>
          </div>
          <button class="primary">Asignar tarea</button>
          <p class="form-message" role="status"></p>
        </form>
      </section>`
    : '';
  return (
    heading(
      supervisor() ? 'Tareas del equipo' : 'Mis tareas',
      supervisor()
        ? 'Asigna actividades y sigue su cumplimiento.'
        : 'Actualiza el estado de tus actividades asignadas.',
    ) +
    assignment +
    html`<section class="card">
      <div class="card-head">
        <h2>${supervisor() ? 'Todas las tareas' : 'Tareas asignadas'}</h2>
        <span id="task-count" class="muted"
          >${filteredTasks().length} de ${data.tasks.length} en total</span
        >
      </div>
      <div class="toolbar">
        <label
          >Buscar<input
            id="task-query-filter"
            class="search"
            value="${esc(taskQuery)}"
            placeholder="Título, descripción o cajero" /></label
        >${
          supervisor()
            ? html`<label
                >Cajero<select id="task-cashier-filter">
                  <option value="">Todos los cajeros</option>
                  ${options(data.cashiers, 'cajero_id', 'nombre_completo', taskCashier)}
                </select></label
              >`
            : ''
        }<label
          >Estado<select id="task-status-filter">
            <option value="">Todos los estados</option>
            ${['Pendiente', 'En progreso', 'Completada', 'Vencida'].map((s) => html`<option ${taskStatus === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></label
        ><label
          >Prioridad<select id="task-priority-filter">
            <option value="">Todas las prioridades</option>
            ${['Alta', 'Media', 'Baja'].map((s) => html`<option ${taskPriority === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></label
        ><label
          >Fecha límite<input id="task-date-filter" type="date" value="${esc(taskDate)}" /></label
        ><button class="secondary" id="task-filter-reset" type="button">Limpiar filtros</button>
      </div>
      <div id="task-list">${tasksTable(filteredTasks())}</div>
    </section>`
  );
}
function directoryRows() {
  const rows = teamScope === 'mine' ? data.cashiers : data.regionalCashiers;
  const query = teamQuery.toLocaleLowerCase();
  return rows.filter((c) =>
    `${c.nombre_completo} ${c.numero_empleado} ${c.centro_nombre || ''} ${c.supervisor_nombre || ''} ${c.correo || ''}`
      .toLocaleLowerCase()
      .includes(query),
  );
}
function team() {
  const rows = directoryRows();
  return (
    heading('Mi equipo', 'Consulta la región completa o sólo los cajeros a tu cargo.') +
    html`<section class="card">
      <div class="card-head">
        <h2>Directorio de cajeros</h2>
        <span id="team-count" class="muted">${rows.length} cajeros</span>
      </div>
      <div class="toolbar">
        <label
          >Mostrar<select id="team-scope">
            <option value="region" ${teamScope === 'region' ? 'selected' : ''}>
              Toda la región
            </option>
            <option value="mine" ${teamScope === 'mine' ? 'selected' : ''}>Mis cajeros</option>
          </select></label
        ><label
          >Buscar<input
            id="team-search"
            class="search"
            value="${esc(teamQuery)}"
            placeholder="Nombre, número, centro o supervisor"
            aria-label="Buscar cajero"
        /></label>
      </div>
      <div id="team-list">${teamTable(rows)}</div>
    </section>`
  );
}
function scopedResults() {
  if (!supervisor() || filterScope === 'region') return data.results;
  return data.results.filter(
    (r) =>
      String(r.supervisor_id) === String(user.usuario_id) &&
      (filterScope !== 'centers' || !filterCenter || String(r.centro_id) === filterCenter),
  );
}
function performanceRows() {
  return scopedResults().filter(
    (r) =>
      (!filterPeriod || String(r.periodo_id) === filterPeriod) &&
      (!filterCashier || String(r.cajero_id) === filterCashier),
  );
}
function performanceCashiers() {
  const rows = filterScope === 'region' ? data.results : data.cashiers;
  const selected =
    filterScope === 'centers' && filterCenter
      ? rows.filter((r) => String(r.centro_id) === filterCenter)
      : rows;
  return [...new Map(selected.map((r) => [String(r.cajero_id), r])).values()].sort(
    (a, b) => Number(a.numero_empleado) - Number(b.numero_empleado),
  );
}
function averageOf(rows, period, label, centerId) {
  if (!rows.length) return null;
  const average = (key) => rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
  return {
    periodo_id: period.periodo_id,
    periodo: label || period.nombre,
    centro_id: centerId,
    cajeros: rows.length,
    porcentaje_final: average('porcentaje_final'),
    ...Object.fromEntries(data.criteria.map((c) => [c.codigo, average(c.codigo)])),
  };
}
function performanceDetail() {
  const rows = performanceRows();
  if (!rows.length) return empty('No hay evaluaciones para esta selección.');
  return html`<div class="grid-even">
    ${rows
      .slice(0, 6)
      .map((r) => performanceCard(r, 'cashier'))
      .join('')}
  </div>`;
}
function monthlyAverageCards() {
  let rows;
  if (!supervisor() || filterScope === 'region') {
    rows = data.monthlyAverages.filter(
      (r) => !filterPeriod || String(r.periodo_id) === filterPeriod,
    );
  } else if (filterScope === 'team') {
    rows = data.periods
      .filter((p) => !filterPeriod || String(p.periodo_id) === filterPeriod)
      .map((p) =>
        averageOf(
          scopedResults().filter((r) => String(r.periodo_id) === String(p.periodo_id)),
          p,
        ),
      );
  } else {
    const period = data.periods.find((p) => String(p.periodo_id) === filterPeriod);
    rows = period
      ? data.centers
          .filter((c) => !filterCenter || String(c.centro_id) === filterCenter)
          .map((c) =>
            averageOf(
              scopedResults().filter(
                (r) =>
                  String(r.periodo_id) === filterPeriod &&
                  String(r.centro_id) === String(c.centro_id),
              ),
              period,
              `${c.nombre} · ${period.nombre}`,
              c.centro_id,
            ),
          )
      : [];
  }
  rows = rows.filter(Boolean);
  if (!rows.length) return empty('No hay promedios para este período.');
  return html`<div class="grid-even">
    ${rows.map((r) => performanceCard(r, filterScope, true)).join('')}
  </div>`;
}
function performanceTable() {
  const rows = performanceRows();
  if (!rows.length) return empty('No hay evaluaciones para esta selección.');
  return html`<section class="card">
    <div class="card-head">
      <h2>Resultados por período</h2>
      <span class="muted">${rows.length} evaluaciones</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Cajero / período</th>
            ${supervisor() ? '<th>Centro</th><th>Supervisor</th>' : ''}${data.criteria.map((c) => html`<th>${esc(c.nombre)}</th>`).join('')}
            <th>Total</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                html`<tr>
                  <td>${esc(r.nombre_completo)}<small>${esc(r.periodo)}</small></td>
                  ${
                    supervisor()
                      ? html`<td>${esc(r.centro_nombre || 'Sin asignar')}</td>
                          <td>${esc(r.supervisor_nombre || 'Sin asignar')}</td>`
                      : ''
                  }${data.criteria.map((c) => html`<td>${r.faltantes.includes(c.codigo) ? '—' : pct(r[c.codigo])}</td>`).join('')}
                  <td><strong>${pct(r.porcentaje_final)}</strong></td>
                  <td>
                    <span class="pill ${r.faltantes.length ? 'warn' : 'good'}"
                      >${r.faltantes.length ? 'Parcial' : 'Completo'}</span
                    >
                  </td>
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}
function performanceTableArea() {
  return html`<div id="performance-table-area">
    <button
      id="performance-table-toggle"
      class="secondary"
      type="button"
      aria-expanded="false"
      aria-controls="performance-table"
    >
      Ver tabla completa
    </button>
    <div id="performance-table" hidden></div>
  </div>`;
}
function performance() {
  if (supervisor() && filterScope === 'centers' && !filterPeriod)
    filterPeriod = String(data.monthlyAverages[0]?.periodo_id || data.periods[0]?.periodo_id || '');
  const averageTitle =
    filterScope === 'team'
      ? 'Promedios mensuales de mi equipo'
      : filterScope === 'centers'
        ? 'Promedios de mis centros'
        : 'Promedios mensuales de la región';
  const detailTitle =
    filterScope === 'team'
      ? 'Evaluaciones individuales de mi equipo'
      : filterScope === 'centers'
        ? 'Evaluaciones individuales de mis centros'
        : 'Evaluaciones individuales de la región';
  return (
    heading(
      supervisor() ? 'Rendimiento regional y del equipo' : 'Mi rendimiento',
      supervisor()
        ? 'Consulta la región completa, tu equipo y tus centros.'
        : 'Porcentajes calculados a partir de las mediciones de PostgreSQL.',
    ) +
    html`${
        data.results.some((r) => r.faltantes.length)
          ? html`<p class="warning">
              Hay evaluaciones con datos incompletos. Su porcentaje es parcial hasta capturar todos
              los criterios y las operaciones SAICEL.
            </p>`
          : ''
      }
      <div class="toolbar">
        ${
          supervisor()
            ? html`<label
                >Vista<select id="scope-filter">
                  <option value="region" ${filterScope === 'region' ? 'selected' : ''}>
                    Región completa
                  </option>
                  <option value="team" ${filterScope === 'team' ? 'selected' : ''}>
                    Mis cajeros
                  </option>
                  <option value="centers" ${filterScope === 'centers' ? 'selected' : ''}>
                    Mis centros
                  </option>
                </select></label
              >`
            : ''
        }
        <label
          >Período<select id="period-filter">
            ${filterScope === 'centers' ? '' : '<option value="">Todos los períodos</option>'}${options(data.periods, 'periodo_id', 'nombre', filterPeriod)}
          </select></label
        >
        ${
          supervisor() && filterScope === 'centers'
            ? html`<label
                >Centro<select id="center-filter">
                  <option value="">Todos mis centros</option>
                  ${options(data.centers, 'centro_id', (r) => `${r.codigo} · ${r.nombre}`, filterCenter)}
                </select></label
              >`
            : ''
        }
        ${
          supervisor()
            ? html`<label
                >Cajero<select id="cashier-filter">
                  <option value="">Todos los cajeros</option>
                  ${options(performanceCashiers(), 'cajero_id', 'nombre_completo', filterCashier)}
                </select></label
              >`
            : ''
        }
      </div>
      <h2>${averageTitle}</h2>
      <p class="section-note">
        ${filterScope === 'centers' ? 'Cada tarjeta muestra el promedio de un centro asignado.' : 'Cada tarjeta promedia a los cajeros evaluados en ese período.'}
        El filtro de cajero sólo afecta el detalle individual.
      </p>
      <div id="monthly-average-list">${monthlyAverageCards()}</div>
      <h2>${supervisor() ? detailTitle : 'Mis evaluaciones'}</h2>
      <div id="performance-detail">${performanceDetail()}</div>
      <p class="section-note">
        SAICEL: 29% × promedio diario de operaciones / máximo del centro. Antigüedad: 1% × días
        hábiles desde ingreso / mayor antigüedad del período. Total: suma de los nueve criterios.
      </p>
      ${performanceTableArea()}`
  );
}
function evaluation() {
  const selectors = () =>
    html`<div class="row">
      <label
        >Cajero<select name="cajero_id" required>
          <option value="">Selecciona un cajero</option>
          ${options(data.cashiers, 'cajero_id', 'nombre_completo')}
        </select></label
      ><label
        >Período<select name="periodo_id" required>
          <option value="">Selecciona un período</option>
          ${options(data.periods, 'periodo_id', 'nombre')}
        </select></label
      >
    </div>`;
  return (
    heading(
      'Registrar mediciones',
      'Captura los datos del período para calcular los porcentajes automáticamente.',
    ) +
    html`<div class="grid-even">
        <section class="card">
          <div class="card-head"><h2>Evaluación por criterios</h2></div>
          <p class="help">
            Al seleccionar cajero y período se cargan los valores existentes. Guardar actualiza los
            siete criterios de esta evaluación.
          </p>
          <form id="measurement-form">
            ${selectors()}<label
              >Amonestaciones / faltas / suspensiones<select name="disciplinario" required>
                <option value="0">Sin incidencias (30%)</option>
                <option value="1">Amonestación (20%)</option>
                <option value="2">Suspensión (10%)</option>
                <option value="3">Falta (0%)</option>
              </select></label
            >
            <div class="row">
              <label
                >Incidencias en entrega de valores<input
                  type="number"
                  name="entrega_valores"
                  min="0"
                  step="1"
                  required
                  placeholder="0" /></label
              ><label
                >Faltantes y sobrantes ($)<input
                  type="number"
                  name="faltantes_sobrantes"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0.00"
              /></label>
            </div>
            <div class="row">
              <label
                >Errores o incidencias<input
                  type="number"
                  name="errores_incidencias"
                  min="0"
                  step="1"
                  required
                  placeholder="0" /></label
              ><label
                >Buzones de calidad<input
                  type="number"
                  name="calidad_servicio"
                  min="0"
                  step="1"
                  required
                  placeholder="0"
              /></label>
            </div>
            <div class="row">
              <label
                >Cursos mandatorios<select name="cursos" required>
                  <option value="1">Completados (3%)</option>
                  <option value="0">No completados (0%)</option>
                </select></label
              ><label
                >Campaña de encuestas GSI<select name="encuestas" required>
                  <option value="1">Cumplida (2%)</option>
                  <option value="0">No cumplida (0%)</option>
                </select></label
              >
            </div>
            <button class="primary">Guardar evaluación</button>
            <p class="form-message" role="status"></p>
          </form>
        </section>
        <div>
          <section class="card">
            <div class="card-head"><h2>Operaciones SAICEL</h2></div>
            <p class="help">
              Una fila por cajero, centro y día. Si ya existe, se actualiza la cantidad.
            </p>
            <form id="operation-form">
              ${selectors()}<label
                >Centro<select name="centro_id" required>
                  <option value="">Selecciona un centro</option>
                  ${options(data.centers, 'centro_id', (r) => `${r.codigo} · ${r.nombre}`)}
                </select></label
              >
              <div class="row">
                <label>Fecha<input type="date" name="fecha" required value="${today()}" /></label
                ><label
                  >Operaciones realizadas<input
                    type="number"
                    name="operaciones"
                    min="0"
                    step="1"
                    required
                /></label>
              </div>
              <button class="primary">Guardar operaciones</button>
              <p class="form-message" role="status"></p>
            </form>
          </section>
          <section class="card">
            <div class="card-head"><h2>Crear período</h2></div>
            <form id="period-form">
              <label
                >Nombre<input
                  name="nombre"
                  required
                  maxlength="100"
                  placeholder="Ej. Noviembre 2026"
              /></label>
              <div class="row">
                <label>Fecha inicial<input name="fecha_inicio" type="date" required /></label
                ><label>Fecha final<input name="fecha_fin" type="date" required /></label>
              </div>
              <button class="secondary">Crear período</button>
              <p class="form-message" role="status"></p>
            </form>
          </section>
        </div>
      </div>
      ${registeredOperations()}`
  );
}
function accounts() {
  return (
    heading('Crear cuentas', 'Cada usuario accede al panel correspondiente a su rol.') +
    html`<div class="grid-even">
      <section class="card">
        <div class="card-head"><h2>Nuevo usuario</h2></div>
        <form id="account-form">
          <label
            >Rol<select id="account-role" name="rol">
              <option value="cajero">Cajero</option>
              <option value="supervisor">Supervisor</option>
            </select></label
          >
          <div id="cashier-account-fields">
            <label
              >Vincular cajero<select id="existing-cashier" name="cajero_id">
                <option value="">Crear un cajero nuevo</option>
                ${options(
                  data.cashiers.filter((c) => !c.usuario_id),
                  'cajero_id',
                  'nombre_completo',
                )}
              </select></label
            >
            <div id="new-cashier-fields">
              <div class="row">
                <label
                  >N.º de empleado<input
                    name="numero_empleado"
                    type="number"
                    min="100000"
                    max="999999"
                    required /></label
                ><label>Fecha de ingreso<input name="fecha_ingreso" type="date" required /></label>
              </div>
              <label
                >Centro de atención<select name="centro_id" required>
                  <option value="">Selecciona un centro</option>
                  ${options(data.centers, 'centro_id', (r) => `${r.codigo} · ${r.nombre}`)}
                </select></label
              >
              <p class="help">
                Usa un número único de seis dígitos. El nuevo cajero quedará a tu cargo.
              </p>
            </div>
          </div>
          <label>Nombre completo<input name="nombre" maxlength="120" required /></label
          ><label
            >Correo electrónico<input
              name="correo"
              type="email"
              maxlength="254"
              required
              autocomplete="off" /></label
          ><label
            >Contraseña inicial<input
              name="contrasena"
              type="password"
              minlength="10"
              maxlength="128"
              required
              autocomplete="new-password"
          /></label>
          <p class="help">
            Comparte estas credenciales con el usuario para que pueda acceder. Podrá cambiar la
            contraseña desde su perfil.
          </p>
          <button class="primary">Crear cuenta</button>
          <p class="form-message" role="status"></p>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h2>Cuentas de cajeros</h2></div>
        ${teamTable(data.cashiers, 'account-table-scroll')}
        <p class="section-note">
          Las cuentas están protegidas por rol. Cada cajero consulta sólo sus tareas y sus
          evaluaciones.
        </p>
      </section>
    </div>`
  );
}
function render() {
  $('#user-name').textContent = user.nombre;
  $('#avatar').textContent = initials(user.nombre);
  $('#breadcrumb').textContent = titles[view];
  document.querySelectorAll('[data-view]').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
    if (el.dataset.view === view) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#content').innerHTML = (
    {
      inicio: home,
      perfil: profile,
      tareas: tasksPage,
      equipo: team,
      rendimiento: performance,
      evaluacion: evaluation,
      cuentas: accounts,
    }[view] || home
  )();
  bindForms();
}
async function refresh() {
  const me = await api('/api/me');
  user = me.user;
  csrf = me.csrf;
  data = await api('/api/dashboard');
  render();
}
function formAction(id, path, method, makePayload, onSuccess) {
  const form = $(id);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type=submit],button:not([type])'),
      message = form.querySelector('.form-message');
    button.disabled = true;
    message.textContent = '';
    message.classList.remove('error');
    try {
      const raw = Object.fromEntries(new FormData(form));
      const payload = makePayload ? makePayload(raw) : raw;
      await api(path, method, payload);
      if (onSuccess) await onSuccess();
      else await refresh();
      toast('Cambios guardados correctamente.');
    } catch (e) {
      message.textContent = e.message;
      message.classList.add('error');
    } finally {
      button.disabled = false;
    }
  });
}
function bindForms() {
  formAction('#profile-form', '/api/profile', 'PATCH');
  formAction(
    '#password-form',
    '/api/password',
    'POST',
    (b) => {
      if (b.nueva !== b.confirmacion) throw Error('Las contraseñas nuevas no coinciden.');
      return b;
    },
    async () => $('#password-form').reset(),
  );
  formAction('#task-form', '/api/tasks', 'POST');
  formAction('#account-form', '/api/users', 'POST');
  formAction('#period-form', '/api/periods', 'POST');
  formAction('#operation-form', '/api/operations', 'POST');
  formAction('#measurement-form', '/api/measurements', 'POST', (b) => ({
    cajero_id: b.cajero_id,
    periodo_id: b.periodo_id,
    valores: Object.fromEntries(
      Object.entries(b).filter(([k]) => !['cajero_id', 'periodo_id'].includes(k)),
    ),
  }));
  const measurement = $('#measurement-form');
  if (measurement) {
    const loadValues = () => {
      const c = measurement.elements.cajero_id.value,
        p = measurement.elements.periodo_id.value;
      for (const k of [
        'disciplinario',
        'entrega_valores',
        'faltantes_sobrantes',
        'errores_incidencias',
        'calidad_servicio',
        'cursos',
        'encuestas',
      ]) {
        const existing = data.measures.find(
          (m) => String(m.cajero_id) === c && String(m.periodo_id) === p && m.criterio_codigo === k,
        );
        measurement.elements[k].value = existing
          ? String(Number(existing.valor))
          : ['cursos', 'encuestas'].includes(k)
            ? '1'
            : k === 'disciplinario'
              ? '0'
              : '';
      }
    };
    measurement.elements.cajero_id.addEventListener('change', loadValues);
    measurement.elements.periodo_id.addEventListener('change', loadValues);
  }
  const operation = $('#operation-form');
  if (operation) {
    const setCenter = () => {
      const cashier = data.cashiers.find(
        (c) => String(c.cajero_id) === operation.elements.cajero_id.value,
      );
      operation.elements.centro_id.value = cashier?.centro_id || '';
    };
    operation.elements.cajero_id.addEventListener('change', setCenter);
  }
  if ($('#account-role')) {
    const update = () => {
      const isCashier = $('#account-role').value === 'cajero',
        isNew = isCashier && !$('#existing-cashier').value;
      $('#cashier-account-fields').hidden = !isCashier;
      $('#new-cashier-fields').hidden = !isNew;
      const form = $('#account-form');
      for (const k of ['numero_empleado', 'fecha_ingreso', 'centro_id']) {
        form.elements[k].required = isNew;
        form.elements[k].disabled = !isNew;
      }
      form.elements.cajero_id.disabled = !isCashier;
      const c = data.cashiers.find((c) => String(c.cajero_id) === $('#existing-cashier').value);
      if (c) form.elements.nombre.value = c.nombre_completo;
    };
    $('#account-role').addEventListener('change', update);
    $('#existing-cashier').addEventListener('change', update);
    update();
  }
}
if (page === 'login') {
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector('button');
    button.disabled = true;
    $('#login-error').textContent = '';
    try {
      const result = await api(
        '/api/login',
        'POST',
        Object.fromEntries(new FormData(e.currentTarget)),
      );
      location.assign(result.redirect);
    } catch (e) {
      $('#login-error').textContent = e.message;
      button.disabled = false;
    }
  });
} else {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-view],[data-go]');
    if (target) {
      view = target.dataset.view || target.dataset.go;
      render();
    }
  });
  $('#logout').addEventListener('click', async () => {
    try {
      await api('/api/logout', 'POST', {});
      location.assign('/');
    } catch (e) {
      toast(e.message, true);
    }
  });
  $('#content').addEventListener('change', async (e) => {
    if (e.target.dataset.task) {
      e.target.disabled = true;
      try {
        await api(`/api/tasks/${e.target.dataset.task}`, 'PATCH', { estado: e.target.value });
        await refresh();
        toast('Estado de tarea actualizado.');
      } catch (err) {
        toast(err.message, true);
        e.target.disabled = false;
      }
    }
    if (e.target.id === 'task-status-filter') {
      taskStatus = e.target.value;
      updateTaskList();
    }
    if (e.target.id === 'task-priority-filter') {
      taskPriority = e.target.value;
      updateTaskList();
    }
    if (e.target.id === 'task-cashier-filter') {
      taskCashier = e.target.value;
      updateTaskList();
    }
    if (e.target.id === 'task-date-filter') {
      taskDate = e.target.value;
      updateTaskList();
    }
    if (e.target.id === 'operation-date-filter') {
      operationDate = e.target.value;
      updateOperationList();
    }
    if (e.target.id === 'operation-center-filter') {
      operationCenter = e.target.value;
      updateOperationList();
    }
    if (e.target.id === 'scope-filter') {
      filterScope = e.target.value;
      filterCenter = '';
      filterCashier = '';
      filterPeriod =
        filterScope === 'centers' ? String(data.monthlyAverages[0]?.periodo_id || '') : '';
      render();
    }
    if (e.target.id === 'period-filter') {
      filterPeriod = e.target.value;
      render();
    }
    if (e.target.id === 'center-filter') {
      filterCenter = e.target.value;
      filterCashier = '';
      render();
    }
    if (e.target.id === 'cashier-filter') {
      filterCashier = e.target.value;
      render();
    }
    if (e.target.id === 'team-scope') {
      teamScope = e.target.value;
      const rows = directoryRows();
      $('#team-list').innerHTML = teamTable(rows);
      $('#team-count').textContent = `${rows.length} cajeros`;
    }
  });
  $('#content').addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-chart-toggle]');
    if (toggle) {
      const card = toggle.closest('.performance-card'),
        summary = card.querySelector('.performance-card-summary'),
        chart = card.querySelector('.performance-card-chart'),
        open = chart.hidden;
      summary.hidden = open;
      chart.hidden = !open;
      toggle.setAttribute('aria-pressed', String(open));
      toggle.textContent = open ? 'Ver resumen' : 'Ver gráfica';
    }
    if (e.target.id === 'performance-table-toggle') {
      const table = $('#performance-table'),
        open = table.hidden;
      if (open && !table.dataset.loaded) {
        table.innerHTML = performanceTable();
        table.dataset.loaded = 'true';
      }
      table.hidden = !open;
      e.target.setAttribute('aria-expanded', String(open));
      e.target.textContent = open ? 'Ocultar tabla completa' : 'Ver tabla completa';
    }
    if (e.target.id === 'task-filter-reset') {
      taskQuery = '';
      taskStatus = '';
      taskPriority = '';
      taskCashier = '';
      taskDate = '';
      render();
    }
  });
  $('#content').addEventListener('input', (e) => {
    if (e.target.id === 'team-search') {
      teamQuery = e.target.value;
      const rows = directoryRows();
      $('#team-list').innerHTML = teamTable(rows);
      $('#team-count').textContent = `${rows.length} cajeros`;
    }
    if (e.target.id === 'task-query-filter') {
      taskQuery = e.target.value;
      updateTaskList();
    }
  });
  refresh().catch(
    (e) =>
      ($('#content').innerHTML = html`<section class="card">
        <p class="error" role="alert">${esc(e.message)}</p>
        <p class="muted">Actualiza la página para intentar nuevamente.</p>
      </section>`),
  );
}
