import mysql from 'mysql2/promise';
const url = process.env.DATABASE_URL;
const conn = await mysql.createConnection(url);

// Check invoices table
const [invCount] = await conn.execute('SELECT COUNT(*) as n FROM invoices');
console.log('invoices count:', invCount[0].n);

// Check invoice_lines table  
const [ilCount] = await conn.execute('SELECT COUNT(*) as n FROM invoice_lines');
console.log('invoice_lines count:', ilCount[0].n);

if (invCount[0].n > 0) {
  const [rows] = await conn.execute('SELECT id, vendor, invoiceNumber, invoiceDate, status, createdAt FROM invoices ORDER BY createdAt DESC LIMIT 5');
  console.log('Recent invoices:', JSON.stringify(rows, null, 2));
}

// Run the exact same query as getInvoiceHistoryReport
const [reportRows] = await conn.execute(`
  SELECT
    i.id, i.vendor, i.invoiceNumber, i.invoiceDate, i.totalAmount, i.status, i.createdAt,
    COALESCE(SUM(CAST(il.extension AS DECIMAL(10,2))), 0) AS calculatedTotal,
    COUNT(il.id) AS lineCount,
    SUM(CASE WHEN il.matchStatus = 'matched' THEN 1 ELSE 0 END) AS matchedCount,
    SUM(CASE WHEN il.matchStatus = 'unmatched' THEN 1 ELSE 0 END) AS unmatchedCount
  FROM invoices i
  LEFT JOIN invoice_lines il ON il.invoiceId = i.id
  GROUP BY i.id
  ORDER BY i.createdAt DESC
  LIMIT 50
`);
console.log('Report query returned:', Array.isArray(reportRows) ? reportRows.length : 'non-array', 'rows');

await conn.end();
