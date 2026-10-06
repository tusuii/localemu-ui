import type { Column, Job, JobUpdate, StorageDescriptor, Table, TableInput } from '@aws-sdk/client-glue';
import { UserError } from './errors';

export const FORMATS: Record<string, { label: string; input: string; output: string; serde: string; params?: Record<string, string> }> = {
  csv: { label: 'CSV', input: 'org.apache.hadoop.mapred.TextInputFormat', output: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat', serde: 'org.apache.hadoop.hive.serde2.lazy.LazySimpleSerDe', params: { 'field.delim': ',' } },
  json: { label: 'JSON', input: 'org.apache.hadoop.mapred.TextInputFormat', output: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat', serde: 'org.openx.data.jsonserde.JsonSerDe' },
  parquet: { label: 'Parquet', input: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat', output: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat', serde: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe' },
  orc: { label: 'ORC', input: 'org.apache.hadoop.hive.ql.io.orc.OrcInputFormat', output: 'org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat', serde: 'org.apache.hadoop.hive.ql.io.orc.OrcSerde' },
  avro: { label: 'Avro', input: 'org.apache.hadoop.hive.ql.io.avro.AvroContainerInputFormat', output: 'org.apache.hadoop.hive.ql.io.avro.AvroContainerOutputFormat', serde: 'org.apache.hadoop.hive.serde2.avro.AvroSerDe' },
};

/** Parse "name type" / "name:type" lines into Glue columns. */
export function parseColumns(src: string, what = 'Columns'): Column[] {
  return src.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*[:\s]\s*(.+)$/);
    if (!m) throw new UserError(`${what}: "${line}" is not "name type" (for example: id int).`);
    return { Name: m[1], Type: m[2].trim() };
  });
}

export function buildStorage(format: string, location: string, columns: Column[], delimiter?: string): StorageDescriptor {
  const f = FORMATS[format] ?? FORMATS.csv;
  const params = { ...(f.params ?? {}) };
  if (format === 'csv' && delimiter) params['field.delim'] = delimiter;
  return { Columns: columns, Location: location, InputFormat: f.input, OutputFormat: f.output, SerdeInfo: { SerializationLibrary: f.serde, Parameters: params } };
}

export function formatOf(sd?: StorageDescriptor): string {
  const lib = sd?.SerdeInfo?.SerializationLibrary ?? '';
  for (const f of Object.values(FORMATS)) if (f.serde === lib) return f.label;
  return lib ? lib.split('.').pop()! : '-';
}

export const GLUE_VERSIONS = ['4.0', '3.0', '2.0', '1.0'];
export const WORKER_TYPES = ['G.1X', 'G.2X', 'G.025X', 'Standard'];
export const roleName = (arn?: string) => (arn ? arn.split('/').pop()! : '-');
export const isNoSuch = (e: string | null | undefined) => !!e && /EntityNotFound|NotFound|does not exist|not found/i.test(e);

/** "name type" lines for a column list (the inverse of parseColumns). */
export const columnsText = (cols: Column[] | undefined) => (cols ?? []).map((c) => `${c.Name} ${c.Type}`).join('\n');

/** Keep existing column comments when a column is re-submitted by name. */
export function withComments(cols: Column[], old: Column[] | undefined): Column[] {
  const byName = new Map((old ?? []).map((c) => [c.Name, c.Comment]));
  return cols.map((c) => (byName.get(c.Name) ? { ...c, Comment: byName.get(c.Name) } : c));
}

/** "key=value" per line -> map (blank lines ignored). */
export function parsePairs(src: string, what = 'Arguments'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of src.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const i = line.indexOf('=');
    if (i < 1) throw new UserError(`${what}: "${line}" is not "key=value" (for example: --job-language=python).`);
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
export const pairsText = (m: Record<string, string> | undefined) => Object.entries(m ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');

/** UpdateTable replaces the whole definition, so start from the stored table and change only what was edited. */
export function tableInputFrom(t: Table, changes: { description?: string; location?: string; columns?: Column[] }): TableInput {
  const sd: StorageDescriptor = { ...(t.StorageDescriptor ?? {}) };
  if (changes.location !== undefined) sd.Location = changes.location || undefined;
  if (changes.columns) sd.Columns = withComments(changes.columns, sd.Columns);
  return {
    Name: t.Name!, Description: changes.description ?? t.Description, Owner: t.Owner, Retention: t.Retention, StorageDescriptor: sd,
    PartitionKeys: t.PartitionKeys, TableType: t.TableType, Parameters: t.Parameters, ViewOriginalText: t.ViewOriginalText, ViewExpandedText: t.ViewExpandedText,
  };
}

/** UpdateJob also replaces the whole job: copy the editable fields of the stored job. */
export function jobUpdateFrom(j: Job, changes: { role?: string; script?: string; description?: string; args?: Record<string, string> }): JobUpdate {
  const u: JobUpdate = {
    Role: changes.role ?? j.Role, Description: changes.description ?? j.Description,
    Command: { ...(j.Command ?? {}), ScriptLocation: changes.script ?? j.Command?.ScriptLocation },
    DefaultArguments: changes.args ?? j.DefaultArguments, NonOverridableArguments: j.NonOverridableArguments, Connections: j.Connections,
    MaxRetries: j.MaxRetries, Timeout: j.Timeout, ExecutionProperty: j.ExecutionProperty, GlueVersion: j.GlueVersion, WorkerType: j.WorkerType,
    NumberOfWorkers: j.NumberOfWorkers, SecurityConfiguration: j.SecurityConfiguration, NotificationProperty: j.NotificationProperty, LogUri: j.LogUri,
  };
  // MaxCapacity / AllocatedCapacity conflict with WorkerType + NumberOfWorkers, so they are left out when workers are set.
  if (!j.WorkerType) u.MaxCapacity = j.MaxCapacity;
  return Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined)) as JobUpdate;
}
