/* ============================================================
   UE5 mock server — test client logic
   Plain JS, no build step. Organized top to bottom as:
     1. State + the one shared request helper
     2. Response console (the log strip at the bottom)
     3. Sidebar navigation (switching panels)
     4. Auth (login / signup / logout / session display)
     5. Users panel (admin)
     6. Favorites panel
     7. Recent places panel
     8. Health check
   The <script> tag has "defer" on it, so by the time this file
   runs the whole page is already parsed — no need to wait for
   a DOMContentLoaded event before grabbing elements.
   ============================================================ */

/* ----------------------------------------------------------
   1. STATE + REQUEST HELPER
   ---------------------------------------------------------- */

// Everything about "who's logged in right now" lives in these
// two variables. Kept in memory only (not localStorage) — on
// a page refresh you're logged out again, which is fine for a
// demo client and mirrors how the server's own tokens reset on
// restart.
let authToken = null;
let currentUser = null;
let requestCount = 0;

function getBaseUrl() {
  // Trim any trailing slash so "http://localhost:3000/" + "/health"
  // doesn't turn into a double slash.
  return document.getElementById('base-url').value.trim().replace(/\/$/, '');
}

// Every single request in this app — GET, POST, PUT, DELETE —
// goes through this one function. That's deliberate: it's the
// only place that needs to know about the base URL, the auth
// header, and how to log to the console panel.
async function apiRequest(method, path, body) {
  const url = getBaseUrl() + path;
  const headers = {};
  // Only claim a JSON body when there actually is one — sending
  // "Content-Type: application/json" on a bodyless GET/DELETE is
  // misleading and is exactly what triggers the server's 400 above.
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers['Authorization'] = 'Bearer ' + authToken;
  }

  let response;
  try {
    response = await fetch(url, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    // fetch() only throws for network-level failures — server not
    // running, wrong URL, blocked by CORS. That's different from
    // the server responding with an error status, so it gets its
    // own log entry.
    logToConsole(method, path, 'ERR', 'Could not reach the server — is it running? (' + networkError.message + ')');
    throw networkError;
  }

  // The body might not be JSON (or might be empty), so parsing is
  // wrapped separately from the fetch itself.
  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  logToConsole(method, path, response.status, data);

  if (!response.ok) {
    const message = (data && data.error) ? data.error : 'Request failed with status ' + response.status;
    throw new Error(message);
  }

  return data;
}

// Small helper used by every form: show an error message right
// under the submit button instead of an alert() box, so the
// user isn't stuck clicking a popup closed every time a request
// fails.
function showFormError(form, message) {
  let errorEl = form.querySelector('.form-error');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'form-error';
    form.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearFormError(form) {
  const errorEl = form.querySelector('.form-error');
  if (errorEl) {
    errorEl.remove();
  }
}

/* ----------------------------------------------------------
   2. RESPONSE CONSOLE
   ---------------------------------------------------------- */

function logToConsole(method, path, status, body) {
  const log = document.getElementById('console-log');

  const placeholder = log.querySelector('.console__placeholder');
  if (placeholder) {
    placeholder.remove();
  }

  const isError = status === 'ERR' || (typeof status === 'number' && status >= 400);

  const entry = document.createElement('div');
  entry.className = 'console__entry';

  const statusEl = document.createElement('span');
  statusEl.className = 'console__entry-status ' + (isError ? 'console__entry-status--err' : 'console__entry-status--ok');
  statusEl.textContent = status;

  const methodEl = document.createElement('span');
  methodEl.className = 'console__entry-method';
  methodEl.textContent = method;

  const pathEl = document.createElement('span');
  pathEl.className = 'console__entry-path';
  pathEl.textContent = path;

  const bodyEl = document.createElement('span');
  bodyEl.className = 'console__entry-body';
  bodyEl.textContent = typeof body === 'string' ? body : JSON.stringify(body);
  bodyEl.title = bodyEl.textContent; // full text on hover, since it's truncated visually

  entry.appendChild(statusEl);
  entry.appendChild(methodEl);
  entry.appendChild(pathEl);
  entry.appendChild(bodyEl);

  // Newest entry on top, so you don't have to scroll down to see
  // what you just did.
  log.prepend(entry);

  requestCount = requestCount + 1;
  document.getElementById('console-count').textContent = requestCount;
}

document.getElementById('clear-console-btn').addEventListener('click', function () {
  const log = document.getElementById('console-log');
  log.innerHTML = '<p class="console__placeholder">Requests you send will be logged here — method, route, status, and response body.</p>';
  requestCount = 0;
  document.getElementById('console-count').textContent = '0';
});

document.getElementById('console-collapse-btn').addEventListener('click', function (event) {
  const consoleEl = document.getElementById('console');
  consoleEl.classList.toggle('is-collapsed');
  event.target.textContent = consoleEl.classList.contains('is-collapsed') ? 'Expand' : 'Collapse';
});

/* ----------------------------------------------------------
   3. SIDEBAR NAVIGATION
   ---------------------------------------------------------- */

const routeButtons = document.querySelectorAll('.route');

routeButtons.forEach(function (button) {
  button.addEventListener('click', function () {
    routeButtons.forEach(function (b) { b.classList.remove('route--active'); });
    button.classList.add('route--active');

    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.classList.remove('panel--active');
    });

    const targetPanel = document.getElementById(button.dataset.panel);
    targetPanel.classList.add('panel--active');
  });
});

/* ----------------------------------------------------------
   4. AUTH
   ---------------------------------------------------------- */

function maskToken(token) {
  return '•'.repeat(Math.min(token.length, 24));
}

function setSession(token, user) {
  authToken = token;
  currentUser = user;

  document.getElementById('session-username').textContent = user.username;
  document.getElementById('session-role').textContent = user.role;

  const tokenEl = document.getElementById('session-token');
  tokenEl.textContent = maskToken(token);
  tokenEl.dataset.full = token;
  tokenEl.dataset.revealed = 'false';

  const badge = document.getElementById('session-badge');
  badge.classList.add('is-active');
  badge.innerHTML = '<span class="session__label">' + user.username + ' · ' + user.role + '</span>';
}

function clearSession() {
  authToken = null;
  currentUser = null;

  document.getElementById('session-username').textContent = '—';
  document.getElementById('session-role').textContent = '—';

  const tokenEl = document.getElementById('session-token');
  tokenEl.textContent = '—';
  delete tokenEl.dataset.full;

  const badge = document.getElementById('session-badge');
  badge.classList.remove('is-active');
  badge.innerHTML = '<span class="session__label">not signed in</span>';
}

document.getElementById('reveal-token-btn').addEventListener('click', function () {
  const tokenEl = document.getElementById('session-token');
  if (!tokenEl.dataset.full) {
    return; // nothing to reveal yet
  }
  const isRevealed = tokenEl.dataset.revealed === 'true';
  tokenEl.textContent = isRevealed ? maskToken(tokenEl.dataset.full) : tokenEl.dataset.full;
  tokenEl.dataset.revealed = isRevealed ? 'false' : 'true';
});

document.getElementById('login-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const data = await apiRequest('POST', '/auth/login', { username: username, password: password });
    setSession(data.token, data.user);
    event.target.reset();
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

document.getElementById('signup-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;

  try {
    const data = await apiRequest('POST', '/auth/signup', { username: username, password: password });
    event.target.reset();
    // small convenience: drop the username straight into the login
    // form so the obvious next step is one click away
    document.getElementById('login-username').value = data.username;
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

document.getElementById('logout-btn').addEventListener('click', async function () {
  if (!authToken) {
    clearSession();
    return;
  }
  try {
    await apiRequest('POST', '/auth/logout');
  } catch (err) {
    // even if the server call fails (token already gone, server
    // down, etc.) there's no reason to keep the stale session
    // sitting in the UI
  }
  clearSession();
});

/* ----------------------------------------------------------
   5. USERS PANEL (admin)
   ---------------------------------------------------------- */

function renderUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';

  if (!users || users.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'table__empty-row';
    emptyRow.innerHTML = '<td colspan="6">No users found.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  users.forEach(function (user) {
    const row = document.createElement('tr');

    const values = [user.id, user.username, user.role, user.favoritePlaces.length, user.recentSavedPlaces.length];
    values.forEach(function (value) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.appendChild(cell);
    });

    // Last column: a shortcut button that drops this user's ID into
    // the other panels, so you're not copy-pasting IDs by hand every
    // time you want to test their favorites or recent places.
    const actionCell = document.createElement('td');
    const useBtn = document.createElement('button');
    useBtn.type = 'button';
    useBtn.className = 'btn btn--icon';
    useBtn.textContent = 'Use ID';
    useBtn.title = "Fill this user's ID into the other panels";
    useBtn.addEventListener('click', function () {
      document.getElementById('favorites-user-id').value = user.id;
      document.getElementById('recent-user-id').value = user.id;
      document.getElementById('role-user-id').value = user.id;
      document.getElementById('delete-user-id').value = user.id;
    });
    actionCell.appendChild(useBtn);
    row.appendChild(actionCell);

    tbody.appendChild(row);
  });
}

async function loadUsers() {
  try {
    const users = await apiRequest('GET', '/users');
    renderUsersTable(users);
  } catch (err) {
    alert('Could not load users: ' + err.message);
  }
}

document.getElementById('refresh-users-btn').addEventListener('click', loadUsers);

document.getElementById('create-user-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const username = document.getElementById('create-user-username').value.trim();
  const password = document.getElementById('create-user-password').value;
  const role = document.getElementById('create-user-role').value;

  try {
    await apiRequest('POST', '/users', { username: username, password: password, role: role });
    event.target.reset();
    loadUsers();
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

document.getElementById('role-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const userId = document.getElementById('role-user-id').value.trim();
  const role = document.getElementById('role-new-role').value;

  try {
    await apiRequest('PUT', '/users/' + userId + '/role', { role: role });
    loadUsers();
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

document.getElementById('delete-user-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const userId = document.getElementById('delete-user-id').value.trim();
  if (!confirm('Delete user ' + userId + '? This cannot be undone.')) {
    return;
  }

  try {
    await apiRequest('DELETE', '/users/' + userId);
    event.target.reset();
    loadUsers();
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

/* ----------------------------------------------------------
   6 + 7. FAVORITES + RECENT PLACES
   Both panels show a list of place objects and both need the
   same "render a <ul> of places" logic, so it's one shared
   function used by both. Recent places don't support deleting
   through the API, so the remove button is optional.
   ---------------------------------------------------------- */

function renderPlaceList(listId, places, options) {
  const list = document.getElementById(listId);
  list.innerHTML = '';

  if (!places || places.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'place-list__empty';
    empty.textContent = options.emptyText;
    list.appendChild(empty);
    return;
  }

  places.forEach(function (place) {
    const item = document.createElement('li');

    const label = document.createElement('span');
    let text = place.name + '  (' + place.placeId + ')';
    if (place.savedAt) {
      text += ' — ' + new Date(place.savedAt).toLocaleString();
    }
    label.textContent = text;
    item.appendChild(label);

    if (options.onRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn--icon';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', function () {
        options.onRemove(place.placeId);
      });
      item.appendChild(removeBtn);
    }

    list.appendChild(item);
  });
}

// --- Favorites ---

document.getElementById('load-favorites-btn').addEventListener('click', async function () {
  const userId = document.getElementById('favorites-user-id').value.trim();
  if (!userId) {
    alert('Enter a user ID first.');
    return;
  }
  try {
    const favorites = await apiRequest('GET', '/users/' + userId + '/favorites');
    renderPlaceList('favorites-list', favorites, {
      emptyText: 'No favorites yet.',
      onRemove: function (placeId) { removeFavorite(userId, placeId); }
    });
  } catch (err) {
    alert('Could not load favorites: ' + err.message);
  }
});

async function removeFavorite(userId, placeId) {
  try {
    const favorites = await apiRequest('DELETE', '/users/' + userId + '/favorites/' + placeId);
    renderPlaceList('favorites-list', favorites, {
      emptyText: 'No favorites yet.',
      onRemove: function (id) { removeFavorite(userId, id); }
    });
  } catch (err) {
    alert('Could not remove favorite: ' + err.message);
  }
}

document.getElementById('add-favorite-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const userId = document.getElementById('favorites-user-id').value.trim();
  const placeId = document.getElementById('favorite-place-id').value.trim();
  const name = document.getElementById('favorite-place-name').value.trim();

  if (!userId) {
    showFormError(event.target, 'Enter a user ID in the Scope box above first.');
    return;
  }

  try {
    const favorites = await apiRequest('POST', '/users/' + userId + '/favorites', { placeId: placeId, name: name });
    renderPlaceList('favorites-list', favorites, {
      emptyText: 'No favorites yet.',
      onRemove: function (id) { removeFavorite(userId, id); }
    });
    event.target.reset();
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

// --- Recent places ---

document.getElementById('load-recent-btn').addEventListener('click', async function () {
  const userId = document.getElementById('recent-user-id').value.trim();
  if (!userId) {
    alert('Enter a user ID first.');
    return;
  }
  try {
    const recent = await apiRequest('GET', '/users/' + userId + '/recent');
    renderPlaceList('recent-list', recent, { emptyText: 'No recent places yet.' });
  } catch (err) {
    alert('Could not load recent places: ' + err.message);
  }
});

document.getElementById('add-recent-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const userId = document.getElementById('recent-user-id').value.trim();
  const placeId = document.getElementById('recent-place-id').value.trim();
  const name = document.getElementById('recent-place-name').value.trim();

  if (!userId) {
    showFormError(event.target, 'Enter a user ID in the Scope box above first.');
    return;
  }

  try {
    const recent = await apiRequest('POST', '/users/' + userId + '/recent', { placeId: placeId, name: name });
    renderPlaceList('recent-list', recent, { emptyText: 'No recent places yet.' });
    event.target.reset();
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

/* ----------------------------------------------------------
   8. HEALTH CHECK
   Shared by the top-bar "Ping" button and the Health panel's
   "Check now" button — they hit the same endpoint and update
   the same status dot.
   ---------------------------------------------------------- */

async function checkHealth() {
  const dot = document.getElementById('status-dot');
  try {
    const data = await apiRequest('GET', '/health');
    dot.classList.remove('is-offline');
    dot.classList.add('is-online');
    document.getElementById('health-status').textContent = data.status;
    document.getElementById('health-usercount').textContent = data.userCount;
  } catch (err) {
    dot.classList.remove('is-online');
    dot.classList.add('is-offline');
    document.getElementById('health-status').textContent = 'unreachable';
    document.getElementById('health-usercount').textContent = '—';
  }
}

document.getElementById('ping-btn').addEventListener('click', checkHealth);
document.getElementById('check-health-btn').addEventListener('click', checkHealth);

// Check once on page load so the status dot isn't just sitting
// there gray until you click something.
checkHealth();

/* ----------------------------------------------------------
   9. DUAS (external API — UmmahAPI, not the mock server)
   This is a completely separate host from the base-url input
   above, so it gets its own small request helper instead of
   going through apiRequest(). No auth token is attached — the
   free tier of UmmahAPI works without one — but there's an
   optional API key field for the higher rate limit.
   Every dua response from UmmahAPI comes back wrapped as
   { data: ... }, so this helper unwraps that once, here,
   instead of every caller having to remember to do it.
   ---------------------------------------------------------- */

const DUAS_API_BASE = 'https://ummahapi.com';

function getDuasApiKey() {
  return document.getElementById('duas-api-key').value.trim();
}

async function duasRequest(path, params) {
  const url = new URL(DUAS_API_BASE + path);

  if (params) {
    Object.keys(params).forEach(function (key) {
      if (params[key]) {
        url.searchParams.set(key, params[key]);
      }
    });
  }

  const apiKey = getDuasApiKey();
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }

  const logPath = 'ummahapi.com' + url.pathname + url.search;

  let response;
  try {
    response = await fetch(url.toString());
  } catch (networkError) {
    logToConsole('GET', logPath, 'ERR', 'Could not reach UmmahAPI (' + networkError.message + ')');
    throw networkError;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (parseError) {
    data = null;
  }

  logToConsole('GET', logPath, response.status, data);

  if (!response.ok) {
    const message = (data && data.error) ? data.error : 'Request failed with status ' + response.status;
    throw new Error(message);
  }

  // UmmahAPI wraps every payload as { data: ... } — unwrap once here.
  return (data && data.data !== undefined) ? data.data : data;
}

function renderDua(containerId, dua) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const arabic = document.createElement('p');
  arabic.className = 'dua-card__arabic';
  arabic.textContent = dua.arabic;
  container.appendChild(arabic);

  const transliteration = document.createElement('p');
  transliteration.className = 'dua-card__transliteration';
  transliteration.textContent = dua.transliteration;
  container.appendChild(transliteration);

  const translation = document.createElement('p');
  translation.className = 'dua-card__translation';
  translation.textContent = dua.translation;
  container.appendChild(translation);

  const meta = document.createElement('div');
  meta.className = 'dua-card__meta';
  if (dua.category) {
    const categoryTag = document.createElement('span');
    categoryTag.textContent = dua.category;
    meta.appendChild(categoryTag);
  }
  if (dua.reference) {
    const referenceTag = document.createElement('span');
    referenceTag.textContent = dua.reference;
    meta.appendChild(referenceTag);
  }
  container.appendChild(meta);
}

function renderDuaResults(duas) {
  const list = document.getElementById('dua-results-list');
  list.innerHTML = '';

  if (!duas || duas.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'dua-list__empty';
    empty.textContent = 'No duas found.';
    list.appendChild(empty);
    return;
  }

  duas.forEach(function (dua) {
    const item = document.createElement('li');

    const arabic = document.createElement('p');
    arabic.className = 'dua-card__arabic';
    arabic.textContent = dua.arabic;
    item.appendChild(arabic);

    const translation = document.createElement('p');
    translation.className = 'dua-card__translation';
    translation.textContent = dua.translation;
    item.appendChild(translation);

    if (dua.reference) {
      const reference = document.createElement('p');
      reference.className = 'dua-card__transliteration'; // reusing the small muted-text style
      reference.textContent = dua.reference;
      item.appendChild(reference);
    }

    list.appendChild(item);
  });
}

// The category/search endpoints don't necessarily put the array
// straight under "data" the way /random puts a single dua there —
// some REST APIs nest a collection one level deeper (e.g. under a
// "duas" or "results" key alongside a count). Rather than guess
// wrong again, this checks a few likely shapes and falls back to
// an empty list instead of crashing the whole panel.
function normalizeDuaList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.duas)) {
    return payload.duas;
  }
  if (payload && Array.isArray(payload.results)) {
    return payload.results;
  }
  console.warn('Unexpected duas response shape — check the Network tab:', payload);
  return [];
}

document.getElementById('random-dua-btn').addEventListener('click', async function () {
  try {
    const dua = await duasRequest('/api/duas/random');
    renderDua('random-dua-display', dua);
  } catch (err) {
    alert('Could not fetch a random dua: ' + err.message);
  }
});

async function loadDuasByCategory(category) {
  try {
    const duas = await duasRequest('/api/duas/category/' + category);
    renderDuaResults(normalizeDuaList(duas));
  } catch (err) {
    alert('Could not load "' + category + '" duas: ' + err.message);
  }
}

async function loadDuaCategories() {
  const container = document.getElementById('dua-categories');
  try {
    const categories = await duasRequest('/api/duas/categories');
    container.innerHTML = '';

    // Handling both a plain array of names and an array of
    // { category, count } objects here, in case the exact shape
    // differs slightly from what's in the docs — better than the
    // whole panel breaking over a field name mismatch.
    categories.forEach(function (entry) {
      const name = typeof entry === 'string' ? entry : (entry.category || entry.name);
      const count = (entry && entry.count) ? ' (' + entry.count + ')' : '';

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'tag-pill';
      pill.textContent = name + count;
      pill.addEventListener('click', function () { loadDuasByCategory(name); });
      container.appendChild(pill);
    });
  } catch (err) {
    container.innerHTML = '<p class="tag-list__empty">Could not load categories: ' + err.message + '</p>';
  }
}

document.getElementById('dua-search-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  clearFormError(event.target);

  const query = document.getElementById('dua-search-query').value.trim();

  try {
    const duas = await duasRequest('/api/duas/search', { q: query });
    renderDuaResults(normalizeDuaList(duas));
  } catch (err) {
    showFormError(event.target, err.message);
  }
});

// Load the category pills once on page load, same reasoning as
// the automatic health check above.
loadDuaCategories();