export interface EngineDef { id: string; label: string; port: number; cluster?: boolean; versions: string[] }

export const ENGINES: EngineDef[] = [
  { id: 'mysql', label: 'MySQL', port: 3306, versions: ['8.0.36', '8.0.35', '5.7.44'] },
  { id: 'postgres', label: 'PostgreSQL', port: 5432, versions: ['16.2', '15.6', '14.11', '13.14'] },
  { id: 'mariadb', label: 'MariaDB', port: 3306, versions: ['10.11.6', '10.6.16'] },
  { id: 'oracle-se2', label: 'Oracle SE2', port: 1521, versions: ['19.0.0.0.ru-2024-01.rur-2024-01.r1'] },
  { id: 'sqlserver-ex', label: 'SQL Server Express', port: 1433, versions: ['15.00.4345.5.v1'] },
  { id: 'aurora-mysql', label: 'Aurora MySQL', port: 3306, cluster: true, versions: ['8.0.mysql_aurora.3.05.2', '5.7.mysql_aurora.2.12.2'] },
  { id: 'aurora-postgresql', label: 'Aurora PostgreSQL', port: 5432, cluster: true, versions: ['16.2', '15.6', '14.11'] },
];

export const INSTANCE_CLASSES = [
  'db.t3.micro', 'db.t3.small', 'db.t3.medium', 'db.t3.large', 'db.t4g.micro', 'db.t4g.small', 'db.t4g.medium',
  'db.m5.large', 'db.m5.xlarge', 'db.m6g.large', 'db.r5.large', 'db.r5.xlarge', 'db.r6g.large',
];

export const engineLabel = (id: string | undefined) => ENGINES.find((e) => e.id === id)?.label ?? id ?? '-';

/** RDS identifiers: letter first, letters/digits/hyphens, no trailing or double hyphen. */
export function validIdentifier(v: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*(-[A-Za-z0-9]+)*$/.test(v) && v.length <= 63;
}

export const dbTags = (t: { Key?: string; Value?: string }[] | undefined) => (t ?? []).filter((x) => x.Key);
