import { start } from './lib.mjs';
import { ECRClient, PutImageCommand } from '@aws-sdk/client-ecr';
const t = await start(); const { p } = t;
const s = Date.now().toString(36);
const repo = `e2e/app-${s}`;
const ecr = new ECRClient({ endpoint: 'http://localhost:4566', region: 'us-east-1', credentials: { accessKeyId: '000000000000', secretAccessKey: 'test' } });

await t.go('/ecr/create');
await p.fill('#name', repo); await p.selectOption('#mutability', 'IMMUTABLE'); await p.check('input[name=scan]');
await t.submit('button:has-text("Create repository")');
t.ok(p.url().endsWith(`/ecr/${repo}`) && (await t.flash()).includes('created successfully'), 'create repo (with slash): ' + await t.flash());

// push an image straight to the registry API, then see it in the console
const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
  config: { mediaType: 'application/vnd.docker.container.image.v1+json', size: 10, digest: 'sha256:' + 'a'.repeat(64) },
  layers: [{ mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip', size: 2048, digest: 'sha256:' + 'b'.repeat(64) }] });
await ecr.send(new PutImageCommand({ repositoryName: repo, imageTag: 'v1', imageManifest: manifest }));
await t.go(`/ecr/${repo}`);
t.ok((await p.locator('form[data-table=images] tr[data-row]:has-text("v1")').count()) === 1, 'image with tag listed');

// permissions
await t.go(`/ecr/${repo}?tab=permissions`);
await t.submit('button:has-text("Save policy")');
t.ok((await t.flash()).includes('policy saved'), 'save repository policy: ' + await t.flash());
t.ok((await p.locator('#policy').inputValue()).includes('AllowPull'), 'policy persisted');
// lifecycle
await t.go(`/ecr/${repo}?tab=lifecycle`);
await t.submit('button:has-text("Save policy")');
t.ok((await t.flash()).includes('policy saved'), 'save lifecycle policy: ' + await t.flash());
await Promise.all([p.waitForNavigation({ waitUntil: 'load' }), (async () => { await p.click('button:has-text("Delete policy")'); await p.waitForSelector('#confirm-dialog[open]'); await p.click('[data-cd-ok]'); })()]);
t.ok((await t.flash()).includes('policy deleted'), 'delete lifecycle policy: ' + await t.flash());
// details + push commands
await t.go(`/ecr/${repo}?tab=details`);
const push = await p.locator('#push-commands').innerText();
t.ok(push.includes('docker push') && push.includes(`.dkr.ecr.us-east-1.amazonaws.com/${repo}:latest`), 'push commands use repositoryUri');
await t.go(`/ecr/${repo}?tab=tags`);
await p.fill('#tags-key', 'repo-tag'); await p.fill('#tags-value', 'v1'); await t.submit('button:has-text("Add tag")');
t.ok((await t.flash()).includes('Tag added') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("repo-tag")').count()) === 1, 'add tag repo-tag: ' + await t.flash());
await t.confirmAction('repo-tag', 'Remove', null);
t.ok((await t.flash()).includes('Removed 1 tag') && (await p.locator('form[data-table=tags] tr[data-row]:has-text("repo-tag")').count()) === 0, 'remove tag repo-tag: ' + await t.flash());
// delete image
await t.go(`/ecr/${repo}`);
await t.confirmAction('v1', 'Delete', 'delete');
t.ok((await p.locator('form[data-table=images] tr[data-row]').count()) === 0, 'image deleted: ' + await t.flash());
// delete repo
await t.go('/ecr');
t.ok((await p.locator(`tr[data-row]:has-text("${repo}")`).count()) === 1, 'repo listed');
await t.confirmAction(repo, 'Delete', 'delete');
t.ok((await p.locator(`tr[data-row]:has-text("${repo}")`).count()) === 0, 'repo deleted');
await t.done();
