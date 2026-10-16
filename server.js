// RentEase backend: Express + SQLite (better-sqlite3)
// Run:  npm install  ->  npm start  ->  open http://localhost:3000
const express = require("express");
const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// ---------- DATABASE ----------
const db = new Database(path.join(__dirname, "rentease.db"));
db.pragma("foreign_keys = ON");
const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE name='users'").get();
if (!exists) db.exec(fs.readFileSync(path.join(__dirname, "database.sql"), "utf8"));

// ---------- SECURITY HELPERS ----------
const hash = (pw, salt = crypto.randomBytes(8).toString("hex")) =>
  salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
const verify = (pw, stored) => {
  const [salt, h] = stored.split(":");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), crypto.scryptSync(pw, salt, 64));
};
const sessions = new Map(); // token -> user_id
const needLogin = (req, res, next) =>
  sessions.has(req.get("x-token")) ? next() : res.status(401).json({ error: "Please log in again." });
const EMAIL = /^\S+@\S+\.\S+$/;

// ---------- READ: build the data the UI needs ----------
function buildState() {
  return {
    units: db.prepare(`SELECT u.unit_id id, u.unit_no no, r.type_name type
                       FROM units u JOIN room_types r ON r.type_id = u.type_id
                       ORDER BY u.unit_id`).all(),
    tenants: db.prepare(`SELECT t.tenant_id id, t.full_name name, t.email, t.phone,
                                u.unit_no unit, l.move_in_date date
                         FROM leases l
                         JOIN tenants t ON t.tenant_id = l.tenant_id
                         JOIN units u   ON u.unit_id   = l.unit_id
                         WHERE l.status = 'Active' ORDER BY l.lease_id`).all(),
    payments: db.prepare(`SELECT p.payment_id id, t.full_name name, u.unit_no unit,
                                 p.due_date due, COALESCE(p.paid_date,'') paid,
                                 p.amount, m.method_name method, p.status
                          FROM payments p
                          JOIN leases l ON l.lease_id = p.lease_id
                          JOIN tenants t ON t.tenant_id = l.tenant_id
                          JOIN units u ON u.unit_id = l.unit_id
                          JOIN payment_methods m ON m.method_id = p.method_id
                          ORDER BY p.payment_id`).all(),
    bills: db.prepare(`SELECT b.bill_id id, t.full_name name, u.unit_no unit,
                              x.utility_name utility, b.due_date due, b.amount, b.status
                       FROM bills b
                       JOIN leases l ON l.lease_id = b.lease_id
                       JOIN tenants t ON t.tenant_id = l.tenant_id
                       JOIN units u ON u.unit_id = l.unit_id
                       JOIN utilities x ON x.utility_id = b.utility_id
                       ORDER BY b.bill_id`).all(),
  };
}

// ---------- WRITE: apply what the UI changed (INSERT / UPDATE / DELETE) ----------
const delMissing = (table, col, ids) =>
  db.prepare(`DELETE FROM ${table} WHERE ${col} NOT IN (${ids.map(() => "?").join(",") || "-1"})`).run(...ids);
const one = (sql, ...args) => db.prepare(sql).pluck().get(...args);

function leaseFor(unitNo, currentLeaseId) {
  // keep the same lease if its unit did not change, otherwise use the unit's active lease
  if (currentLeaseId && one("SELECT 1 FROM leases l JOIN units u ON u.unit_id=l.unit_id WHERE l.lease_id=? AND u.unit_no=?", currentLeaseId, unitNo))
    return currentLeaseId;
  const id = one(`SELECT l.lease_id FROM leases l JOIN units u ON u.unit_id=l.unit_id
                  WHERE u.unit_no=? AND l.status='Active'`, unitNo);
  if (!id) throw new Error(`Unit ${unitNo} has no active tenant.`);
  return id;
}

const sync = db.transaction((s) => {
  const today = new Date().toISOString().slice(0, 10);

  // 1) UNITS: insert new, update existing
  const unitIds = s.units.map((u) => {
    const type = one("SELECT type_id FROM room_types WHERE type_name=?", u.type);
    if (!type || !String(u.no).trim()) throw new Error("Invalid unit.");
    if (u.id && one("SELECT 1 FROM units WHERE unit_id=?", u.id)) {
      db.prepare("UPDATE units SET unit_no=?, type_id=? WHERE unit_id=?").run(String(u.no).trim(), type, u.id);
      return u.id;
    }
    return db.prepare("INSERT INTO units (unit_no, type_id) VALUES (?,?)").run(String(u.no).trim(), type).lastInsertRowid;
  });

  // 2) TENANTS: removed tenants only lose their lease (history is kept)
  const sentIds = s.tenants.filter((t) => t.id).map((t) => t.id);
  db.prepare(`UPDATE leases SET status='Ended', move_out_date=?
              WHERE status='Active' AND tenant_id NOT IN (${sentIds.map(() => "?").join(",") || "-1"})`).run(today, ...sentIds);
  for (const t of s.tenants) {
    if (!EMAIL.test(t.email || "") || !t.name || !t.phone) throw new Error("Tenant details are incomplete.");
    const unitId = one("SELECT unit_id FROM units WHERE unit_no=?", t.unit);
    if (!unitId) throw new Error(`Unit ${t.unit} does not exist.`);
    let tid = t.id;
    if (tid && one("SELECT 1 FROM tenants WHERE tenant_id=?", tid))
      db.prepare("UPDATE tenants SET full_name=?, email=?, phone=? WHERE tenant_id=?").run(t.name, t.email, t.phone, tid);
    else tid = db.prepare("INSERT INTO tenants (full_name,email,phone) VALUES (?,?,?)").run(t.name, t.email, t.phone).lastInsertRowid;
    const lease = db.prepare("SELECT * FROM leases WHERE tenant_id=? AND status='Active'").get(tid);
    if (lease && lease.unit_id === unitId)
      db.prepare("UPDATE leases SET move_in_date=? WHERE lease_id=?").run(t.date, lease.lease_id);
    else {
      if (lease) db.prepare("UPDATE leases SET status='Ended', move_out_date=? WHERE lease_id=?").run(today, lease.lease_id);
      db.prepare("INSERT INTO leases (tenant_id, unit_id, move_in_date) VALUES (?,?,?)").run(tid, unitId, t.date);
    }
  }

  // 3) PAYMENTS
  const payIds = s.payments.map((p) => {
    const old = p.id && one("SELECT lease_id FROM payments WHERE payment_id=?", p.id);
    const v = [leaseFor(p.unit, old), p.due, p.paid || null, Number(p.amount),
               one("SELECT method_id FROM payment_methods WHERE method_name=?", p.method), p.status];
    if (old) { db.prepare("UPDATE payments SET lease_id=?,due_date=?,paid_date=?,amount=?,method_id=?,status=? WHERE payment_id=?").run(...v, p.id); return p.id; }
    return db.prepare("INSERT INTO payments (lease_id,due_date,paid_date,amount,method_id,status) VALUES (?,?,?,?,?,?)").run(...v).lastInsertRowid;
  });
  delMissing("payments", "payment_id", payIds);

  // 4) BILLS
  const billIds = s.bills.map((b) => {
    const old = b.id && one("SELECT lease_id FROM bills WHERE bill_id=?", b.id);
    const v = [leaseFor(b.unit, old), one("SELECT utility_id FROM utilities WHERE utility_name=?", b.utility),
               b.due, Number(b.amount), b.status];
    if (old) { db.prepare("UPDATE bills SET lease_id=?,utility_id=?,due_date=?,amount=?,status=? WHERE bill_id=?").run(...v, b.id); return b.id; }
    return db.prepare("INSERT INTO bills (lease_id,utility_id,due_date,amount,status) VALUES (?,?,?,?,?)").run(...v).lastInsertRowid;
  });
  delMissing("bills", "bill_id", billIds);

  // 5) UNITS removed in the UI are deleted last
  delMissing("units", "unit_id", unitIds);
});

// ---------- SAMPLE QUERIES (shown at /queries) ----------
const QUERIES = [
  ["1. Active tenants with their unit and monthly rent (3-table JOIN)",
   `SELECT t.full_name, u.unit_no, r.type_name, r.monthly_rent, l.move_in_date
FROM leases l
JOIN tenants t ON t.tenant_id = l.tenant_id
JOIN units u ON u.unit_id = l.unit_id
JOIN room_types r ON r.type_id = u.type_id
WHERE l.status = 'Active'
ORDER BY u.unit_no`],
  ["2. Vacant units (LEFT JOIN + IS NULL)",
   `SELECT u.unit_no, r.type_name
FROM units u
JOIN room_types r ON r.type_id = u.type_id
LEFT JOIN leases l ON l.unit_id = u.unit_id AND l.status = 'Active'
WHERE l.lease_id IS NULL`],
  ["3. Rent collected per month (GROUP BY + SUM)",
   `SELECT strftime('%Y-%m', paid_date) AS month, COUNT(*) AS payments, SUM(amount) AS collected
FROM payments
WHERE paid_date IS NOT NULL
GROUP BY month
ORDER BY month`],
  ["4. Unpaid or overdue utility bills",
   `SELECT t.full_name, u.unit_no, x.utility_name, b.due_date, b.amount, b.status
FROM bills b
JOIN leases l ON l.lease_id = b.lease_id
JOIN tenants t ON t.tenant_id = l.tenant_id
JOIN units u ON u.unit_id = l.unit_id
JOIN utilities x ON x.utility_id = b.utility_id
WHERE b.status <> 'Paid'
ORDER BY b.due_date`],
  ["5. Occupancy per room type (COUNT + GROUP BY)",
   `SELECT r.type_name, COUNT(u.unit_id) AS total_units,
       COUNT(l.lease_id) AS occupied
FROM room_types r
LEFT JOIN units u ON u.type_id = r.type_id
LEFT JOIN leases l ON l.unit_id = u.unit_id AND l.status = 'Active'
GROUP BY r.type_name`],
  ["6. Tenants with unpaid rent records (GROUP BY + HAVING)",
   `SELECT t.full_name, COUNT(*) AS open_records
FROM payments p
JOIN leases l ON l.lease_id = p.lease_id
JOIN tenants t ON t.tenant_id = l.tenant_id
WHERE p.status <> 'Paid'
GROUP BY t.tenant_id
HAVING COUNT(*) >= 1`],
  ["7. Room types priced above average (subquery)",
   `SELECT type_name, monthly_rent
FROM room_types
WHERE monthly_rent > (SELECT AVG(monthly_rent) FROM room_types)`],
];

// ---------- API ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/login", (req, res) => {
  const { email = "", password = "" } = req.body;
  const u = db.prepare("SELECT * FROM users WHERE email = ?").get(email.trim().toLowerCase());
  if (!u || !verify(password, u.password_hash)) return res.status(401).json({ error: "Wrong email or password." });
  const token = crypto.randomUUID();
  sessions.set(token, u.user_id);
  res.json({ token, user: { id: u.user_id, name: u.full_name, role: u.role } });
});

app.post("/api/signup", (req, res) => {
  const { name = "", email = "", password = "" } = req.body;
  if (!name.trim()) return res.status(400).json({ error: "Enter your full name." });
  if (!EMAIL.test(email)) return res.status(400).json({ error: "Enter a valid email, like name@gmail.com." });
  if (password.length < 4) return res.status(400).json({ error: "Password needs at least 4 characters." });
  try {
    const id = db.prepare("INSERT INTO users (full_name,email,password_hash) VALUES (?,?,?)")
      .run(name.trim(), email.trim().toLowerCase(), hash(password)).lastInsertRowid;
    const token = crypto.randomUUID();
    sessions.set(token, id);
    res.json({ token, user: { id, name: name.trim(), role: "Staff" } });
  } catch (e) {
    res.status(409).json({ error: "That email is already registered." });
  }
});

app.get("/api/state", needLogin, (req, res) => res.json(buildState()));

app.post("/api/sync", needLogin, (req, res) => {
  try {
    const { units = [], tenants = [], payments = [], bills = [] } = req.body;
    sync({ units, tenants, payments, bills });
    res.json(buildState());
  } catch (e) {
    res.status(400).json({ error: e.message.replace(/^.*constraint failed: /, "Not allowed: ") });
  }
});

// Demo page: runs each sample query live and shows the SQL + result
app.get("/queries", (req, res) => {
  const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const body = QUERIES.map(([title, sql]) => {
    const rows = db.prepare(sql).all();
    const cols = rows[0] ? Object.keys(rows[0]) : [];
    return `<h3>${esc(title)}</h3><pre>${esc(sql)}</pre><table><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${
      rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join("")}</table>`;
  }).join("");
  res.send(`<!doctype html><meta charset="utf-8"><title>RentEase SQL Queries</title>
<style>body{font:14px system-ui;max-width:900px;margin:30px auto;padding:0 16px;background:#fff0dc;color:#2e1519}
pre{background:#2e1519;color:#fff0dc;padding:12px;border-radius:8px;overflow:auto}
table{border-collapse:collapse;margin-bottom:24px}th{background:#654321;color:#fff}th,td{padding:6px 12px;border:1px solid #c8a97e}</style>
<h1>RentEase - Sample SQL Queries</h1>${body}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RentEase running at http://localhost:${PORT}`));
