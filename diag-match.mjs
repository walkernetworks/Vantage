import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(
  'mysql://2GaQM4ygVv2AqjL.root:pejvOTHeJ9BM5uOC@gateway01.us-east-1.prod.aws.tidbcloud.com:4000/beignets_brew?ssl={"rejectUnauthorized":true}'
);

const badItemNums = ['1013308','858588','918289','441171','649707','381341','810605','870410'];

console.log('\n=== Catalog items for these item numbers ===');
const [catRows] = await conn.execute(
  `SELECT id, itemNumber, name, price FROM items WHERE itemNumber IN (${badItemNums.map(()=>'?').join(',')})`,
  badItemNums
);
console.table(catRows);

console.log('\n=== Invoice lines for invoice 840003 with these item numbers ===');
const [invRows] = await conn.execute(
  `SELECT id, itemId, itemNumber, description, unitPrice, matchStatus FROM invoice_lines 
   WHERE invoiceId = 840003 AND itemNumber IN (${badItemNums.map(()=>'?').join(',')})`,
  badItemNums
);
console.table(invRows);

const matchedItemIds = invRows.filter(r => r.itemId).map(r => r.itemId);
if (matchedItemIds.length > 0) {
  console.log('\n=== What catalog item does each matched itemId point to? ===');
  const [resolvedRows] = await conn.execute(
    `SELECT id, itemNumber, name, price FROM items WHERE id IN (${matchedItemIds.map(()=>'?').join(',')})`,
    matchedItemIds
  );
  console.table(resolvedRows);
}

// Also check if there are duplicate item numbers in the catalog
console.log('\n=== Duplicate item numbers in catalog? ===');
const [dupRows] = await conn.execute(
  `SELECT itemNumber, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY id) as ids, GROUP_CONCAT(name ORDER BY id SEPARATOR ' | ') as names
   FROM items WHERE itemNumber IN (${badItemNums.map(()=>'?').join(',')})
   GROUP BY itemNumber HAVING cnt > 1`,
  badItemNums
);
if (dupRows.length === 0) console.log('No duplicates found');
else console.table(dupRows);

await conn.end();
