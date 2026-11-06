const KEY = 'libreta-notas-v1';
const PASS = 11;   // nota mínima aprobatoria
const MAX = 20;    // nota máxima

const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const avg = arr => { const v = arr.filter(n => typeof n === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const fmt = n => n == null ? '–' : n.toLocaleString('es-PE', {maximumFractionDigits: 1});
const newSec = name => ({id: uid(), name, evals: [], alumnos: []});

let state = load();
let view = {q: '', sort: 'name'};

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.aulas)) return s; } catch (e) {}
  return {aulas: [], sel: null};
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

function cur() {
  const a = state.aulas.find(x => x.id === state.sel?.a);
  const s = a?.secs.find(x => x.id === state.sel?.s);
  if (a && s) return {a, s};
  const a0 = state.aulas.find(x => x.secs.length);
  if (a0) { state.sel = {a: a0.id, s: a0.secs[0].id}; return {a: a0, s: a0.secs[0]}; }
  return null;
}
const studentAvg = (s, al) => avg(s.evals.map(e => al.notas[e.id]));

/* ---------- Diálogo de texto ---------- */
const dlg = document.getElementById('dlg'), dlgInput = document.getElementById('dlgInput');
function ask(title, value = '', {hint = '', multi = false} = {}) {
  return new Promise(resolve => {
    document.getElementById('dlgTitle').textContent = title;
    const h = document.getElementById('dlgHint'); h.textContent = hint; h.hidden = !hint;
    dlgInput.rows = multi ? 8 : 1; dlgInput.dataset.multi = multi ? '1' : '';
    dlgInput.value = value;
    dlg.returnValue = '';
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? dlgInput.value.trim() : null);
    dlg.showModal(); dlgInput.focus(); dlgInput.select();
  });
}
dlgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !dlgInput.dataset.multi) { e.preventDefault(); dlg.querySelector('[value=ok]').click(); }
});

/* ---------- Render ---------- */
function commit() { save(); renderSide(); renderMain(); }

function renderSide() {
  const sel = cur()?.s.id;
  document.getElementById('side').innerHTML = state.aulas.map(a => `
    <div>
      <div class="aula-h"><span>${esc(a.name)}</span>
        <span class="tools">
          <button data-act="ren-aula" data-a="${a.id}" title="Renombrar aula" aria-label="Renombrar aula">✎</button>
          <button data-act="del-aula" data-a="${a.id}" title="Eliminar aula" aria-label="Eliminar aula">×</button>
        </span></div>
      <ul>${a.secs.map(s => `
        <li class="row ${s.id === sel ? 'on' : ''}">
          <button class="sec" data-act="open" data-a="${a.id}" data-s="${s.id}">Sección ${esc(s.name)}<small>${s.alumnos.length}</small></button>
          <span class="tools">
            <button data-act="ren-sec" data-a="${a.id}" data-s="${s.id}" title="Renombrar sección" aria-label="Renombrar sección">✎</button>
            <button data-act="del-sec" data-a="${a.id}" data-s="${s.id}" title="Eliminar sección" aria-label="Eliminar sección">×</button>
          </span>
        </li>`).join('')}</ul>
      <button class="link" data-act="add-sec" data-a="${a.id}">+ Sección</button>
    </div>`).join('') + `<button class="btn" data-act="add-aula">+ Nueva aula</button>`;
}

function renderMain() {
  const c = cur(), main = document.getElementById('main');
  if (!c) {
    main.innerHTML = `<div class="empty"><h2>Todavía no hay aulas</h2>
      <p>Crea un aula, por ejemplo “3.º Secundaria”, y añade a tus alumnos.</p>
      <button class="btn primary" data-act="add-aula">Crear primera aula</button></div>`;
    return;
  }
  const {a, s} = c;
  main.innerHTML = `
    <h1>${esc(a.name)}, sección ${esc(s.name)}</h1>
    <p class="sub">${s.alumnos.length} alumnos, ${s.evals.length} evaluaciones</p>
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
    <div class="bar"><input class="field search" id="q" type="search" placeholder="Buscar alumno" aria-label="Buscar alumno"></div>
    <div id="tbl"></div>`;
  const sort = document.getElementById('sort'), q = document.getElementById('q');
  sort.value = view.sort; q.value = view.q;
  sort.onchange = () => { view.sort = sort.value; renderTable(); };
  q.oninput = () => { view.q = q.value; renderTable(); };
  renderTable();
}

function renderTable() {
  const {s} = cur(), box = document.getElementById('tbl');
  if (!s.alumnos.length && !s.evals.length) {
    box.innerHTML = `<div class="empty"><h2>Esta sección está vacía</h2>
      <p>Añade tu lista de alumnos (puedes pegarla desde Excel) y crea tu primera evaluación.</p></div>`;
    return;
  }
  const q = view.q.toLowerCase();
  const rows = s.alumnos.filter(al => al.name.toLowerCase().includes(q));
  const cmp = {
    name: (x, y) => x.name.localeCompare(y.name, 'es'),
    desc: (x, y) => (studentAvg(s, y) ?? -1) - (studentAvg(s, x) ?? -1),
    asc:  (x, y) => (studentAvg(s, x) ?? 99) - (studentAvg(s, y) ?? 99)
  }[view.sort];
  rows.sort(cmp);

  const head = s.evals.map(e => `
    <th><div class="eh">
      <button class="name" data-act="ren-eval" data-e="${e.id}" title="Renombrar">${esc(e.name)}</button>
      <button class="x" data-act="del-eval" data-e="${e.id}" title="Eliminar evaluación" aria-label="Eliminar evaluación">×</button>
    </div></th>`).join('');

  const body = rows.map(al => `
    <tr data-id="${al.id}">
      <th class="stu" scope="row"><div class="stu-in"><span>${esc(al.name)}</span>
        <span class="tools">
          <button data-act="ren-alumno" data-al="${al.id}" title="Renombrar" aria-label="Renombrar alumno">✎</button>
          <button data-act="del-alumno" data-al="${al.id}" title="Eliminar alumno" aria-label="Eliminar alumno">×</button>
        </span></div></th>
      ${s.evals.map(e => {
        const v = al.notas[e.id];
        return `<td><input class="g ${v < PASS ? 'low' : ''}" type="number" inputmode="decimal" min="0" max="${MAX}" step="0.5"
          data-al="${al.id}" data-e="${e.id}" value="${v ?? ''}" aria-label="Nota de ${esc(al.name)}"></td>`;
      }).join('')}
      <td class="avg"></td>
    </tr>`).join('');

  box.innerHTML = `<div class="wrap"><table>
    <thead><tr><th class="stu">Alumno</th>${head}<th class="avg">Promedio</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th class="stu">Promedio de la sección</th>${s.evals.map(e => `<td data-foot="${e.id}"></td>`).join('')}<td class="avg" data-foot="all"></td></tr></tfoot>
  </table></div>`;
  updateAverages();
}

function updateAverages() {
  const {s} = cur();
  const mark = (el, v) => { el.textContent = fmt(v); el.classList.toggle('low', v != null && v < PASS); };
  document.querySelectorAll('tbody tr').forEach(tr => {
    const al = s.alumnos.find(x => x.id === tr.dataset.id);
    mark(tr.querySelector('.avg'), studentAvg(s, al));
  });
  s.evals.forEach(e => mark(document.querySelector(`[data-foot="${e.id}"]`), avg(s.alumnos.map(al => al.notas[e.id]))));
  mark(document.querySelector('[data-foot="all"]'), avg(s.alumnos.map(al => studentAvg(s, al))));
}

/* ---------- Edición de notas ---------- */
document.addEventListener('input', e => {
  const inp = e.target.closest('.g'); if (!inp) return;
  const {s} = cur(), al = s.alumnos.find(x => x.id === inp.dataset.al);
  if (inp.value === '') delete al.notas[inp.dataset.e];
  else {
    let n = parseFloat(inp.value.replace(',', '.'));
    if (isNaN(n)) return;
    n = Math.min(MAX, Math.max(0, n));
    al.notas[inp.dataset.e] = n;
  }
  const v = al.notas[inp.dataset.e];
  inp.classList.toggle('low', v != null && v < PASS);
  save(); updateAverages();
});
document.addEventListener('change', e => {
  const inp = e.target.closest('.g'); if (!inp || inp.value === '') return;
  inp.value = Math.min(MAX, Math.max(0, parseFloat(inp.value)));
});
document.addEventListener('keydown', e => {
  const inp = e.target.closest?.('.g'); if (!inp || e.key !== 'Enter') return;
  e.preventDefault();
  const tr = inp.closest('tr'), next = (e.shiftKey ? tr.previousElementSibling : tr.nextElementSibling);
  const t = next?.querySelector(`input[data-e="${inp.dataset.e}"]`);
  if (t) { t.focus(); t.select(); }
});

/* ---------- Acciones ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const d = b.dataset, c = cur();
  const aula = state.aulas.find(x => x.id === d.a);
  const sec = aula?.secs.find(x => x.id === d.s);

  switch (d.act) {
    case 'open': state.sel = {a: d.a, s: d.s}; commit(); break;

    case 'add-aula': {
      const name = await ask('Nombre del aula', '', {hint: 'Por ejemplo: 3.º Secundaria'});
      if (!name) return;
      const s = newSec('A');
      state.aulas.push({id: uid(), name, secs: [s]});
      state.sel = {a: state.aulas.at(-1).id, s: s.id}; commit(); break;
    }
    case 'ren-aula': {
      const name = await ask('Renombrar aula', aula.name);
      if (name) { aula.name = name; commit(); } break;
    }
    case 'del-aula':
      if (confirm(`¿Eliminar “${aula.name}” con todas sus secciones y notas?`)) {
        state.aulas = state.aulas.filter(x => x !== aula); commit();
      } break;

    case 'add-sec': {
      const name = await ask('Nombre de la sección', String.fromCharCode(65 + aula.secs.length));
      if (!name) return;
      const s = newSec(name); aula.secs.push(s); state.sel = {a: aula.id, s: s.id}; commit(); break;
    }
    case 'ren-sec': {
      const name = await ask('Renombrar sección', sec.name);
      if (name) { sec.name = name; commit(); } break;
    }
    case 'del-sec':
      if (confirm(`¿Eliminar la sección ${sec.name} y sus notas?`)) {
        aula.secs = aula.secs.filter(x => x !== sec); commit();
      } break;

    case 'add-alumnos': {
      const txt = await ask('Añadir alumnos', '', {multi: true, hint: 'Un alumno por línea. Puedes pegar la lista directamente desde Excel.'});
      if (!txt) return;
      txt.split('\n').map(x => x.trim()).filter(Boolean).forEach(name => c.s.alumnos.push({id: uid(), name, notas: {}}));
      commit(); break;
    }
    case 'ren-alumno': {
      const al = c.s.alumnos.find(x => x.id === d.al);
      const name = await ask('Renombrar alumno', al.name);
      if (name) { al.name = name; commit(); } break;
    }
    case 'del-alumno': {
      const al = c.s.alumnos.find(x => x.id === d.al);
      if (confirm(`¿Eliminar a ${al.name}?`)) { c.s.alumnos = c.s.alumnos.filter(x => x !== al); commit(); }
      break;
    }

    case 'add-eval': {
      const name = await ask('Nombre de la evaluación', `Práctica ${c.s.evals.length + 1}`);
      if (name) { c.s.evals.push({id: uid(), name}); commit(); } break;
    }
    case 'ren-eval': {
      const ev = c.s.evals.find(x => x.id === d.e);
      const name = await ask('Renombrar evaluación', ev.name);
      if (name) { ev.name = name; commit(); } break;
    }
    case 'del-eval': {
      const ev = c.s.evals.find(x => x.id === d.e);
      if (confirm(`¿Eliminar “${ev.name}” y sus notas?`)) {
        c.s.evals = c.s.evals.filter(x => x !== ev);
        c.s.alumnos.forEach(al => delete al.notas[ev.id]); commit();
      } break;
    }

    case 'csv': exportCSV(c); break;
    case 'backup': download('libreta-notas-respaldo.json', JSON.stringify(state, null, 2), 'application/json'); break;
    case 'restore': document.getElementById('file').click(); break;
  }
});

/* ---------- Exportar e importar ---------- */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = Object.assign(document.createElement('a'), {href: url, download: name});
  a.click(); URL.revokeObjectURL(url);
}
function exportCSV({a, s}) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [['Alumno', ...s.evals.map(e => e.name), 'Promedio'].map(q).join(',')];
  [...s.alumnos].sort((x, y) => x.name.localeCompare(y.name, 'es')).forEach(al => {
    const p = studentAvg(s, al);
    lines.push([q(al.name), ...s.evals.map(e => al.notas[e.id] ?? ''), p == null ? '' : Math.round(p * 10) / 10].join(','));
  });
  download(`${a.name} ${s.name}.csv`, '\ufeff' + lines.join('\n'), 'text/csv;charset=utf-8');
}
document.getElementById('file').addEventListener('change', async ev => {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!Array.isArray(data.aulas)) throw new Error();
    if (confirm('Esto reemplazará los datos actuales. ¿Continuar?')) { state = data; commit(); }
  } catch (err) { alert('El archivo no es una copia de seguridad válida.'); }
  ev.target.value = '';
});

commit();
