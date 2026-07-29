import mysql from 'mysql2/promise';
const PROD_URL = 'mysql://2GaQM4ygVv2AqjL.root:pejvOTHeJ9BM5uOC@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/beignets_brew?ssl={"rejectUnauthorized":true}';
const conn = await mysql.createConnection(PROD_URL);

const [invCount] = await conn.execute('SELECT COUNT(*) as n FROM invoices');
console.log('PROD invoices count:', invCount[0].n);

const [ilCount] = await conn.execute('SELECT COUNT(*) as n FROM invoice_lines');
console.log('PROD invoice_lines count:', ilCount[0].n);

if (invCount[0].n > 0) {
  const [rows] = await conn.execute('SELECT id, vendor, invoiceNumber, invoiceDate, status, createdAt FROM invoices ORDER BY createdAt DESC LIMIT 5');
  console.log('Recent invoices:', JSON.stringify(rows, null, 2));
}

// Run the exact report query
const [reportRows] = await conn.execute(`
  SELECT i.id, i.vendor, i.invoiceNumber, i.invoiceDate, i.totalAmount, i.status, i.createdAt,
    COALESCE(SUM(CAST(il.extension AS DECIMAL(10,2))), 0) AS calculatedTotal,
    COUNT(il.id) AS lineCount
  FROM invoices i
  LEFT JOIN invoice_lines il ON il.invoiceId = i.id
  GROUP BY i.id
  ORDER BY i.createdAt DESC
  LIMIT 10
`);
console.log('Report query rows:', Array.isArray(reportRows) ? reportRows.length : 0);
if (Array.isArray(reportRows) && reportRows.length > 0) {
  console.log('First row:', JSON.stringify(reportRows[0], null, 2));
}

await conn.end();
