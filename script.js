const $ = (s) => document.querySelector(s),
  app = $("#app");
const P = {
  building:
    '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.3"/><path d="M17 14c2.5 0 4 2 4 5"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  money:
    '<path d="M9 3h6l-2 3h-2z"/><path d="M8 8c-3 3-4 6-4 9 0 3 3 4 8 4s8-1 8-4c0-3-1-6-4-9z"/><path d="M12 11v6M14 12.5h-3a1.2 1.2 0 0 0 0 2.4h2a1.2 1.2 0 0 1 0 2.4h-3"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  wrench:
    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>',
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${P[n]}</svg>`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const peso = (n) => "₱" + Number(n).toLocaleString("en-PH");
const fmt = (d) =>
  new Date(d + "T00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
const TYPES = { Studio: 5500, Room: 4500, "Bed space": 2000 };

/* ---------- STATE + BACKEND CONNECTION ----------
   Data (units, tenants, payments, bills) now lives in the SQLite database.
   Only the login token, user name and profile photo stay in the browser. */
const LS = "rentease";
let S = { user: null, token: "", pic: "", units: [], tenants: [], payments: [], bills: [] };
try {
  const l = JSON.parse(localStorage.getItem(LS)) || {};
  S.user = l.user || null;
  S.token = l.token || "";
  S.pic = l.pic || "";
} catch (e) {}

const API = async (url, body) => {
  const r = await fetch("/api" + url, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-token": S.token || "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Server error");
  return j;
};
const keep = () => {
  try {
    localStorage.setItem(LS, JSON.stringify({ user: S.user, token: S.token, pic: S.pic }));
  } catch (e) {}
};
const pull = (d) => {
  S.units = d.units;
  S.tenants = d.tenants;
  S.payments = d.payments;
  S.bills = d.bills;
};
// save(): send the changes to the server (INSERT/UPDATE/DELETE), then show what the DB now holds
let queue = Promise.resolve();
const save = () => {
  keep();
  if (!S.token) return;
  queue = queue.then(async () => {
    try {
      pull(await API("/sync", { units: S.units, tenants: S.tenants, payments: S.payments, bills: S.bills }));
    } catch (e) {
      toast(e.message);
      try {
        pull(await API("/state"));
      } catch (_) {}
    }
    route();
  });
};
const load = async () => {
  if (S.token) {
    try {
      pull(await API("/state"));
    } catch (e) {
      S.user = null;
      S.token = "";
      keep();
    }
  }
  route();
};

const ui = { mode: "login", range: 6, q: "", err: "" };
const rentOf = (u) => TYPES[u.type] || 0,
  taken = (no) => S.tenants.some((t) => t.unit === no),
  vacant = () => S.units.filter((u) => !taken(u.no));
const sortU = (a) =>
  [...a].sort((x, y) => x.no.localeCompare(y.no, undefined, { numeric: true }));
function toast(m) {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("show");
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove("show"), 2600);
}

function auth() {
  const su = ui.mode === "signup";
  return `<div class="auth"><div class="art" role="img" aria-label="Cozy living room"></div><div class="right">
<div class="logo">Rent<b>Ease</b> ${ic("home")}</div><h2>Tenants, rent and bills in one place.</h2><p>Track who lives where, what they have paid, and which utility bills are still open.</p>
<form class="form" id="af" novalidate><div class="tabs"><button type="button" data-a="mode" data-id="login" class="${su ? "" : "on"}">Log In</button><button type="button" data-a="mode" data-id="signup" class="${su ? "on" : ""}">Sign Up</button></div>
${su ? '<label>Full Name<input id="an" placeholder="Enter your full name"></label>' : ""}
<label>Email<input id="ae" type="email" placeholder="example@gmail.com"></label><label>Password<input id="ap" type="password" placeholder="Enter your password"></label>
<div class="err" role="alert">${esc(ui.err)}</div><button class="btn" type="submit">${su ? "Sign Up" : "Log In"}</button></form></div></div>`;
}

const PAGES = {
  dashboard,
  tenants: tenantsP,
  units: unitsP,
  payments: payP,
  bills: billP,
};
const soon = (t) =>
  `<div class="card empty"><h3 style="justify-content:center">${t}</h3>This page is not built yet.</div>`;
function shell(h) {
  const N = [
    ["dashboard", "Dashboard"],
    ["tenants", "Tenants"],
    ["units", "Units"],
    ["payments", "Rent Payments"],
    ["bills", "Bills"],
  ];
  const T = N.find((n) => n[0] === h) || N[0];
  return `<div class="shell"><aside><div class="logo">Rent<b>Ease</b> ${ic("home")}</div><button class="av" data-a="pic" aria-label="Change profile photo">${S.pic ? `<img src="${S.pic}" alt="Profile photo">` : "+ Add photo"}</button><input type="file" id="pf" accept="image/*" hidden>${S.pic ? '<button class="rmp" data-a="rmpic">Remove photo</button>' : ""}<div class="nm">${esc(S.user.name)}</div>
<nav>${N.map((n) => `<a href="#/${n[0]}" class="${n[0] === T[0] ? "on" : ""}">${n[1]}</a>`).join("")}</nav><button class="out" data-a="out">Log Out</button></aside>
<main>${["tenants", "units", "payments", "bills"].includes(T[0]) ? "" : `<div class="top"><h1>${T[1]}</h1></div>`}${PAGES[T[0]]()}</main></div>`;
}

function dashboard() {
  const td = today(),
    now = new Date(),
    occ = S.units.filter((u) => taken(u.no)),
    pct = S.units.length ? Math.round((occ.length / S.units.length) * 100) : 0,
    exp = occ.reduce((x, u) => x + rentOf(u), 0);
  const ym = (d) => d.slice(0, 7),
    sum = (a) => a.reduce((x, p) => x + p.amount, 0),
    got = S.payments.filter((p) => p.paid && p.amount > 0),
    mine = sum(got.filter((p) => ym(p.paid) === ym(td)));
  const cnt = (t) => S.units.filter((u) => u.type === t).length;
  const st = (i, l, v, sub) =>
    `<div class="card stat"><div class="ico">${ic(i)}</div><div><span>${l}</span><strong>${v}</strong><small>${sub}</small></div></div>`;
  const M = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    n = ui.range,
    mo = [];
  for (let k = n - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1),
      key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    mo.push({
      l: M[d.getMonth()],
      y: d.getFullYear(),
      v: sum(got.filter((p) => ym(p.paid) === key)),
    });
  }
  const top = Math.max(
      5000,
      Math.ceil(Math.max(...mo.map((m) => m.v)) / 5000) * 5000,
    ),
    kf = (v) => "₱" + (v >= 1000 ? +(v / 1000).toFixed(1) + "k" : v);
  const rows = S.payments
    .slice()
    .sort((a, b) => b.due.localeCompare(a.due))
    .slice(0, 4)
    .reverse()
    .map((p) => [
      p.name,
      p.unit,
      fmt(p.due),
      p.paid ? fmt(p.paid) : "-",
      peso(p.amount),
      p.status.toLowerCase(),
    ]);
  const dd = (a, b) =>
      Math.round((new Date(a + "T00:00") - new Date(b + "T00:00")) / 864e5),
    rel = (d) => {
      const x = dd(td, d);
      return x <= 0 ? "Today" : x === 1 ? "Yesterday" : x + "d ago";
    };
  const ev = [
    ...S.payments
      .filter((p) => p.paid && p.paid <= td)
      .map((p) => ({
        d: p.paid,
        i: "money",
        t: "Payment Received",
        s: `${p.name} Unit (${p.unit})`,
        m: peso(p.amount),
        c: "grn",
      })),
    ...S.bills
      .filter((b) => b.status !== "Paid" && b.due <= td)
      .map((b) => ({
        d: b.due,
        i: "clock",
        t: "Bill Due",
        s: `${b.utility} - ${b.name}`,
        m: peso(b.amount),
        c: "red",
      })),
    ...S.tenants
      .filter((t) => t.date <= td)
      .map((t) => ({
        d: t.date,
        i: "users",
        t: "New Tenant",
        s: `${t.name} Unit (${t.unit})`,
        m: "",
        c: "",
      })),
  ]
    .sort((a, b) => b.d.localeCompare(a.d))
    .slice(0, 4);
  const li = (e) =>
    `<div class="li"><div class="ico">${ic(e.i)}</div><div><b>${e.t}</b><small>${esc(e.s)}</small>${e.m ? `<div class="${e.c}">${e.m}</div>` : ""}</div><time>${rel(e.d)}</time></div>`;
  const dueTxt = (d) => {
    const x = dd(d, td);
    return x < 0
      ? "Overdue"
      : x === 0
        ? "Due today"
        : `Due in ${x} day${x > 1 ? "s" : ""}`;
  };
  const upc = S.payments
    .filter((p) => p.status !== "Paid")
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 3);
  const up = (p) => {
    const d = new Date(p.due + "T00:00"),
      u = S.units.find((x) => x.no === p.unit),
      bal = (u ? Math.max(rentOf(u) - p.amount, 0) : 0) || p.amount;
    return `<div class="li"><div class="due"><small>${M[d.getMonth()]}</small>${d.getDate()}</div><div><small>${esc(p.name)} - Unit (${esc(p.unit)})</small><div class="red">${peso(bal)}</div></div><span class="tag">${dueTxt(p.due)}</span></div>`;
  };
  return `<div class="stats">${st("building", "Total Units", S.units.length, `${cnt("Studio")} Studio · ${cnt("Room")} Room · ${cnt("Bed space")} Bed`)}${st("users", "Occupied Units", occ.length, `${pct}% occupancy`)}${st("home", "Vacant Units", S.units.length - occ.length, `${100 - pct}% available`)}${st("money", "Monthly Rental Income", peso(exp), `${peso(mine)} collected this month`)}</div>
<div class="dash"><div><div class="card"><h3>${ic("chart")} Monthly Rental Income<span class="seg">${[1, 6, 12].map((r) => `<button data-a="range" data-id="${r}" class="${r === n ? "on" : ""}">${r}M</button>`).join("")}</span></h3>
<div class="chart"><div class="yl">${[5, 4, 3, 2, 1, 0].map((i) => `<span>${kf((top * i) / 5)}</span>`).join("")}</div>${mo.map((m) => `<i title="${m.l} ${m.y}: ${peso(m.v)}" style="height:${(m.v / top) * 100}%"></i>`).join("")}</div><div class="xl">${mo.map((m) => `<span>${m.l}<br>${m.y}</span>`).join("")}</div></div>
<div class="card"><h3>${ic("money")} Rent Payments</h3><div class="wrap"><table><thead><tr><th>Tenant Name</th><th>Unit #</th><th>Due Date</th><th>Paid Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td><span class="pill p-${r[5]}">${r[5][0].toUpperCase() + r[5].slice(1)}</span></td></tr>`).join("")}</tbody></table></div>${rows.length ? "" : '<div class="empty">No payments yet.</div>'}</div></div>
<div><div class="card"><h3>${ic("bell")} Recent Activity</h3>${ev.map(li).join("") || '<div class="empty">No activity yet.</div>'}</div>
<div class="card"><h3>${ic("cal")} Upcoming Payments</h3>${upc.map(up).join("") || '<div class="empty">No unpaid rent. All caught up.</div>'}</div></div></div>`;
}

function tenantsP() {
  const q = ui.q.toLowerCase(),
    l = S.tenants.filter((t) =>
      (t.name + t.phone + t.email).toLowerCase().includes(q),
    );
  return `<div class="top"><h1>Tenants</h1><button class="btn big" data-a="addT">+ Add Tenant</button></div><div class="card"><div class="srch"><input id="q" value="${esc(ui.q)}" placeholder="Search by name, phone or email" aria-label="Search tenants"><button class="btn" data-a="search">Search</button></div>
<div class="wrap"><table><thead><tr><th>Tenant</th><th>Unit #</th><th>Phone Number</th><th>Move-in Date</th><th></th></tr></thead><tbody>${l
    .map((t) => {
      const i = S.tenants.indexOf(t);
      return `<tr><td><div class="who"><div class="ini">${esc(
        t.name
          .trim()
          .split(/\s+/)
          .map((w) => w[0])
          .slice(0, 2)
          .join("")
          .toUpperCase(),
      )}</div><div>${esc(t.name)}<small>${esc(t.email)}</small></div></div></td><td>${esc(t.unit)}</td><td>${esc(t.phone)}</td><td>${fmt(t.date)}</td><td><button class="act" data-a="editT" data-id="${i}">Edit</button><button class="act rm" data-a="delT" data-id="${i}">Remove</button></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div>${l.length ? "" : '<div class="empty">No tenants found. Try another search or add a tenant.</div>'}</div>`;
}

function unitsP() {
  return `<div class="top"><h1>Units</h1><button class="btn big" data-a="addU">+ Add Unit</button></div><div class="card"><div class="wrap"><table><thead><tr><th>Unit #</th><th>Room Type</th><th>Monthly Rent</th><th>Status</th><th></th></tr></thead><tbody>${sortU(
    S.units,
  )
    .map((u) => {
      const o = taken(u.no),
        i = S.units.indexOf(u);
      return `<tr><td><b>${esc(u.no)}</b></td><td>${esc(u.type)}</td><td>${peso(rentOf(u))}</td><td><span class="pill ${o ? "p-occ" : "p-vacant"}">${o ? "Occupied" : "Vacant"}</span></td><td><button class="act" data-a="editU" data-id="${i}">Edit</button><button class="act rm" data-a="delU" data-id="${i}">Remove</button></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div>${S.units.length ? "" : '<div class="empty">No units yet. Add your first unit.</div>'}</div>`;
}

function payP() {
  return `<div class="top"><h1>Rent Payments</h1><button class="btn big" data-a="addP">+ Add Payment</button></div><div class="card"><div class="wrap"><table style="min-width:860px"><thead><tr><th>Tenant Name</th><th>Unit #</th><th>Due Date</th><th>Date Paid</th><th>Amount Paid</th><th>Method</th><th>Status</th><th></th></tr></thead><tbody>${S.payments
    .map((p, i) => [p, i])
    .sort((a, c) => c[0].due.localeCompare(a[0].due))
    .map(
      ([p, i]) =>
        `<tr><td>${esc(p.name)}</td><td>${esc(p.unit)}</td><td>${fmt(p.due)}</td><td>${p.paid ? fmt(p.paid) : "-"}</td><td>${peso(p.amount)}</td><td>${esc(p.method)}</td><td><span class="pill p-${p.status.toLowerCase()}">${p.status}</span></td><td><button class="act" data-a="editP" data-id="${i}">Edit</button><button class="act rm" data-a="delP" data-id="${i}">Remove</button></td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div>${S.payments.length ? "" : '<div class="empty">No payments recorded yet. Add the first payment.</div>'}</div>`;
}
function billP() {
  return `<div class="top"><h1>Bills</h1><button class="btn big" data-a="addB">+ Add Bill</button></div><div class="card"><div class="wrap"><table><thead><tr><th>Tenant Name</th><th>Unit #</th><th>Utility</th><th>Due Date</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${S.bills
    .map((b, i) => [b, i])
    .sort((a, c) => c[0].due.localeCompare(a[0].due))
    .map(
      ([b, i]) =>
        `<tr><td>${esc(b.name)}</td><td>${esc(b.unit)}</td><td>${esc(b.utility)}</td><td>${fmt(b.due)}</td><td>${peso(b.amount)}</td><td><span class="pill p-${b.status.toLowerCase()}">${b.status}</span></td><td><button class="act" data-a="editB" data-id="${i}">Edit</button><button class="act rm" data-a="delB" data-id="${i}">Remove</button></td></tr>`,
    )
    .join(
      "",
    )}</tbody></table></div>${S.bills.length ? "" : '<div class="empty">No bills yet. Add the first bill.</div>'}</div>`;
}
function form(title, fields, vals, cb) {
  const f = $("#df");
  f.innerHTML = `<h2>${title}</h2>${fields.map((x) => `<label>${x.l}${x.o ? `<select name="${x.k}">${x.o.map((o) => `<option value="${esc(o[0])}" ${o[0] === vals[x.k] ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>` : `<input name="${x.k}" type="${x.t || "text"}" placeholder="${x.p || ""}" value="${esc(vals[x.k] ?? "")}">`}</label>`).join("")}<div class="err" role="alert"></div><div class="acts"><button type="button" class="btn ghost" data-a="close">Cancel</button><button class="btn" type="submit">Save</button></div>`;
  f.onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (vals.id) d.id = vals.id; // keep the database id when editing
    if (fields.some((x) => !x.opt && !(d[x.k] || "").trim())) {
      f.querySelector(".err").textContent = "Fill in every field to continue.";
      return;
    }
    const er = cb(d);
    if (er) {
      f.querySelector(".err").textContent = er;
      return;
    }
    save();
    $("#dlg").close();
    route();
  };
  $("#dlg").showModal();
}
const tf = (cur) => [
  { k: "name", l: "Full Name", p: "Enter full name" },
  { k: "email", l: "Email", t: "email", p: "example@gmail.com" },
  { k: "phone", l: "Phone Number", t: "tel", p: "09XX XXX XXXX" },
  {
    k: "unit",
    l: "Unit",
    o: sortU(S.units.filter((u) => !taken(u.no) || u.no === cur)).map((u) => [
      u.no,
      `${u.no} – ${u.type} (${peso(rentOf(u))})`,
    ]),
  },
  { k: "date", l: "Move-in Date", t: "date" },
];
const uf = [
  { k: "no", l: "Unit Number", p: "e.g. 110" },
  {
    k: "type",
    l: "Room Type",
    o: Object.keys(TYPES).map((k) => [k, `${k} – ${peso(TYPES[k])}`]),
  },
];
const okMail = (d) =>
  /^\S+@\S+\.\S+$/.test(d.email)
    ? ""
    : "Enter a valid email, like name@gmail.com.";
const today = () => {
    const d = new Date();
    return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  },
  nameOf = (u) =>
    (S.tenants.find((t) => t.unit === u) || {}).name || "Former tenant",
  tOpts = () => S.tenants.map((t) => [t.unit, `${t.name} – Unit ${t.unit}`]);
const pf = () => [
  { k: "unit", l: "Tenant", o: tOpts() },
  { k: "due", l: "Due Date", t: "date" },
  { k: "paid", l: "Date Paid (leave blank if unpaid)", t: "date", opt: 1 },
  { k: "amount", l: "Amount Paid (₱)", t: "number", p: "0" },
  {
    k: "method",
    l: "Payment Method",
    o: ["Cash", "GCash", "Bank"].map((m) => [m, m]),
  },
  {
    k: "status",
    l: "Status",
    o: ["Paid", "Partial", "Pending"].map((m) => [m, m]),
  },
];
const bf = () => [
  { k: "unit", l: "Tenant", o: tOpts() },
  {
    k: "utility",
    l: "Utility",
    o: ["Water", "Electricity"].map((m) => [m, m]),
  },
  { k: "due", l: "Due Date", t: "date" },
  { k: "amount", l: "Amount (₱)", t: "number", p: "0" },
  {
    k: "status",
    l: "Status",
    o: ["Paid", "Pending", "Overdue"].map((m) => [m, m]),
  },
];
const A = {
  pic: () => $("#pf").click(),
  rmpic: () => {
    S.pic = "";
    keep();
    route();
    toast("Profile photo removed");
  },
  addP: () => {
    if (!S.tenants.length) return toast("Add a tenant first.");
    form(
      "Add Payment",
      pf(),
      { due: today(), paid: today(), method: "Cash", status: "Paid" },
      (d) => {
        d.amount = +d.amount;
        if (d.amount < 0) return "Amount cannot be negative.";
        d.name = nameOf(d.unit);
        S.payments.push(d);
      },
    );
  },
  editP: (i) => {
    form("Edit Payment", pf(), S.payments[i], (d) => {
      d.amount = +d.amount;
      if (d.amount < 0) return "Amount cannot be negative.";
      d.name = nameOf(d.unit);
      S.payments[i] = d;
    });
  },
  delP: (i) => {
    const p = S.payments[i];
    if (confirm(`Remove ${p.name}'s payment due ${fmt(p.due)}?`)) {
      S.payments.splice(i, 1);
      save();
      route();
      toast("Payment removed");
    }
  },
  addB: () => {
    if (!S.tenants.length) return toast("Add a tenant first.");
    form(
      "Add Bill",
      bf(),
      { due: today(), utility: "Electricity", status: "Pending" },
      (d) => {
        d.amount = +d.amount;
        if (d.amount <= 0) return "Enter an amount above zero.";
        d.name = nameOf(d.unit);
        S.bills.push(d);
      },
    );
  },
  editB: (i) => {
    form("Edit Bill", bf(), S.bills[i], (d) => {
      d.amount = +d.amount;
      if (d.amount <= 0) return "Enter an amount above zero.";
      d.name = nameOf(d.unit);
      S.bills[i] = d;
    });
  },
  delB: (i) => {
    const b = S.bills[i];
    if (confirm(`Remove ${b.utility} bill for ${b.name}?`)) {
      S.bills.splice(i, 1);
      save();
      route();
      toast("Bill removed");
    }
  },
  mode: (id) => {
    ui.mode = id;
    ui.err = "";
    route();
  },
  close: () => $("#dlg").close(),
  out: () => {
    S.user = null;
    S.token = "";
    keep();
    location.hash = "#/login";
    route();
  },
  range: (id) => {
    ui.range = +id;
    route();
  },
  search: () => {
    ui.q = $("#q").value;
    route();
  },
  addT: () => {
    if (!vacant().length) return toast("No vacant units. Add a unit first.");
    form(
      "Add Tenant",
      tf(),
      { date: new Date().toISOString().slice(0, 10) },
      (d) => okMail(d) || void S.tenants.push(d),
    );
  },
  editT: (i) => {
    const t = S.tenants[i];
    form(
      "Edit Tenant",
      tf(t.unit),
      t,
      (d) => okMail(d) || void (S.tenants[i] = d),
    );
  },
  delT: (i) => {
    const t = S.tenants[i];
    if (confirm(`Remove ${t.name} from Unit ${t.unit}?`)) {
      S.tenants.splice(i, 1);
      save();
      route();
      toast(`Unit ${t.unit} is now vacant`);
    }
  },
  addU: () =>
    form("Add Unit", uf, { type: "Studio" }, (d) =>
      S.units.some((u) => u.no === d.no.trim())
        ? "That unit number already exists."
        : void S.units.push({ no: d.no.trim(), type: d.type }),
    ),
  editU: (i) => {
    const u = S.units[i],
      old = u.no;
    form("Edit Unit", uf, u, (d) => {
      const n = d.no.trim();
      if (n !== old && S.units.some((x) => x.no === n))
        return "That unit number already exists.";
      S.tenants.forEach((t) => {
        if (t.unit === old) t.unit = n;
      });
      S.payments.concat(S.bills).forEach((x) => {
        if (x.unit === old) x.unit = n;
      });
      S.units[i] = { id: u.id, no: n, type: d.type };
    });
  },
  delU: (i) => {
    const u = S.units[i];
    if (taken(u.no))
      return toast(`Unit ${u.no} is occupied. Remove its tenant first.`);
    if (confirm(`Remove Unit ${u.no}?`)) {
      S.units.splice(i, 1);
      save();
      route();
      toast(`Unit ${u.no} removed`);
    }
  },
};
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]");
  if (b && A[b.dataset.a]) A[b.dataset.a](b.dataset.id);
});
document.addEventListener("change", (e) => {
  if (e.target.id !== "pf") return;
  const f = e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith("image/"))
    return toast("Please choose an image file.");
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas"),
        z = 256,
        s = Math.min(im.width, im.height);
      c.width = c.height = z;
      c.getContext("2d").drawImage(
        im,
        (im.width - s) / 2,
        (im.height - s) / 2,
        s,
        s,
        0,
        0,
        z,
        z,
      );
      S.pic = c.toDataURL("image/jpeg", 0.85);
      keep();
      route();
      toast("Profile photo updated");
    };
    im.onerror = () => toast("Could not read that image.");
    im.src = r.result;
  };
  r.readAsDataURL(f);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.id === "q") A.search();
});
document.addEventListener("input", (e) => {
  if (e.target.id !== "q") return;
  const p = e.target.selectionStart;
  ui.q = e.target.value;
  route();
  const q = $("#q");
  q.focus();
  q.setSelectionRange(p, p);
});
document.addEventListener("submit", (e) => {
  if (e.target.id !== "af") return;
  e.preventDefault();
  const em = $("#ae").value.trim(),
    pw = $("#ap").value,
    nm = ui.mode === "signup" ? $("#an").value.trim() : "";
  if (ui.mode === "signup" && !nm) ui.err = "Enter your full name.";
  else if (!/^\S+@\S+\.\S+$/.test(em))
    ui.err = "Enter a valid email, like name@gmail.com.";
  else if (pw.length < 4) ui.err = "Password needs at least 4 characters.";
  else {
    ui.err = "";
    // UI -> server -> database: check the account, then load the data
    API(ui.mode === "signup" ? "/signup" : "/login", { name: nm, email: em, password: pw })
      .then(async (r) => {
        S.user = r.user;
        S.token = r.token;
        keep();
        pull(await API("/state"));
        location.hash = "#/dashboard";
        route();
      })
      .catch((x) => {
        ui.err = x.message;
        route();
      });
    return;
  }
  route();
});
function route() {
  const h = location.hash.slice(2) || "login";
  if (!S.user && h !== "login") {
    location.hash = "#/login";
    return;
  }
  if (S.user && h === "login") {
    location.hash = "#/dashboard";
    return;
  }
  app.innerHTML = h === "login" ? auth() : shell(h);
}
addEventListener("hashchange", () => {
  route();
  scrollTo(0, 0);
});
load();
