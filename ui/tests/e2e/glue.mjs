import { start } from './lib.mjs';
const t = await start(); const { p } = t;
const sfx = Date.now().toString(36).slice(-6);
const db = `e2e_db_${sfx}`, tbl = `orders_${sfx}`, crawler = `e2e-crawler-${sfx}`, job = `e2e-job-${sfx}`;
const text = async () => (await p.innerText('main')).replace(/\s+/g, ' ');

// ---- databases
await t.go('/glue');
await p.fill('#name', db); await p.fill('#description', 'e2e database'); await p.fill('#location', `s3://e2e-${sfx}/db/`);
await t.submit('button:has-text("Create database")');
t.ok((await t.flash()).includes(`Database ${db} created`), 'db created: ' + await t.flash());
t.ok((await p.locator(`tr[data-row]:has-text("${db}")`).count()) === 1 && (await text()).includes('e2e database'), 'db listed');

// ---- tables
await t.go(`/glue/tables/create?db=${db}`);
await p.fill('#name', tbl); await p.fill('#location', `s3://e2e-${sfx}/orders/`);
await p.selectOption('#format', 'parquet');
await p.fill('#columns', 'id int\ncustomer string\namount double'); await p.fill('#partitions', 'dt string');
await t.submit('button:has-text("Create table")');
t.ok((await t.flash()).includes(`Table ${tbl} created`) && p.url().endsWith(`/glue/tables/${db}/${tbl}`), 'table created: ' + await t.flash());
const tx = await text();
t.ok(tx.includes('Parquet') && tx.includes('customer') && tx.includes('double') && tx.includes('dt') && tx.includes(`s3://e2e-${sfx}/orders/`), 'detail shows schema, partition key, format, location');
await t.go(`/glue/tables?db=${db}`);
t.ok((await p.locator(`tr[data-row]:has-text("${tbl}")`).count()) === 1, 'table listed under selected db');
await t.go(`/glue/tables/create?db=${db}`);
await p.fill('#name', 'bad_tbl'); await p.fill('#location', 's3://x/y/'); await p.fill('#columns', 'not-valid!!');
await t.submit('button:has-text("Create table")');
t.ok((await p.innerText('body')).includes('is not "name type"'), 'invalid column syntax rejected');

// ---- crawlers
await t.go('/glue/crawlers/create');
await p.fill('#name', crawler); await p.fill('#path', `s3://e2e-${sfx}/orders/`); await p.selectOption('#db', db);
await t.submit('button:has-text("Create crawler")');
t.ok((await t.flash()).includes(`Crawler ${crawler} created`) && (await p.locator(`tr[data-row]:has-text("${crawler}")`).count()) === 1, 'crawler created: ' + await t.flash());
await p.locator(`tr[data-row]:has-text("${crawler}") [data-row-select]`).check();
await t.submit('form[data-table] button:has-text("Run")');
t.ok((await t.flash()).includes('Started 1 crawler'), 'crawler started: ' + await t.flash());
t.ok(/running|ready|stopping/i.test(await p.locator(`tr[data-row]:has-text("${crawler}")`).innerText()), 'crawler state visible');
await t.go('/glue/crawlers');
await t.confirmAction(crawler, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 crawler') && (await p.locator(`tr[data-row]:has-text("${crawler}")`).count()) === 0, 'crawler deleted');

// ---- jobs
await t.go('/glue/jobs/create');
await p.fill('#name', job); await p.fill('#script', `s3://e2e-${sfx}/scripts/etl.py`);
await t.submit('button:has-text("Create job")');
t.ok((await t.flash()).includes(`Job ${job} created`) && p.url().endsWith(`/glue/jobs/${job}`), 'job created: ' + await t.flash());
t.ok((await text()).includes(`s3://e2e-${sfx}/scripts/etl.py`), 'job detail shows script location');
await t.submit('button:has-text("Run job")');
t.ok((await t.flash()).includes('Job run started'), 'run started: ' + await t.flash());
t.ok((await p.locator('form[data-table=runs] tr[data-row]').count()) >= 1, 'run listed in runs table');
await t.go('/glue/jobs');
t.ok((await p.locator(`tr[data-row]:has-text("${job}")`).count()) === 1, 'job listed');
await t.confirmAction(job, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 job') && (await p.locator(`tr[data-row]:has-text("${job}")`).count()) === 0, 'job deleted');

// ---- cleanup tables + db
await t.go(`/glue/tables?db=${db}`);
await t.confirmAction(tbl, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 table') && (await p.locator(`tr[data-row]:has-text("${tbl}")`).count()) === 0, 'table deleted');
await t.go('/glue'); await t.confirmAction(db, 'Delete', 'delete');
t.ok((await t.flash()).includes('Deleted 1 database') && (await p.locator(`tr[data-row]:has-text("${db}")`).count()) === 0, 'db deleted');
await t.go(`/glue/tables/${db}/nope`);
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown table 404');
await t.go('/glue/jobs/nope-zzz');
t.ok((await p.innerText('body')).includes('does not exist'), 'unknown job 404');
await t.done();
