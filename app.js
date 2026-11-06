/* ==========================================================
   Libreta de notas
   Organiza las notas de los alumnos por aulas y secciones.
   Los datos se guardan en el navegador (localStorage).
   ========================================================== */


/* ----------------------------------------------------------
   1. Configuración
   ---------------------------------------------------------- */
const STORAGE_KEY = 'libreta-notas-v1';
const PASS = 11;  // Nota mínima para aprobar
const MAX = 20;   // Nota máxima de la escala


/* ----------------------------------------------------------
   2. Utilidades
   ---------------------------------------------------------- */
const uid = () => Math.random().toString(36).slice(2, 9);

const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

// Evita que el texto escrito por el usuario se interprete como HTML
function esc(text) {
  return String(text).replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

// Promedio de una lista, ignorando las notas vacías
function average(values) {
  const numbers = values.filter(n => typeof n === 'number');
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

// Formatea una nota con máximo 1 decimal; muestra "–" si no hay dato
function fmt(n) {
  if (n == null) return '–';
  return n.toLocaleString('es-PE', {maximumFractionDigits: 1});
}

const newSection = name => ({id: uid(), name, evals: [], alumnos: []});


/* ----------------------------------------------------------
   3. Estado y almacenamiento

   state = {
     aulas: [{ id, name, secs: [{ id, name,
                evals:   [{ id, name }],
                alumnos: [{ id, name, notas: { [idEvaluacion]: nota } }] }] }],
     sel: { a: idAula, s: idSección }
   }
   ---------------------------------------------------------- */
let state = loadState();
let view = {q: '', sort: 'name'};  // búsqueda y orden de la tabla

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.aulas)) return saved;
  } catch (e) {}
  return {aulas: [], sel: null};
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

// Devuelve el aula y la sección seleccionadas (o la primera disponible)
function current() {
  const aula = state.aulas.find(x => x.id === state.sel?.a);
  const sec = aula?.secs.find(x => x.id === state.sel?.s);
  if (aula && sec) return {a: aula, s: sec};

  const first = state.aulas.find(x => x.secs.length);
  if (first) {
    state.sel = {a: first.id, s: first.secs[0].id};
    return {a: first, s: first.secs[0]};
  }
  return null;
}

// Guarda los cambios y vuelve a dibujar la pantalla
function saveAndRender() {
  saveState();
  renderSide();
  renderMain();
}

const studentAverage = (sec, alumno) => average(sec.evals.map(ev => alumno.notas[ev.id]));


/* ----------------------------------------------------------
   4. Diálogo para pedir texto
   ---------------------------------------------------------- */
const dlg = document.getElementById('dlg');
const dlgInput = document.getElementById('dlgInput');

// Abre el diálogo y devuelve el texto escrito (o null si se cancela)
function ask(title, value = '', {hint = '', multi = false} = {}) {
  return new Promise(resolve => {
    document.getElementById('dlgTitle').textContent = title;

    const hintEl = document.getElementById('dlgHint');
    hintEl.textContent = hint;
    hintEl.hidden = !hint;

    dlgInput.rows = multi ? 8 : 1;
    dlgInput.dataset.multi = multi ? '1' : '';
    dlgInput.value = value;

    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? dlgInput.value.trim() : null);
    dlg.showModal();
    dlgInput.focus();
    dlgInput.select();
  });
}

// En modo de una sola línea, Enter guarda en vez de insertar un salto
dlgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !dlgInput.dataset.multi) {
    e.preventDefault();
    dlg.querySelector('[value=ok]').click();
  }
});


/* ----------------------------------------------------------
   5. Dibujar la pantalla
   ---------------------------------------------------------- */

/* --- Barra lateral: aulas y secciones --- */
function sectionItem(aula, sec, selectedId) {
  return `
    <li class="row ${sec.id === selectedId ? 'on' : ''}">
      <button class="sec" data-act="open" data-a="${aula.id}" data-s="${sec.id}">
        Sección ${esc(sec.name)}<small>${sec.alumnos.length}</small>
      </button>
      <span class="tools">
        <button data-act="ren-sec" data-a="${aula.id}" data-s="${sec.id}"
                title="Renombrar sección" aria-label="Renombrar sección">✎</button>
        <button data-act="del-sec" data-a="${aula.id}" data-s="${sec.id}"
                title="Eliminar sección" aria-label="Eliminar sección">×</button>
      </span>
    </li>`;
}

function aulaBlock(aula, selectedId) {
  return `
    <div>
      <div class="aula-h">
        <span>${esc(aula.name)}</span>
        <span class="tools">
          <button data-act="ren-aula" data-a="${aula.id}"
                  title="Renombrar aula" aria-label="Renombrar aula">✎</button>
          <button data-act="del-aula" data-a="${aula.id}"
                  title="Eliminar aula" aria-label="Eliminar aula">×</button>
        </span>
      </div>
      <ul>${aula.secs.map(sec => sectionItem(aula, sec, selectedId)).join('')}</ul>
      <button class="link" data-act="add-sec" data-a="${aula.id}">+ Sección</button>
    </div>`;
}

function renderSide() {
  const selectedId = current()?.s.id;
  document.getElementById('side').innerHTML =
    state.aulas.map(aula => aulaBlock(aula, selectedId)).join('') +
    `<button class="btn" data-act="add-aula">+ Nueva aula</button>`;
}


/* --- Zona principal: título, botones y filtros --- */
function renderMain() {
  const main = document.getElementById('main');
  const c = current();

  // Pantalla inicial, cuando todavía no hay aulas
  if (!c) {
    main.innerHTML = `
      <div class="empty">
        <h2>Todavía no hay aulas</h2>
        <p>Crea un aula, por ejemplo “3.º Secundaria”, y añade a tus alumnos.</p>
        <button class="btn primary" data-act="add-aula">Crear primera aula</button>
      </div>`;
    return;
  }

  const {a: aula, s: sec} = c;

  main.innerHTML = `
    <h1>${esc(aula.name)}, sección ${esc(sec.name)}</h1>
    <p class="sub">${sec.alumnos.length} alumnos, ${sec.evals.length} evaluaciones</p>

    <div class="bar">
      <button class="btn primary" data-act="add-alumnos">Añadir alumnos</button>
      <button class="btn" data-act="add-eval">Nueva evaluación</button>
      <span class="grow"></span>
      <select class="field" id="sort" aria-label="Ordenar">
        <option value="name">Orden alfabético</option>
        <option value="desc">Promedio, de mayor a menor</option>
        <option value="asc">Promedio, de menor a mayor</option>
      </select>
      <button class="btn" data-act="csv">Exportar CSV</button>
    </div>

    <div class="bar">
      <input class="field search" id="q" type="search"
             placeholder="Buscar alumno" aria-label="Buscar alumno">
    </div>

    <div id="tbl"></div>`;

  const sortSelect = document.getElementById('sort');
  const searchInput = document.getElementById('q');

  sortSelect.value = view.sort;
  searchInput.value = view.q;

  sortSelect.onchange = () => {
    view.sort = sortSelect.value;
    renderTable();
  };
  searchInput.oninput = () => {
    view.q = searchInput.value;
    renderTable();
  };

  renderTable();
}


/* --- Tabla de notas --- */
function headerCell(ev) {
  return `
    <th>
      <div class="eh">
        <button class="name" data-act="ren-eval" data-e="${ev.id}" title="Renombrar">${esc(ev.name)}</button>
        <button class="x" data-act="del-eval" data-e="${ev.id}"
                title="Eliminar evaluación" aria-label="Eliminar evaluación">×</button>
      </div>
    </th>`;
}

function gradeCell(alumno, ev) {
  const nota = alumno.notas[ev.id];
  return `
    <td>
      <input class="g ${nota < PASS ? 'low' : ''}" type="number" inputmode="decimal"
             min="0" max="${MAX}" step="0.5"
             data-al="${alumno.id}" data-e="${ev.id}" value="${nota ?? ''}"
             aria-label="Nota de ${esc(alumno.name)}">
    </td>`;
}

function studentRow(sec, alumno) {
  return `
    <tr data-id="${alumno.id}">
      <th class="stu" scope="row">
        <div class="stu-in">
          <span>${esc(alumno.name)}</span>
          <span class="tools">
            <button data-act="ren-alumno" data-al="${alumno.id}"
                    title="Renombrar" aria-label="Renombrar alumno">✎</button>
            <button data-act="del-alumno" data-al="${alumno.id}"
                    title="Eliminar alumno" aria-label="Eliminar alumno">×</button>
          </span>
        </div>
      </th>
      ${sec.evals.map(ev => gradeCell(alumno, ev)).join('')}
      <td class="avg"></td>
    </tr>`;
}

// Filtra por la búsqueda y ordena según la opción elegida
function visibleStudents(sec) {
  const query = view.q.toLowerCase();
  const rows = sec.alumnos.filter(al => al.name.toLowerCase().includes(query));

  const sorters = {
    name: (x, y) => x.name.localeCompare(y.name, 'es'),
    desc: (x, y) => (studentAverage(sec, y) ?? -1) - (studentAverage(sec, x) ?? -1),
    asc:  (x, y) => (studentAverage(sec, x) ?? 99) - (studentAverage(sec, y) ?? 99)
  };

  return rows.sort(sorters[view.sort]);
}

function renderTable() {
  const {s: sec} = current();
  const box = document.getElementById('tbl');

  if (!sec.alumnos.length && !sec.evals.length) {
    box.innerHTML = `
      <div class="empty">
        <h2>Esta sección está vacía</h2>
        <p>Añade tu lista de alumnos (puedes pegarla desde Excel) y crea tu primera evaluación.</p>
      </div>`;
    return;
  }

  box.innerHTML = `
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th class="stu">Alumno</th>
            ${sec.evals.map(headerCell).join('')}
            <th class="avg">Promedio</th>
          </tr>
        </thead>
        <tbody>
          ${visibleStudents(sec).map(al => studentRow(sec, al)).join('')}
        </tbody>
        <tfoot>
          <tr>
            <th class="stu">Promedio de la sección</th>
            ${sec.evals.map(ev => `<td data-foot="${ev.id}"></td>`).join('')}
            <td class="avg" data-foot="all"></td>
          </tr>
        </tfoot>
      </table>
    </div>`;

  updateAverages();
}

// Escribe un promedio en su celda y lo marca en rojo si desaprueba
function markAverage(cell, value) {
  cell.textContent = fmt(value);
  cell.classList.toggle('low', value != null && value < PASS);
}

// Recalcula todos los promedios sin volver a dibujar la tabla
function updateAverages() {
  const {s: sec} = current();

  // Promedio de cada alumno (última columna)
  document.querySelectorAll('tbody tr').forEach(tr => {
    const alumno = sec.alumnos.find(x => x.id === tr.dataset.id);
    markAverage(tr.querySelector('.avg'), studentAverage(sec, alumno));
  });

  // Promedio de cada evaluación (fila final)
  sec.evals.forEach(ev => {
    const cell = document.querySelector(`[data-foot="${ev.id}"]`);
    markAverage(cell, average(sec.alumnos.map(al => al.notas[ev.id])));
  });

  // Promedio general de la sección (esquina final)
  const generalCell = document.querySelector('[data-foot="all"]');
  markAverage(generalCell, average(sec.alumnos.map(al => studentAverage(sec, al))));
}


/* ----------------------------------------------------------
   6. Edición de notas en la tabla
   ---------------------------------------------------------- */

// Al escribir: guarda la nota (entre 0 y MAX) y actualiza los promedios
document.addEventListener('input', e => {
  const input = e.target.closest('.g');
  if (!input) return;

  const {s: sec} = current();
  const alumno = sec.alumnos.find(x => x.id === input.dataset.al);
  const evalId = input.dataset.e;

  if (input.value === '') {
    delete alumno.notas[evalId];
  } else {
    let n = parseFloat(input.value.replace(',', '.'));
    if (isNaN(n)) return;
    alumno.notas[evalId] = Math.min(MAX, Math.max(0, n));
  }

  const nota = alumno.notas[evalId];
  input.classList.toggle('low', nota != null && nota < PASS);

  saveState();
  updateAverages();
});

// Al salir de la celda: corrige valores fuera de rango
document.addEventListener('change', e => {
  const input = e.target.closest('.g');
  if (!input || input.value === '') return;
  input.value = Math.min(MAX, Math.max(0, parseFloat(input.value)));
});

// Enter baja a la siguiente fila (Shift+Enter sube)
document.addEventListener('keydown', e => {
  const input = e.target.closest?.('.g');
  if (!input || e.key !== 'Enter') return;
  e.preventDefault();

  const row = input.closest('tr');
  const nextRow = e.shiftKey ? row.previousElementSibling : row.nextElementSibling;
  const target = nextRow?.querySelector(`input[data-e="${input.dataset.e}"]`);

  if (target) {
    target.focus();
    target.select();
  }
});


/* ----------------------------------------------------------
   7. Acciones de los botones
   Cada botón tiene data-act="nombre"; aquí se define qué hace.
   ---------------------------------------------------------- */
const actions = {

  /* --- Aulas --- */
  async 'add-aula'() {
    const name = await ask('Nombre del aula', '', {hint: 'Por ejemplo: 3.º Secundaria'});
    if (!name) return;

    const sec = newSection('A');
    const aula = {id: uid(), name, secs: [sec]};
    state.aulas.push(aula);
    state.sel = {a: aula.id, s: sec.id};
    saveAndRender();
  },

  async 'ren-aula'({aula}) {
    const name = await ask('Renombrar aula', aula.name);
    if (!name) return;
    aula.name = name;
    saveAndRender();
  },

  'del-aula'({aula}) {
    if (!confirm(`¿Eliminar “${aula.name}” con todas sus secciones y notas?`)) return;
    state.aulas = state.aulas.filter(x => x !== aula);
    saveAndRender();
  },

  /* --- Secciones --- */
  open({d}) {
    state.sel = {a: d.a, s: d.s};
    saveAndRender();
  },

  async 'add-sec'({aula}) {
    const suggested = String.fromCharCode(65 + aula.secs.length);  // A, B, C...
    const name = await ask('Nombre de la sección', suggested);
    if (!name) return;

    const sec = newSection(name);
    aula.secs.push(sec);
    state.sel = {a: aula.id, s: sec.id};
    saveAndRender();
  },

  async 'ren-sec'({sec}) {
    const name = await ask('Renombrar sección', sec.name);
    if (!name) return;
    sec.name = name;
    saveAndRender();
  },

  'del-sec'({aula, sec}) {
    if (!confirm(`¿Eliminar la sección ${sec.name} y sus notas?`)) return;
    aula.secs = aula.secs.filter(x => x !== sec);
    saveAndRender();
  },

  /* --- Alumnos --- */
  async 'add-alumnos'({c}) {
    const text = await ask('Añadir alumnos', '', {
      multi: true,
      hint: 'Un alumno por línea. Puedes pegar la lista directamente desde Excel.'
    });
    if (!text) return;

    text.split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .forEach(name => c.s.alumnos.push({id: uid(), name, notas: {}}));
    saveAndRender();
  },

  async 'ren-alumno'({c, d}) {
    const alumno = c.s.alumnos.find(x => x.id === d.al);
    const name = await ask('Renombrar alumno', alumno.name);
    if (!name) return;
    alumno.name = name;
    saveAndRender();
  },

  'del-alumno'({c, d}) {
    const alumno = c.s.alumnos.find(x => x.id === d.al);
    if (!confirm(`¿Eliminar a ${alumno.name}?`)) return;
    c.s.alumnos = c.s.alumnos.filter(x => x !== alumno);
    saveAndRender();
  },

  /* --- Evaluaciones --- */
  async 'add-eval'({c}) {
    const name = await ask('Nombre de la evaluación', `Práctica ${c.s.evals.length + 1}`);
    if (!name) return;
    c.s.evals.push({id: uid(), name});
    saveAndRender();
  },

  async 'ren-eval'({c, d}) {
    const ev = c.s.evals.find(x => x.id === d.e);
    const name = await ask('Renombrar evaluación', ev.name);
    if (!name) return;
    ev.name = name;
    saveAndRender();
  },

  'del-eval'({c, d}) {
    const ev = c.s.evals.find(x => x.id === d.e);
    if (!confirm(`¿Eliminar “${ev.name}” y sus notas?`)) return;
    c.s.evals = c.s.evals.filter(x => x !== ev);
    c.s.alumnos.forEach(al => delete al.notas[ev.id]);
    saveAndRender();
  },

  /* --- Exportar e importar --- */
  csv({c}) {
    exportCSV(c);
  },

  backup() {
    download('libreta-notas-respaldo.json', JSON.stringify(state, null, 2), 'application/json');
  },

  restore() {
    document.getElementById('file').click();
  }
};

// Un solo "escuchador" para todos los botones con data-act
document.addEventListener('click', async e => {
  const button = e.target.closest('[data-act]');
  if (!button) return;

  const d = button.dataset;
  const action = actions[d.act];
  if (!action) return;

  const aula = state.aulas.find(x => x.id === d.a);
  const sec = aula?.secs.find(x => x.id === d.s);

  await action({d, c: current(), aula, sec});
});


/* ----------------------------------------------------------
   8. Exportar e importar datos
   ---------------------------------------------------------- */
function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const link = Object.assign(document.createElement('a'), {href: url, download: filename});
  link.click();
  URL.revokeObjectURL(url);
}

// Genera un CSV (con BOM para que Excel respete las tildes)
function exportCSV({a: aula, s: sec}) {
  const quote = v => `"${String(v).replace(/"/g, '""')}"`;

  const header = ['Alumno', ...sec.evals.map(ev => ev.name), 'Promedio'].map(quote).join(',');
  const lines = [header];

  const sorted = [...sec.alumnos].sort((x, y) => x.name.localeCompare(y.name, 'es'));
  sorted.forEach(alumno => {
    const prom = studentAverage(sec, alumno);
    lines.push([
      quote(alumno.name),
      ...sec.evals.map(ev => alumno.notas[ev.id] ?? ''),
      prom == null ? '' : Math.round(prom * 10) / 10
    ].join(','));
  });

  download(`${aula.name} ${sec.name}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
}

// Restaurar una copia de seguridad (.json)
document.getElementById('file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.aulas)) throw new Error('Formato inválido');

    if (confirm('Esto reemplazará los datos actuales. ¿Continuar?')) {
      state = data;
      saveAndRender();
    }
  } catch (err) {
    alert('El archivo no es una copia de seguridad válida.');
  }

  e.target.value = '';
});


/* ----------------------------------------------------------
   9. Inicio
   ---------------------------------------------------------- */
saveAndRender();