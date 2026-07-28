import mysql from "mysql2";

const url = process.env.DATABASE_URL;
if (!url) { console.error("No DATABASE_URL"); process.exit(1); }

const pool = mysql.createPool({
  uri: url,
  ssl: { rejectUnauthorized: true },
  connectionLimit: 3,
});

async function q(sql, params = []) {
  const [rows] = await pool.promise().execute(sql, params);
  return rows;
}

async function main() {
  console.log("=== TABLES ===");
  const tables = await q("SHOW TABLES");
  console.log(tables.map(r => Object.values(r)[0]).join(", "));

  console.log("\n=== invoices count ===");
  const inv = await q("SELECT COUNT(*) as n FROM invoices");
  console.log(inv[0]);

  console.log("\n=== invoice_lines count ===");
  try {
    const il = await q("SELECT COUNT(*) as n FROM invoice_lines");
    console.log(il[0]);
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== price_history count ===");
  try {
    const ph = await q("SELECT COUNT(*) as n FROM price_history");
    console.log(ph[0]);
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== count_sessions count ===");
  try {
    const cs = await q("SELECT COUNT(*) as n FROM count_sessions WHERE status='completed'");
    console.log(cs[0]);
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== stock_events count ===");
  try {
    const se = await q("SELECT COUNT(*) as n FROM stock_events");
    console.log(se[0]);
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== invoice_lines columns ===");
  try {
    const cols = await q("DESCRIBE invoice_lines");
    console.log(cols.map(c => c.Field).join(", "));
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== price_history columns ===");
  try {
    const cols = await q("DESCRIBE price_history");
    console.log(cols.map(c => c.Field).join(", "));
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== count_sessions columns ===");
  try {
    const cols = await q("DESCRIBE count_sessions");
    console.log(cols.map(c => c.Field).join(", "));
  } catch(e) { console.log("ERROR:", e.message); }

  console.log("\n=== invoices sample query ===");
  try {
    const rows = await q(`
      SELECT i.id, i.vendor, i.status,
        COALESCE(SUM(CAST(il.extension AS DECIMAL(10,2))), 0) AS calculatedTotal,
        COUNT(il.id) AS lineCount
      FROM invoices i
      LEFT JOIN invoice_lines il ON il.invoiceId = i.id
      GROUP BY i.id
      ORDER BY i.createdAt DESC
      LIMIT 3
    `);
    console.log(JSON.stringify(rows, null, 2));
  } catch(e) { console.log("ERROR:", e.message); }

  pool.end();
}

main().catch(e => { console.error(e); pool.end(); });
