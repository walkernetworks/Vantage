import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);
const [cols] = await conn.execute('DESCRIBE invoices');
console.log('Columns:', cols.map(c => c.Field + ':' + c.Type).join(', '));
const [cnt] = await conn.execute('SELECT COUNT(*) as n FROM invoices');
console.log('Invoice count:', cnt[0].n);
if (cnt[0].n > 0) {
  const [rows] = await conn.execute('SELECT id, vendor, invoiceNumber, invoiceDate, createdAt, status FROM invoices ORDER BY createdAt DESC LIMIT 5');
  console.log('Rows:', JSON.stringify(rows, null, 2));
}
await conn.end();
