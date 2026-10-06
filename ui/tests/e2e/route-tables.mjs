import { start } from './lib.mjs';
import { EC2Client, CreateVpcCommand, CreateSubnetCommand, CreateInternetGatewayCommand, AttachInternetGatewayCommand, DetachInternetGatewayCommand, DeleteInternetGatewayCommand, DeleteSubnetCommand, DeleteVpcCommand, DescribeRouteTablesCommand, DeleteRouteTableCommand } from '@aws-sdk/client-ec2';
const t = await start(); const { p } = t;
const N = 'rt' + Date.now().toString(36);
const rows = (txt) => p.locator(`form[data-table=routes] tr[data-row]:has-text("${txt}")`).count();
const confirm = async () => { await p.waitForSelector('#confirm-dialog[open]'); await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]); };

// --- VPC, two subnets, attached IGW (set up through the SDK; the editor under test is the console)
const ec2 = new EC2Client({ endpoint: process.env.LOCALEMU_ENDPOINT ?? 'http://localhost:4566', region: 'us-east-1', credentials: { accessKeyId: '000000000000', secretAccessKey: 'x' } });
const vpc = (await ec2.send(new CreateVpcCommand({ CidrBlock: '10.77.0.0/16' }))).Vpc.VpcId;
const subnets = [];
for (const c of ['10.77.1.0/24', '10.77.2.0/24']) subnets.push((await ec2.send(new CreateSubnetCommand({ VpcId: vpc, CidrBlock: c }))).Subnet.SubnetId);
const igw = (await ec2.send(new CreateInternetGatewayCommand({}))).InternetGateway.InternetGatewayId;
await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igw, VpcId: vpc }));

try {
  // --- create route table
  await t.go('/ec2/route-tables');
  await p.fill('#name', N + '-rt'); await p.selectOption('#vpc', vpc); await t.submit('button:has-text("Create route table")');
  t.ok(/\/ec2\/route-tables\/rtb-/.test(p.url()) && (await t.flash()).includes('Created route table'), 'route table created: ' + p.url());
  const rtUrl = p.url().replace(/^https?:\/\/[^/]+/, '');
  t.ok((await rows('local')) === 1, 'local route present');

  // --- default route to the IGW
  await p.fill('#dest', '0.0.0.0/0'); await p.fill('#target', igw);
  await t.submit('#route-form button:has-text("Save route")');
  t.ok((await rows('0.0.0.0/0')) === 1 && (await p.locator(`form[data-table=routes] tr:has-text("${igw}")`).count()) === 1, 'route to IGW created: ' + await t.flash());
  // duplicate create -> readable error
  await p.fill('#dest', '0.0.0.0/0'); await p.fill('#target', igw);
  await t.submit('#route-form button:has-text("Save route")');
  t.ok((await p.locator('.flash-error').count()) >= 1, 'duplicate route reports an error');
  // unknown target prefix
  await t.go(rtUrl);
  await p.fill('#dest', '10.99.0.0/16'); await p.fill('#target', 'zzz-123');
  await t.submit('#route-form button:has-text("Save route")');
  t.ok((await p.locator('.flash-error').innerText()).includes('zzz-123'), 'unknown target rejected');
  // second route then replace through Edit
  await t.go(rtUrl);
  await p.fill('#dest', '192.168.0.0/16'); await p.fill('#target', igw);
  await t.submit('#route-form button:has-text("Save route")');
  await p.click('form[data-table=routes] tr:has-text("192.168.0.0/16") a:has-text("Edit")'); await p.waitForLoadState('load');
  t.ok(await p.isChecked('input[name=replace]') && (await p.inputValue('#dest')) === '192.168.0.0/16', 'Edit prefills replace form');
  await p.fill('#target', 'local');
  await t.submit('#route-form button:has-text("Replace route")');
  t.ok((await t.flash()).includes('Replaced route'), 'route replaced: ' + await t.flash());

  // --- delete routes in bulk, local fails but the rest are deleted
  await p.locator('form[data-table=routes] [data-select-all]').check();
  await p.click('form[data-table=routes] button:has-text("Delete routes")');
  await confirm();
  const fl = await t.flash();
  t.ok(/Deleted 2 of 3 \(1 failed: .*local/.test(fl), 'bulk delete reports the local route failure: ' + fl);
  t.ok((await rows('0.0.0.0/0')) === 0 && (await rows('local')) === 1, 'only local route left');

  // --- subnet associations
  await p.selectOption('#subnet', { index: 0 });
  await t.submit('button:has-text("Associate selected")');
  t.ok((await t.flash()).includes('Associated 1 subnet') && (await p.locator('form[data-table=assoc] tr[data-row]').count()) === 1, 'subnet associated: ' + await t.flash());
  await p.locator('form[data-table=assoc] [data-select-all]').check();
  await p.click('form[data-table=assoc] button:has-text("Disassociate")');
  await confirm();
  t.ok((await t.flash()).includes('Disassociated 1 subnet') && (await p.locator('form[data-table=assoc] tr[data-row]').count()) === 0, 'subnet disassociated');

  // --- main table handling
  await p.click('button:has-text("Set as main")'); await confirm();
  t.ok((await t.flash()).includes('now the main route table') && (await p.innerText('main')).includes('main route table'), 'set as main: ' + await t.flash());
  await p.click('button:has-text("Delete")'); await confirm().catch(() => {});
  t.ok((await p.locator('.flash-error').innerText()).includes('main route table'), 'deleting the main table is refused');
  // the VPC's old main table can be deleted from the list once it is no longer main
  await t.go('/ec2/route-tables');
  const old = p.locator(`tr[data-row]:has-text("${vpc}"):not(:has-text("${N}-rt")):has-text("No")`).first();
  if (await old.count()) {
    await old.locator('[data-row-select]').check();
    await p.click('form[data-table] button:has-text("Delete")'); await confirm();
    t.ok((await t.flash()).includes('Deleted 1 route table'), 'old main table deleted from list: ' + await t.flash());
  }
} finally {
  const q = (fn) => fn().catch(() => {});
  const tables = (await q(() => ec2.send(new DescribeRouteTablesCommand({ Filters: [{ Name: 'vpc-id', Values: [vpc] }] })))) ?? { RouteTables: [] };
  for (const rt of tables.RouteTables) await q(() => ec2.send(new DeleteRouteTableCommand({ RouteTableId: rt.RouteTableId })));
  for (const sn of subnets) await q(() => ec2.send(new DeleteSubnetCommand({ SubnetId: sn })));
  await q(() => ec2.send(new DetachInternetGatewayCommand({ InternetGatewayId: igw, VpcId: vpc })));
  await q(() => ec2.send(new DeleteInternetGatewayCommand({ InternetGatewayId: igw })));
  await q(() => ec2.send(new DeleteVpcCommand({ VpcId: vpc })));
  await t.done();
}
