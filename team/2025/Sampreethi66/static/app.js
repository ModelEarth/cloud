async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const stateSel = document.getElementById("state");
const countySel = document.getElementById("county");
const zipSel = document.getElementById("zip");
const runBtn = document.getElementById("run");
const debugBtn = document.getElementById("debug");
const resultsDiv = document.getElementById("results");
const countDiv = document.getElementById("count");

function setOptions(sel, items, placeholder = "-- any --") {
  sel.innerHTML = "";
  const optAny = document.createElement("option");
  optAny.value = "";
  optAny.textContent = placeholder;
  sel.appendChild(optAny);
  (items || []).forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

async function loadStates() {
  const states = await getJSON("/api/states");
  setOptions(stateSel, states, "-- select state --");
  setOptions(countySel, [], "-- any --");
  setOptions(zipSel, [], "-- any --");
  countDiv.textContent = "";
  resultsDiv.innerHTML = "";
}

async function loadCounties() {
  const s = stateSel.value;
  const counties = await getJSON(`/api/counties?state=${encodeURIComponent(s)}`);
  setOptions(countySel, counties);
  setOptions(zipSel, [], "-- any --");
}

async function loadZips() {
  const s = stateSel.value;
  const c = countySel.value;
  const z = await getJSON(`/api/zips?state=${encodeURIComponent(s)}&county=${encodeURIComponent(c)}`);
  setOptions(zipSel, z);
}

function renderTable(rows) {
  if (!rows || rows.length === 0) {
    resultsDiv.innerHTML = "<p>No rows found.</p>";
    countDiv.textContent = "0 rows";
    return;
  }
  const cols = Object.keys(rows[0]);
  let html = "<table><thead><tr>";
  cols.forEach(c => html += `<th>${c}</th>`);
  html += "</tr></thead><tbody>";
  rows.forEach(r => {
    html += "<tr>";
    cols.forEach(c => html += `<td>${r[c] ?? ""}</td>`);
    html += "</tr>";
  });
  html += "</tbody></table>";
  resultsDiv.innerHTML = html;
  countDiv.textContent = `${rows.length} row(s)`;
}

async function runQuery() {
  const s = stateSel.value;
  const c = countySel.value;
  const z = zipSel.value;
  const url = `/api/filter?state=${encodeURIComponent(s)}&county=${encodeURIComponent(c)}&zip=${encodeURIComponent(z)}`;
  const rows = await getJSON(url);
  renderTable(rows);
}

async function showDebug() {
  const info = await getJSON("/api/debug/info");
  resultsDiv.innerHTML = `<pre>${JSON.stringify(info, null, 2)}</pre>`;
  countDiv.textContent = `${info.rows} total row(s)`;
}

stateSel.addEventListener("change", loadCounties);
countySel.addEventListener("change", loadZips);
runBtn.addEventListener("click", runQuery);
debugBtn.addEventListener("click", showDebug);

loadStates().catch(err => {
  resultsDiv.textContent = "Error loading states: " + err.message;
});
