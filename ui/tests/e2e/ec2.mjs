import { start } from './lib.mjs';
const BOX = 'ui-box' + Date.now().toString(36);
const t = await start(); const { p } = t;
// VPC + subnet
await t.go('/ec2/vpcs'); await p.fill('#name', 'ui-vpc'); await p.fill('#cidr', '10.77.0.0/16'); await t.submit('button:has-text("Create VPC")');
t.ok((await t.flash()).includes('Created VPC'), 'vpc create: ' + await t.flash());
const vpcId = (await p.locator('tr[data-row]:has-text("ui-vpc") td').nth(2).innerText()).trim();
await t.go('/ec2/subnets'); await p.selectOption('#vpc', vpcId); await p.fill('#name', 'ui-subnet'); await p.fill('#cidr', '10.77.1.0/24'); await t.submit('button:has-text("Create subnet")');
t.ok((await t.flash()).includes('Created subnet'), 'subnet create: ' + await t.flash());
// IGW
await t.go('/ec2/internet-gateways'); await p.fill('#gname', 'ui-igw'); await t.submit('button:has-text("Create"):not(:has-text("internet"))');
t.ok((await t.flash()).includes('Created internet gateway'), 'igw create: ' + await t.flash());
await p.locator('tr[data-row]:has-text("ui-igw") input').check();
await p.selectOption('#avpc', vpcId);
await t.submit('#attach-form button:has-text("Attach")');
t.ok((await t.flash()).includes('attached'), 'igw attach: ' + await t.flash());
// SG + rules
await t.go('/ec2/security-groups/create'); await p.fill('#name', 'ui-sg'); await p.fill('#description', 'made by ui'); await p.selectOption('#vpc', vpcId); await t.submit('button:has-text("Create security group")');
t.ok(/security-groups\/sg-/.test(p.url()), 'sg create');
await p.locator('summary:has-text("Add rule")').first().click();
await p.fill('#f-addIngress', '22'); await p.fill('#s-addIngress', '10.0.0.0/8');
await t.submit('form:has(input[value=addIngress]) button:has-text("Add rule")');
t.ok((await t.flash()).includes('Inbound rule added'), 'sg ingress add: ' + await t.flash());
t.ok((await p.innerText('main')).includes('10.0.0.0/8'), 'rule listed');
await p.locator('form:has(input[value=revokeIngress]) button:has-text("Delete")').first().click(); await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('rule removed'), 'sg ingress revoke: ' + await t.flash());
// key pair
await t.go('/ec2/key-pairs'); await p.fill('#kname', 'ui-key'); await t.submit('button:has-text("Create key pair")');
t.ok((await p.innerText('main')).includes('BEGIN') && (await p.innerText('main')).includes('Save the private key'), 'key material shown once');
// volume
await t.go('/ec2/volumes'); await p.fill('#name', 'ui-vol'); await p.fill('#size', '3'); await t.submit('button:has-text("Create volume")');
t.ok((await t.flash()).includes('Created volume'), 'volume create: ' + await t.flash());
await p.locator('tr[data-row]:has-text("ui-vol") [data-row-select]').check(); await p.click('button:has-text("Create snapshot")'); await p.waitForLoadState('load');
t.ok((await t.flash()).includes('Created 1 snapshot'), 'snapshot: ' + await t.flash());
await t.go('/ec2/snapshots'); t.ok((await p.locator('tr[data-row]').count()) >= 1, 'snapshots listed');
// EIP
await t.go('/ec2/addresses'); await t.submit('button:has-text("Allocate Elastic IP")');
t.ok((await t.flash()).includes('Allocated Elastic IP'), 'eip: ' + await t.flash());
// instance
await t.go('/ec2/instances/launch'); await p.fill('#name', BOX); await p.fill('#ami', 'ami-03cf127a'); await p.selectOption('#type', 't3.small'); await p.fill('#userdata', '#!/bin/bash\necho hi');
await t.submit('button:has-text("Launch instance")');
t.ok(/ec2\/instances\/i-/.test(p.url()), 'instance launched: ' + p.url() + ' ' + await t.flash());
const iid = p.url().split('/').pop();
t.ok((await p.innerText('main')).includes('t3.small'), 'instance details');
await t.go(`/ec2/instances/${iid}?tab=userdata`); t.ok((await p.innerText('main')).includes('echo hi'), 'user data decoded');
await t.go('/ec2/instances'); t.ok((await p.locator(`tr[data-row]:has-text("${BOX}")`).count()) === 1, 'instance listed with name tag');
await p.locator(`tr[data-row]:has-text("${BOX}") [data-row-select]`).check();
await p.click('button:has-text("Instance state")'); await p.click('button.menu-item:has-text("Stop instance")'); await p.waitForSelector('#confirm-dialog[open]');
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Stopping'), 'stop instance: ' + await t.flash());
await p.locator(`tr[data-row]:has-text("${BOX}") [data-row-select]`).check();
await p.click('button:has-text("Instance state")'); await p.click('button.menu-item:has-text("Terminate instance")'); await p.waitForSelector('#confirm-dialog[open]');
await p.fill('[data-cd-input]', 'terminate'); await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), p.click('[data-cd-ok]')]);
t.ok((await t.flash()).includes('Terminating'), 'terminate: ' + await t.flash());
for (const pth of ['/ec2', '/ec2/images', '/ec2/images?owner=amazon', '/ec2/route-tables']) { await t.go(pth); t.ok((await p.locator('main').innerText()).length > 50 && (await p.locator('.flash-error').count()) === 0, `page renders: ${pth}`); }
await t.done();
