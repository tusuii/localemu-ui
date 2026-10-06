import { start } from './lib.mjs';
const t = await start(); const { p } = t;
await t.go('/dynamodb/create');
await p.fill('#name', 'Orders'); await p.fill('#pk', 'customer'); await p.fill('#sk', 'orderId');
await t.submit('button:has-text("Create table")');
t.ok(p.url().endsWith('/dynamodb/Orders') && (await t.flash()).includes('created successfully'), 'create table: ' + await t.flash());

// create items via the item editor
for (const [c, o, total] of [['alice', '1', 10], ['alice', '2', 25.5], ['bob', '1', 7]]) {
  await t.go('/dynamodb/Orders/item');
  await p.fill('textarea[name=item]', JSON.stringify({ customer: c, orderId: o, total, tags: ['a', 'b'] }));
  await t.submit('button:has-text("Create item")');
}
t.ok((await p.locator('tr[data-row]').count()) === 3, 'scan shows 3 items');
// query
await t.go('/dynamodb/Orders?mode=query&pk=alice&limit=50');
t.ok((await p.locator('tr[data-row]').count()) === 2, 'query pk=alice -> 2 items');
await t.go('/dynamodb/Orders?mode=query&pk=alice&skop=%3E%3D&sk=2');
t.ok((await p.locator('tr[data-row]').count()) === 1, 'query with sort-key condition -> 1 item');
await t.go('/dynamodb/Orders?mode=query&pk=');
t.ok((await p.locator('.flash-error').count()) === 1, 'query without pk shows error');
// edit
await t.go('/dynamodb/Orders');
await p.locator('tr[data-row]:has-text("bob") [data-row-select]').check();
await p.click('a:has-text("Edit item")');
await p.waitForURL('**/item?key=*');
const txt = JSON.parse(await p.locator('textarea[name=item]').inputValue());
t.ok(txt.customer === 'bob' && txt.total === 7, 'edit form prefilled');
txt.total = 99; await p.fill('textarea[name=item]', JSON.stringify(txt));
await t.submit('button:has-text("Save changes")');
t.ok((await p.locator('tr[data-row]:has-text("99")').count()) === 1, 'edit persisted');
// delete an item
await t.confirmAction('bob', 'Delete', null);
t.ok((await p.locator('tr[data-row]').count()) === 2, 'item deleted');
await t.go('/dynamodb/Orders?tab=overview');
t.ok((await p.innerText('main')).includes('PAY_PER_REQUEST') || (await p.innerText('main')).includes('On-demand'), 'overview shows capacity mode');
// delete table
await t.go('/dynamodb/Orders?tab=settings');
await p.click('button:has-text("Delete table")'); await p.fill('[data-cd-input]', 'confirm');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok(p.url().endsWith('/dynamodb') && (await p.locator('tr[data-row]:has-text("Orders")').count()) === 0, 'table deleted');
await t.done();
