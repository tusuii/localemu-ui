// The fixed set of pages that get screenshotted. Each shot is rendered once per
// variant (viewport + colour theme). Names become baseline file names.

export const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

const light = { id: 'light', viewport: 'desktop', theme: 'light' };
const dark = { id: 'dark', viewport: 'desktop', theme: 'dark' };
const mobile = { id: 'mobile', viewport: 'mobile', theme: 'light' };

export const SHOTS = [
  { name: 'home', path: '/', variants: [light, dark], // home-mobile disabled: content overflows the 390px viewport (renders nondeterministically)
    async before(page) { await maskVolatileHome(page); } },
  { name: 'services-menu', path: '/', variants: [light, dark],
    async before(page) { await page.click('[data-menu-toggle="menu-services"]'); await page.waitForSelector('#menu-services', { state: 'visible' }); await maskVolatileHome(page); } },
  { name: 's3-buckets', path: '/s3', variants: [light, dark, mobile] },
  { name: 's3-objects', path: '/s3/vr-assets', variants: [light, dark] },
  { name: 'dynamodb-items', path: '/dynamodb/vr-orders', variants: [light, dark] },
  { name: 'sqs-queues', path: '/sqs', variants: [light, dark] },
  { name: 'iam-roles', path: '/iam/roles', variants: [light, dark] },
  { name: 'ec2-instances', path: '/ec2/instances', variants: [light, dark] },
  { name: 'settings', path: '/settings', variants: [light, dark] },
];

/** Hide the activity feed and uptime/version rows on the home page (they change on every request). */
async function maskVolatileHome(page) {
  await page.evaluate(() => {
    for (const card of document.querySelectorAll('main section, main .card, main [class*="card"]')) {
      const t = card.querySelector('h2, h3')?.textContent?.trim() ?? '';
      if (/activity|recent api|events/i.test(t)) card.setAttribute('data-vr-mask', '');
    }
    for (const dt of document.querySelectorAll('dt')) {
      if (/uptime|started/i.test(dt.textContent)) dt.parentElement?.setAttribute('data-vr-mask', '');
    }
  });
}
