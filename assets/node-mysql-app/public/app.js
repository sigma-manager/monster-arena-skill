'use strict';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('items');
const form = document.getElementById('add-form');
const input = document.getElementById('name');

async function api(path, options) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function setStatus(kind, text) {
  statusEl.className = kind;
  statusEl.textContent = text;
}

async function refreshHealth() {
  try {
    const h = await api('/api/health');
    if (h.db === 'ok') {
      setStatus('ok', `✅ Aplikacja działa · baza: OK · Node ${h.node}`);
    } else if (String(h.db).startsWith('error')) {
      setStatus('err', `⚠️ Aplikacja działa, ale baza zwraca błąd: ${h.db}`);
    } else {
      setStatus('warn', '⚠️ Aplikacja działa, ale baza NIE jest skonfigurowana (ustaw DB_* i przeładuj).');
    }
  } catch (e) {
    setStatus('err', `❌ API niedostępne: ${e.message}`);
  }
}

function render(items) {
  listEl.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.className = 'name';
    span.style.opacity = '.6';
    span.textContent = 'Brak notatek — dodaj pierwszą powyżej.';
    li.appendChild(span);
    listEl.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = item.done ? 'done' : '';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = item.done;
    cb.title = 'Wykonane';
    cb.addEventListener('change', async () => {
      try {
        await api(`/api/items/${item.id}`, { method: 'PUT', body: JSON.stringify({ done: cb.checked }) });
        await loadItems();
      } catch (e) {
        alert(e.message);
        cb.checked = !cb.checked;
      }
    });

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = item.name;

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '✕';
    del.title = 'Usuń';
    del.addEventListener('click', async () => {
      try {
        await api(`/api/items/${item.id}`, { method: 'DELETE' });
        await loadItems();
      } catch (e) {
        alert(e.message);
      }
    });

    li.append(cb, name, del);
    listEl.appendChild(li);
  }
}

async function loadItems() {
  try {
    const { items } = await api('/api/items');
    render(items);
  } catch (e) {
    if (e.status === 503) {
      render([]); // baza nieskonfigurowana — komunikat pokazuje pasek #status
    } else {
      listEl.innerHTML = '';
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.className = 'name';
      span.textContent = `Błąd: ${e.message}`;
      li.appendChild(span);
      listEl.appendChild(li);
    }
  }
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = input.value.trim();
  if (!name) return;
  try {
    await api('/api/items', { method: 'POST', body: JSON.stringify({ name }) });
    input.value = '';
    await loadItems();
    await refreshHealth();
  } catch (e) {
    alert(e.status === 503 ? 'Baza nie jest skonfigurowana — najpierw ustaw dane DB_*.' : e.message);
  }
});

refreshHealth();
loadItems();
