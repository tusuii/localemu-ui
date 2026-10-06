import type { RegistrySpec } from './localemu';

export type CategoryId =
  | 'compute' | 'storage' | 'database' | 'networking' | 'security' | 'analytics'
  | 'integration' | 'management' | 'ml' | 'devtools' | 'media' | 'iot' | 'billing' | 'other';

export const CATEGORIES: Record<CategoryId, { name: string; color: string; icon: string }> = {
  compute: { name: 'Compute', color: '#ed7100', icon: 'cpu' },
  storage: { name: 'Storage', color: '#7aa116', icon: 'hard-drive' },
  database: { name: 'Database', color: '#c925d1', icon: 'database' },
  networking: { name: 'Networking & Content Delivery', color: '#8c4fff', icon: 'network' },
  security: { name: 'Security, Identity & Compliance', color: '#dd344c', icon: 'shield-check' },
  analytics: { name: 'Analytics', color: '#8c4fff', icon: 'chart-column' },
  integration: { name: 'Application Integration', color: '#e7157b', icon: 'workflow' },
  management: { name: 'Management & Governance', color: '#e7157b', icon: 'settings' },
  ml: { name: 'Machine Learning', color: '#01a88d', icon: 'brain-circuit' },
  devtools: { name: 'Developer Tools', color: '#c925d1', icon: 'hammer' },
  media: { name: 'Media Services', color: '#ed7100', icon: 'film' },
  iot: { name: 'Internet of Things', color: '#7aa116', icon: 'radio-tower' },
  billing: { name: 'Cloud Financial Management', color: '#7aa116', icon: 'ticket-percent' },
  other: { name: 'Other', color: '#5f6b7a', icon: 'box' },
};

export interface NavEntry { label: string; href: string; group?: string; icon?: string }

export interface ServiceDef {
  /** LocalEmu / SDK service id (matches /_localemu/health). */
  id: string;
  name: string;
  category: CategoryId;
  icon: string;
  description: string;
  /** Console landing page; absent for services only listed in the catalog. */
  href?: string;
  /** Left-hand navigation for services that have a console. */
  nav?: NavEntry[];
  keywords?: string[];
}

/** Services that have a purpose-built console in this app. */
export const CONSOLES: ServiceDef[] = [
  {
    id: 's3', name: 'S3', category: 'storage', icon: 'hard-drive', href: '/s3',
    description: 'Scalable storage in the cloud',
    keywords: ['bucket', 'object', 'storage', 'simple storage service'],
    nav: [{ label: 'Buckets', href: '/s3' }],
  },
  {
    id: 'dynamodb', name: 'DynamoDB', category: 'database', icon: 'table-2', href: '/dynamodb',
    description: 'Managed NoSQL database',
    keywords: ['table', 'nosql', 'item'],
    nav: [{ label: 'Tables', href: '/dynamodb' }],
  },
  {
    id: 'lambda', name: 'Lambda', category: 'compute', icon: 'square-terminal', href: '/lambda',
    description: 'Run code without thinking about servers',
    keywords: ['function', 'serverless', 'invoke'],
    nav: [{ label: 'Functions', href: '/lambda' }, { label: 'Layers', href: '/lambda/layers' }],
  },
  {
    id: 'ec2', name: 'EC2', category: 'compute', icon: 'server', href: '/ec2',
    description: 'Virtual servers in the cloud',
    keywords: ['instance', 'vpc', 'virtual machine', 'security group', 'subnet', 'volume', 'key pair'],
    nav: [
      { label: 'Dashboard', href: '/ec2' },
      { group: 'Instances', label: 'Instances', href: '/ec2/instances' },
      { group: 'Instances', label: 'Images (AMIs)', href: '/ec2/images' },
      { group: 'Elastic Block Store', label: 'Volumes', href: '/ec2/volumes' },
      { group: 'Elastic Block Store', label: 'Snapshots', href: '/ec2/snapshots' },
      { group: 'Network & Security', label: 'Security groups', href: '/ec2/security-groups' },
      { group: 'Network & Security', label: 'Elastic IPs', href: '/ec2/addresses' },
      { group: 'Network & Security', label: 'Key pairs', href: '/ec2/key-pairs' },
      { group: 'VPC', label: 'Your VPCs', href: '/ec2/vpcs' },
      { group: 'VPC', label: 'Subnets', href: '/ec2/subnets' },
      { group: 'VPC', label: 'Internet gateways', href: '/ec2/internet-gateways' },
      { group: 'VPC', label: 'Route tables', href: '/ec2/route-tables' },
    ],
  },
  {
    id: 'sqs', name: 'SQS', category: 'integration', icon: 'inbox', href: '/sqs',
    description: 'Managed message queues',
    keywords: ['queue', 'message', 'simple queue service'],
    nav: [{ label: 'Queues', href: '/sqs' }],
  },
  {
    id: 'sns', name: 'SNS', category: 'integration', icon: 'bell', href: '/sns',
    description: 'Pub/sub messaging and mobile notifications',
    keywords: ['topic', 'subscription', 'publish', 'notification', 'simple notification service'],
    nav: [{ label: 'Topics', href: '/sns' }, { label: 'Subscriptions', href: '/sns/subscriptions' }],
  },
  {
    id: 'events', name: 'EventBridge', category: 'integration', icon: 'zap', href: '/events',
    description: 'Serverless event bus',
    keywords: ['rule', 'bus', 'cloudwatch events', 'event'],
    nav: [{ label: 'Event buses', href: '/events' }, { label: 'Rules', href: '/events/rules' }, { label: 'Send events', href: '/events/put' }],
  },
  {
    id: 'stepfunctions', name: 'Step Functions', category: 'integration', icon: 'workflow', href: '/stepfunctions',
    description: 'Visual workflows for distributed apps',
    keywords: ['state machine', 'workflow', 'sfn', 'execution'],
    nav: [{ label: 'State machines', href: '/stepfunctions' }],
  },
  {
    id: 'kinesis', name: 'Kinesis', category: 'analytics', icon: 'waypoints', href: '/kinesis',
    description: 'Real-time data streams',
    keywords: ['stream', 'shard', 'record'],
    nav: [{ label: 'Data streams', href: '/kinesis' }],
  },
  {
    id: 'iam', name: 'IAM', category: 'security', icon: 'fingerprint', href: '/iam',
    description: 'Manage access to AWS resources',
    keywords: ['user', 'role', 'policy', 'group', 'identity', 'access'],
    nav: [
      { label: 'Dashboard', href: '/iam' },
      { group: 'Access management', label: 'Users', href: '/iam/users' },
      { group: 'Access management', label: 'User groups', href: '/iam/groups' },
      { group: 'Access management', label: 'Roles', href: '/iam/roles' },
      { group: 'Access management', label: 'Policies', href: '/iam/policies' },
    ],
  },
  {
    id: 'secretsmanager', name: 'Secrets Manager', category: 'security', icon: 'key-round', href: '/secretsmanager',
    description: 'Rotate, manage, and retrieve secrets',
    keywords: ['secret', 'password', 'credential'],
    nav: [{ label: 'Secrets', href: '/secretsmanager' }],
  },
  {
    id: 'kms', name: 'KMS', category: 'security', icon: 'lock', href: '/kms',
    description: 'Create and control encryption keys',
    keywords: ['key', 'encrypt', 'decrypt', 'key management service'],
    nav: [{ label: 'Customer managed keys', href: '/kms' }],
  },
  {
    id: 'ssm', name: 'Systems Manager', category: 'management', icon: 'settings', href: '/ssm',
    description: 'Parameter Store and operational tools',
    keywords: ['parameter', 'parameter store', 'ssm', 'config'],
    nav: [{ label: 'Parameter Store', href: '/ssm' }],
  },
  {
    id: 'logs', name: 'CloudWatch Logs', category: 'management', icon: 'scroll-text', href: '/logs',
    description: 'Monitor, store, and access log files',
    keywords: ['log group', 'log stream', 'cloudwatch'],
    nav: [{ label: 'Log groups', href: '/logs' }],
  },
  {
    id: 'cloudwatch', name: 'CloudWatch', category: 'management', icon: 'activity', href: '/cloudwatch',
    description: 'Metrics and alarms',
    keywords: ['alarm', 'metric', 'monitoring'],
    nav: [{ label: 'Alarms', href: '/cloudwatch' }, { label: 'Metrics', href: '/cloudwatch/metrics' }],
  },
  {
    id: 'cloudformation', name: 'CloudFormation', category: 'management', icon: 'layers', href: '/cloudformation',
    description: 'Create and manage resources with templates',
    keywords: ['stack', 'template', 'iac', 'infrastructure'],
    nav: [{ label: 'Stacks', href: '/cloudformation' }],
  },
  {
    id: 'route53', name: 'Route 53', category: 'networking', icon: 'route', href: '/route53',
    description: 'Scalable DNS and domain name registration',
    keywords: ['dns', 'hosted zone', 'record'],
    nav: [{ label: 'Hosted zones', href: '/route53' }],
  },
  {
    id: 'apigateway', name: 'API Gateway', category: 'networking', icon: 'route', href: '/apigateway',
    description: 'Build, deploy and manage APIs',
    keywords: ['rest api', 'http api', 'stage', 'endpoint', 'apigatewayv2'],
    nav: [{ label: 'APIs', href: '/apigateway' }, { label: 'API keys & usage plans', href: '/apigateway/keys' }],
  },
  {
    id: 'rds', name: 'RDS', category: 'database', icon: 'database', href: '/rds',
    description: 'Managed relational databases',
    keywords: ['database', 'mysql', 'postgres', 'aurora', 'instance', 'cluster'],
    nav: [{ label: 'Databases', href: '/rds' }, { label: 'Snapshots', href: '/rds/snapshots' }, { label: 'Subnet groups', href: '/rds/subnet-groups' }, { label: 'Parameter groups', href: '/rds/parameter-groups' }],
  },
  {
    id: 'ecs', name: 'ECS', category: 'compute', icon: 'container', href: '/ecs',
    description: 'Run containerized applications',
    keywords: ['container', 'cluster', 'task', 'service', 'fargate'],
    nav: [{ label: 'Clusters', href: '/ecs' }, { label: 'Task definitions', href: '/ecs/task-definitions' }],
  },
  {
    id: 'ecr', name: 'ECR', category: 'compute', icon: 'package', href: '/ecr',
    description: 'Store and manage container images',
    keywords: ['container', 'image', 'registry', 'repository', 'docker'],
    nav: [{ label: 'Repositories', href: '/ecr' }],
  },
  {
    id: 'cognito-idp', name: 'Cognito', category: 'security', icon: 'users', href: '/cognito-idp',
    description: 'Identity for web and mobile apps',
    keywords: ['user pool', 'users', 'authentication', 'login', 'app client'],
    nav: [{ label: 'User pools', href: '/cognito-idp' }],
  },
  {
    id: 'elbv2', name: 'Elastic Load Balancing', category: 'networking', icon: 'network', href: '/elbv2',
    description: 'Distribute traffic across targets',
    keywords: ['load balancer', 'alb', 'nlb', 'target group', 'listener', 'elb'],
    nav: [{ label: 'Load balancers', href: '/elbv2' }, { label: 'Target groups', href: '/elbv2/target-groups' }],
  },
  {
    id: 'acm', name: 'Certificate Manager', category: 'security', icon: 'badge-check', href: '/acm',
    description: 'Provision and manage TLS certificates',
    keywords: ['certificate', 'tls', 'ssl', 'domain'],
    nav: [{ label: 'Certificates', href: '/acm' }],
  },
  {
    id: 'athena', name: 'Athena', category: 'analytics', icon: 'search', href: '/athena',
    description: 'Query data in S3 using SQL',
    keywords: ['sql', 'query', 'workgroup', 'database'],
    nav: [{ label: 'Query editor', href: '/athena' }, { label: 'Workgroups', href: '/athena/workgroups' }],
  },
  {
    id: 'glue', name: 'Glue', category: 'analytics', icon: 'git-merge', href: '/glue',
    description: 'Discover, prepare and integrate data',
    keywords: ['data catalog', 'database', 'table', 'crawler', 'etl', 'job'],
    nav: [{ label: 'Databases', href: '/glue' }, { label: 'Tables', href: '/glue/tables' }, { label: 'Crawlers', href: '/glue/crawlers' }, { label: 'Jobs', href: '/glue/jobs' }],
  },
  {
    id: 'cloudtrail', name: 'CloudTrail', category: 'security', icon: 'history', href: '/activity',
    description: 'Every API call LocalEmu has served',
    keywords: ['audit', 'api calls', 'activity', 'event history'],
    nav: [{ label: 'Event history', href: '/activity' }],
  },
];

const BY_ID = new Map(CONSOLES.map((s) => [s.id, s]));
export const consoleFor = (id: string) => BY_ID.get(id);

/** The console owning a URL path ("/s3/foo" -> S3), for sidebar + "recently visited". */
export function serviceForPath(path: string): ServiceDef | undefined {
  const seg = path.split('/').filter(Boolean)[0];
  if (!seg) return undefined;
  const alias: Record<string, string> = { activity: 'cloudtrail' };
  return BY_ID.get(alias[seg] ?? seg);
}

const DATABASE = new Set(['dynamodb', 'rds', 'rds-data', 'redshift', 'redshift-data', 'elasticache', 'memorydb', 'neptune', 'timestream-write', 'dax', 'dms', 'docdb']);
const SECURITY = new Set(['cognito-idp', 'cognito-identity', 'acm', 'acm-pca', 'wafv2', 'waf', 'guardduty', 'inspector2', 'macie2', 'securityhub', 'shield', 'kms', 'secretsmanager', 'iam', 'sts', 'identitystore', 'ds', 'ram', 'signer', 'cloudhsmv2', 'sso-admin', 'organizations']);
const COMPUTE_CONTAINERS = new Set(['ecs', 'eks', 'ecr', 'batch', 'apprunner', 'autoscaling', 'application-autoscaling', 'elasticbeanstalk', 'appmesh', 'appsync']);

const GROUP_TO_CATEGORY: Record<string, CategoryId> = {
  storage: 'storage', compute: 'compute', messaging: 'integration', security: 'security',
  monitoring: 'management', networking: 'networking', analytics: 'analytics', ops: 'management',
  ml: 'ml', media: 'media', devtools: 'devtools', iot: 'iot', billing: 'billing', other: 'other',
};

export function categoryFor(id: string, group?: string): CategoryId {
  if (DATABASE.has(id)) return 'database';
  if (SECURITY.has(id)) return 'security';
  if (COMPUTE_CONTAINERS.has(id)) return 'compute';
  return GROUP_TO_CATEGORY[group ?? 'other'] ?? 'other';
}

export interface CatalogEntry extends ServiceDef {
  tier?: RegistrySpec['tier'];
  status?: string;
  /** Where the tile links to: the console, else the generic service page. */
  link: string;
  hasConsole: boolean;
}

const titleCase = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

/**
 * Merge the built-in consoles with whatever LocalEmu reports (health + registry)
 * so every service the gateway serves has a tile, console or not.
 */
export function buildCatalog(health?: Record<string, string>, registry?: RegistrySpec[]): CatalogEntry[] {
  const regByName = new Map((registry ?? []).map((r) => [r.name, r]));
  const out = new Map<string, CatalogEntry>();
  const add = (def: ServiceDef, console_: boolean) => {
    const reg = regByName.get(def.id);
    out.set(def.id, {
      ...def,
      tier: reg?.tier,
      status: health?.[def.id],
      link: console_ ? def.href! : `/service/${def.id}`,
      hasConsole: console_,
    });
  };
  for (const c of CONSOLES) add(c, true);
  const ids = new Set<string>([...Object.keys(health ?? {}), ...(registry ?? []).map((r) => r.name)]);
  for (const id of ids) {
    if (out.has(id)) continue;
    const reg = regByName.get(id);
    const category = categoryFor(id, reg?.group);
    add(
      {
        id,
        name: reg?.label ?? titleCase(id),
        category,
        icon: CATEGORIES[category].icon,
        description: reg?.banner ?? `${CATEGORIES[category].name} service`,
      },
      false,
    );
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function groupByCategory(entries: CatalogEntry[]) {
  const order = Object.keys(CATEGORIES) as CategoryId[];
  return order
    .map((id) => ({ id, ...CATEGORIES[id], items: entries.filter((e) => e.category === id) }))
    .filter((g) => g.items.length);
}
