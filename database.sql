-- =====================================================================
-- RentEase database  (SQLite)
-- 9 tables | 3 main entities (users, tenants, units)
-- 2 transaction tables (payments, bills) | 1 junction table (leases)
-- 3 lookup tables (room_types, payment_methods, utilities)
-- =====================================================================
PRAGMA foreign_keys = ON;

-- ---------- LOOKUP TABLES ----------
CREATE TABLE room_types (
  type_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  type_name    TEXT NOT NULL UNIQUE,
  monthly_rent REAL NOT NULL CHECK (monthly_rent >= 0)
);

CREATE TABLE payment_methods (
  method_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  method_name TEXT NOT NULL UNIQUE
);

CREATE TABLE utilities (
  utility_id   INTEGER PRIMARY KEY AUTOINCREMENT,
  utility_name TEXT NOT NULL UNIQUE
);

-- ---------- MAIN ENTITY TABLES ----------
CREATE TABLE users (                       -- landlord / staff accounts (login)
  user_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,              -- salt:scrypt hash, never plain text
  role          TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Staff')),
  created_at    TEXT NOT NULL DEFAULT (date('now'))
);

CREATE TABLE units (
  unit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_no TEXT NOT NULL UNIQUE,
  type_id INTEGER NOT NULL REFERENCES room_types(type_id)   -- FK 1
);

CREATE TABLE tenants (
  tenant_id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email     TEXT NOT NULL,
  phone     TEXT NOT NULL
);

-- ---------- JUNCTION TABLE (tenants <-> units, many-to-many over time) ----------
CREATE TABLE leases (
  lease_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     INTEGER NOT NULL REFERENCES tenants(tenant_id),                -- FK 2
  unit_id       INTEGER NOT NULL REFERENCES units(unit_id) ON DELETE CASCADE,  -- FK 3
  move_in_date  TEXT NOT NULL,
  move_out_date TEXT,
  status        TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Ended'))
);
-- a unit can have only ONE active lease at a time
CREATE UNIQUE INDEX ux_active_unit ON leases(unit_id) WHERE status = 'Active';

-- ---------- TRANSACTION TABLES ----------
CREATE TABLE payments (                    -- rent payments
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id   INTEGER NOT NULL REFERENCES leases(lease_id) ON DELETE CASCADE,   -- FK 4
  due_date   TEXT NOT NULL,
  paid_date  TEXT,
  amount     REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  method_id  INTEGER NOT NULL REFERENCES payment_methods(method_id),           -- FK 5
  status     TEXT NOT NULL CHECK (status IN ('Paid','Partial','Pending'))
);

CREATE TABLE bills (                       -- utility bills
  bill_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id   INTEGER NOT NULL REFERENCES leases(lease_id) ON DELETE CASCADE,   -- FK 6
  utility_id INTEGER NOT NULL REFERENCES utilities(utility_id),                -- FK 7
  due_date   TEXT NOT NULL,
  amount     REAL NOT NULL CHECK (amount > 0),
  status     TEXT NOT NULL CHECK (status IN ('Paid','Pending','Overdue'))
);

-- =====================================================================
-- SAMPLE DATA
-- Seed users all use the password:  password123
-- =====================================================================
INSERT INTO room_types (type_name, monthly_rent) VALUES
  ('Studio', 5500), ('Room', 4500), ('Bed space', 2000);

INSERT INTO payment_methods (method_name) VALUES ('Cash'), ('GCash'), ('Bank');
INSERT INTO utilities (utility_name) VALUES ('Water'), ('Electricity');

INSERT INTO users (full_name, email, password_hash, role) VALUES
  ('Admin Owner',  'admin@rentease.com',  'a1f3c9d2:debdfab3f39f1a9cfd2fc27d4fb3b95c1a9a029cc79b9b5121ca10d8cd5e1e4965b0c2919a83d7946b9de8ecea65ee6a559bd21a8c74c3d1004c7b30733d2e8a', 'Admin'),
  ('Ana Dela Cruz','ana@rentease.com',    'b7e204aa:bc5a9034d9761ff85e2ac61ef66cfcd2e00fe5bbf7f6fd30b1de3d7c1b9baeffde0156da0bf397ae776cfc461fce61c82e47939d95e6a706759c97b2c2360a90', 'Staff'),
  ('Ben Ramos',    'ben@rentease.com',    'c93d118f:9b3f04422de3955e7e62b37e42ffb8e0cf537ce544538bb4cb2b26df3a3a230eabb29284245fb0c88eaf40dcdce04a23bf7cb150bf42e8ba8653658e3820d420', 'Staff'),
  ('Carla Lim',    'carla@rentease.com',  'd54a6e07:7c2015ebed5c32987afce6a42b4a3db99f4360914f9bccc336d1ce38d4ecd1d2859d0fcaedf7c01b0ceefccf0c8f7e87015936790b56579cf490bec0c04a899a', 'Staff'),
  ('Dan Villanueva','dan@rentease.com',   'e08b3c71:819de5c27037d0e89e1a56aacd7c16ec12b9ad4f4499d5a212c2b2bb2710539bc73b76b92ef5b4962e19806442bd0af6ddb2311330448f8efbfc69ac5f65a787', 'Staff');

INSERT INTO units (unit_no, type_id) VALUES
  ('101',1), ('102',1), ('103',1),
  ('104',2), ('105',2), ('106',2),
  ('107',3), ('108',3), ('109',3);

INSERT INTO tenants (full_name, email, phone) VALUES
  ('Selena Iniwan', 'selena.iniwan@gmail.com', '0949 550 8590'),
  ('Maria Santos',  'maria.santos01@gmail.com','0932 678 6527'),
  ('John Doe',      'john.doe@gmail.com',      '0954 110 4532'),
  ('Jessica Soto',  'jessica.soto@gmail.com',  '0910 563 6000'),
  ('Carlo Reyes',   'carlo.reyes@gmail.com',   '0917 222 3344');

-- leases: tenant_id, unit_id (unit 101..105 = ids 1..5)
INSERT INTO leases (tenant_id, unit_id, move_in_date) VALUES
  (1,1,'2026-03-30'), (2,2,'2026-04-04'), (3,3,'2026-07-15'),
  (4,4,'2026-09-11'), (5,5,'2026-09-20');

-- payments: lease_id, due, paid, amount, method_id (1 Cash,2 GCash,3 Bank), status
INSERT INTO payments (lease_id, due_date, paid_date, amount, method_id, status) VALUES
  (1,'2026-10-10','2026-10-09',5500,1,'Paid'),
  (2,'2026-10-13','2026-10-13',5500,2,'Paid'),
  (3,'2026-10-21',NULL,0,1,'Pending'),
  (4,'2026-10-25',NULL,0,3,'Pending'),
  (4,'2026-09-25','2026-09-27',2000,3,'Partial'),
  (5,'2026-10-20',NULL,0,2,'Pending');

-- bills: lease_id, utility_id (1 Water, 2 Electricity), due, amount, status
INSERT INTO bills (lease_id, utility_id, due_date, amount, status) VALUES
  (1,1,'2026-10-15',450,'Paid'),
  (2,2,'2026-10-18',1200,'Paid'),
  (3,2,'2026-10-20',5000,'Pending'),
  (4,1,'2026-10-05',380,'Overdue'),
  (5,1,'2026-10-22',450,'Pending');
