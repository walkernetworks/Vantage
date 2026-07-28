import mysql from "mysql2/promise";
const pool = await mysql.createPool({ uri: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
const [[items]] = await pool.execute("SELECT COUNT(*) as n FROM items");
const [[inv]] = await pool.execute("SELECT COUNT(*) as n FROM invoices");
const [[ph]] = await pool.execute("SELECT COUNT(*) as n FROM price_history");
const [[cs]] = await pool.execute("SELECT COUNT(*) as n FROM count_sessions WHERE completedAt IS NOT NULL");
const [[se]] = await pool.execute("SELECT COUNT(*) as n FROM stock_events");
console.log({ items: items.n, invoices: inv.n, price_history: ph.n, completed_count_sessions: cs.n, stock_events: se.n });
await pool.end();
