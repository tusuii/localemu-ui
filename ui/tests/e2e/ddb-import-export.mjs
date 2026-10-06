import { start, BASE } from './lib.mjs';
const t = await start(); const { p } = t;
const T = 'ImpExp' + Date.now().toString(36);
const url = (q = '') => `/dynamodb/${T}${q}`;
const upload = async (name, text, extra = {}) => {
  await t.go(url());
  await p.locator('summary:has-text("Import items")').click();
  await p.setInputFiles('#import-file', { name, mimeType: 'text/plain', buffer: Buffer.from(text) });
  if (extra.format) await p.selectOption('#import-format', extra.format);
  await t.submit('[data-import] button:has-text("Import")');
};
const count = () => p.locator('tr[data-row]').count();

await t.go('/dynamodb/create');
await p.fill('#name', T); await p.fill('#pk', 'pk'); await p.fill('#sk', 'sk');
await t.submit('button:has-text("Create table")');

// --- JSON import (plain) of 130 items, > 5 BatchWrite chunks
const plain = Array.from({ length: 130 }, (_, i) => ({ pk: 'p' + (i % 3), sk: String(i).padStart(3, '0'), n: i, tags: ['a', 'b'], nested: { x: i } }));
await upload('items.json', JSON.stringify(plain));
t.ok((await t.flash()).includes('Imported 130 items'), 'JSON import counts: ' + await t.flash());

// --- server-side pagination
await t.go(url('?limit=25'));
t.ok((await count()) === 25, 'page 1 shows 25');
t.ok((await p.locator('[data-server-pager]').innerText()).includes('Page 1'), 'pager shows page 1');
await p.click('[data-server-pager] a:has-text("Next")');
await p.waitForLoadState('load');
t.ok((await count()) === 25 && (await p.locator('[data-server-pager]').innerText()).includes('Page 2'), 'page 2 shows 25');
await p.click('[data-server-pager] a:has-text("Previous")'); await p.waitForLoadState('load');
t.ok((await p.locator('[data-server-pager]').innerText()).includes('Page 1'), 'previous works');
// walk all pages at 100
await t.go(url('?limit=100'));
t.ok((await count()) === 100, 'page size 100 -> 100 rows');
await p.click('[data-server-pager] a:has-text("Next")'); await p.waitForLoadState('load');
t.ok((await count()) === 30 && !(await p.locator('[data-server-pager] a:has-text("Next")').count()), 'last page has remaining 30, no Next');
// size selector in the form
await t.go(url());
await p.selectOption('#limit', '50'); await t.submit('button:has-text("Run")');
t.ok((await count()) === 50, 'page-size selector 50');

// --- filter + query pagination
await t.go(url('?mode=query&pk=p0&limit=25'));
t.ok((await count()) === 25 && (await p.locator('[data-server-pager] a:has-text("Next")').count()) === 1, 'query p0 -> 25 + next (44 items)');
await t.go(url('?fa=n&fop=%3E%3D&fv=120&limit=25'));
t.ok((await count()) === 10, 'filter n>=120 fills page across scan pages -> 10');

// --- export (whole table, streamed)
let r = await p.request.get(BASE + `/dynamodb/${T}/export?format=json`);
const arr = await r.json();
t.ok(r.ok() && arr.length === 130 && /attachment/.test(r.headers()['content-disposition']), 'export JSON whole table = 130');
t.ok(arr.every((x) => typeof x.n === 'number' && Array.isArray(x.tags)), 'export JSON is plain JSON');
r = await p.request.get(BASE + `/dynamodb/${T}/export?format=json&typed=1&mode=query&pk=p1`);
const typed = await r.json();
t.ok(typed.length === 43 && typed[0].pk.S === 'p1', 'export DynamoDB JSON honors query (43)');
r = await p.request.get(BASE + `/dynamodb/${T}/export?format=csv&fa=n&fop=%3C&fv=5`);
const csv = (await r.text()).trim().split(/\r?\n/);
t.ok(csv[0].startsWith('pk,sk,') && csv.length === 6 && r.headers()['content-type'].includes('text/csv'), 'export CSV with filter (header + 5): ' + csv.length);
r = await p.request.get(BASE + `/dynamodb/${T}/export?format=json&mode=query&pk=`);
t.ok(r.status() === 400, 'export with bad query -> 400');
r = await p.request.get(BASE + `/dynamodb/NoSuchTable_x/export?format=json`);
t.ok(r.status() === 404, 'export unknown table -> 404');
await t.go(url());
t.ok((await p.locator('a[data-export=csv]').getAttribute('href')).includes('format=csv'), 'export links on page');

// --- CSV import (header -> attribute names, quoted values, type inference, key types)
await upload('more.csv', 'pk,sk,name,score,active,meta\r\nc1,001,"Smith, ""J""",42,true,"{""a"":1}"\r\nc1,002,plain,3.5,false,\r\n');
t.ok((await t.flash()).includes('Imported 2 items'), 'CSV import: ' + await t.flash());
r = await p.request.get(BASE + `/dynamodb/${T}/export?format=json&mode=query&pk=c1`);
const c1 = await r.json();
t.ok(c1.length === 2 && c1[0].name === 'Smith, "J"' && c1[0].score === 42 && c1[0].active === true && c1[0].meta?.a === 1 && c1[1].meta === undefined, 'CSV values parsed and typed');
// CSV missing key column
await upload('bad.csv', 'pk,name\r\nx,y\r\n');
t.ok((await p.locator('.flash-error').innerText()).includes('key attribute "sk"'), 'CSV without key column rejected');

// --- DynamoDB JSON import (with set + binary) + invalid rows
await upload('ddb.json', JSON.stringify([
  { pk: { S: 'd1' }, sk: { S: '1' }, nums: { NS: ['1', '2'] }, bin: { B: Buffer.from('hi').toString('base64') } },
  { pk: { S: 'd1' }, sk: { S: '1' }, dup: { BOOL: true } },
  { pk: { S: 'nokey' } },
]));
const fl = await t.flash();
t.ok(/Imported 1 of 3 items \(2 failed/.test(fl) && fl.includes('duplicate') && fl.includes('missing key'), 'DDB JSON import with duplicate + invalid summarised: ' + fl);

// --- bulk delete of selected items
await t.go(url('?mode=query&pk=c1'));
await p.locator('[data-select-all]').check();
await p.click('form[data-table] button:has-text("Delete")');
await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Deleted 2 items'), 'bulk delete 2 items: ' + await t.flash());

// cleanup
await t.go(url('?tab=settings'));
await p.click('button:has-text("Delete table")'); await p.fill('[data-cd-input]', 'confirm');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
await t.done();
