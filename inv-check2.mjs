import { getDb } from './server/db.ts';
const db = await getDb();
const rows = await db.execute('SELECT id, vendor, invoiceNumber, invoiceDate, status, createdAt FROM invoices ORDER BY createdAt DESC LIMIT 10');
console.log('Count:', rows.rows?.length ?? rows.length ?? 'unknown');
console.log(JSON.stringify(rows.rows ?? rows, null, 2));
process.exit(0);
