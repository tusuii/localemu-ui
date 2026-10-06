import { describe, expect, it } from 'vitest';
import { cliToSdk, jsLiteral, tokenizeCli } from '../../src/lib/clisdk';
import { expandTemplate, mergeRepeated } from '../../src/lib/clitemplate';

describe('tokenizeCli', () => {
  it('handles quotes', () => {
    expect(tokenizeCli(`aws x --a 'b c' --d "e \\"f\\"" g\\ h`)).toEqual(['aws', 'x', '--a', 'b c', '--d', 'e "f"', 'g h']);
    expect(tokenizeCli(`--p ''`)).toEqual(['--p', '']);
  });
});

describe('cliToSdk', () => {
  it('derives client, command and PascalCase members', () => {
    const out = cliToSdk('aws sqs create-queue --queue-name orders --attributes VisibilityTimeout=45,DelaySeconds=5 --endpoint-url http://localhost:4566 --region eu-west-1', { account: '123456789012' });
    expect(out).toContain('import { SQSClient, CreateQueueCommand } from "@aws-sdk/client-sqs";');
    expect(out).toContain('region: "eu-west-1"');
    expect(out).toContain('endpoint: "http://localhost:4566"');
    expect(out).toContain('accessKeyId: "123456789012"');
    expect(out).toContain('QueueName: "orders"');
    expect(out).toContain('Attributes: {\n    VisibilityTimeout: "45",\n    DelaySeconds: "5",\n  }');
    expect(out).toContain('await client.send(new CreateQueueCommand({');
    expect(out).not.toContain('--');
  });
  it('maps package and client names that differ from the CLI name', () => {
    expect(cliToSdk('aws events put-rule --name r --event-bus-name b')).toContain('import { EventBridgeClient, PutRuleCommand } from "@aws-sdk/client-eventbridge";');
    expect(cliToSdk('aws events put-rule --name r --event-bus-name b')).toContain('EventBusName: "b"');
    expect(cliToSdk('aws logs create-log-group --log-group-name g')).toContain('logGroupName: "g"'); // lowerCamel service
    expect(cliToSdk('aws logs create-log-group --log-group-name g')).toContain('CloudWatchLogsClient');
    expect(cliToSdk('aws stepfunctions list-state-machines')).toContain('SFNClient');
    expect(cliToSdk('aws rds describe-db-instances --db-instance-identifier x')).toContain('DBInstanceIdentifier: "x"');
  });
  it('coerces numbers, booleans, JSON and lists', () => {
    const out = cliToSdk(`aws dynamodb create-table --table-name T --billing-mode PAY_PER_REQUEST --attribute-definitions '[{"AttributeName":"id","AttributeType":"S"}]' --deletion-protection-enabled true --max-results 5`);
    expect(out).toContain('TableName: "T"');
    expect(out).toContain('DeletionProtectionEnabled: true');
    expect(out).toContain('MaxResults: 5');
    expect(out).toContain('AttributeType: "S"');
    expect(cliToSdk('aws kms list-keys --names a b')).toContain('Names: ["a", "b"]');
    expect(cliToSdk('aws sqs create-queue --queue-name <name>')).toContain('QueueName: "<name>"');
  });
  it('s3 high-level commands map to s3api calls with path style', () => {
    const mb = cliToSdk('aws s3 mb s3://my-bucket --endpoint-url http://localhost:4566');
    expect(mb).toContain('CreateBucketCommand({\n  Bucket: "my-bucket",\n})');
    expect(mb).toContain('forcePathStyle: true');
    expect(cliToSdk('aws s3 ls')).toContain('ListBucketsCommand({})');
    expect(cliToSdk('aws s3 cp a b')).toMatch(/^\/\/ "aws s3 cp"/);
  });
  it('flags without a value are true; global CLI-only flags are dropped', () => {
    const out = cliToSdk('aws sqs purge-queue --queue-url u --output json --no-paginate');
    expect(out).toContain('QueueUrl: "u"');
    expect(out).not.toContain('Output');
  });
  it('rejects non-commands', () => {
    expect(cliToSdk('ls -la')).toMatch(/^\/\/ /);
  });
});

describe('jsLiteral', () => {
  it('quotes only non-identifier keys', () => {
    expect(jsLiteral({ a: 1, 'b-c': [1, 2], d: {} })).toBe('{\n  a: 1,\n  "b-c": [1, 2],\n  d: {},\n}');
  });
});

describe('Show CLI templates', () => {
  const sqs = 'aws sqs create-queue --queue-name {name}{?type=fifo|.fifo} {?type=fifo|--attributes FifoQueue=true} {?dedup=1|--attributes ContentBasedDeduplication=true} {visibility|--attributes VisibilityTimeout=} {delay|--attributes DelaySeconds=}';
  const fill = (tpl: string, f: Record<string, string>) => expandTemplate(tpl, (n) => f[n] ?? '');
  it('SQS standard has no .fifo or FIFO attributes', () => {
    expect(fill(sqs, { type: 'standard', name: 'q' })).toBe('aws sqs create-queue --queue-name q');
  });
  it('SQS FIFO adds the suffix once, FIFO attributes merged into one flag', () => {
    expect(fill(sqs, { type: 'fifo', name: 'q', dedup: '1', visibility: '45' })).toBe('aws sqs create-queue --queue-name q.fifo --attributes FifoQueue=true,ContentBasedDeduplication=true,VisibilityTimeout=45');
    expect(fill(sqs, { type: 'fifo', name: 'q.fifo' })).toBe('aws sqs create-queue --queue-name q.fifo --attributes FifoQueue=true');
    expect(fill(sqs, { type: 'fifo', name: '' })).toBe('aws sqs create-queue --queue-name <name>.fifo --attributes FifoQueue=true');
  });
  const rule = 'aws events put-rule --name {name} {bus|--event-bus-name|!default} {pattern|--event-pattern|?kind=pattern} {schedule|--schedule-expression|?kind=schedule}';
  it('EventBridge rule includes --event-bus-name only for a non-default bus and the active kind', () => {
    expect(fill(rule, { name: 'r', bus: 'default', kind: 'pattern', pattern: '{"a":1}' })).toBe(`aws events put-rule --name r --event-pattern '{"a":1}'`);
    expect(fill(rule, { name: 'r', bus: 'custom', kind: 'schedule', schedule: 'rate(5 minutes)', pattern: '{"a":1}' })).toBe(`aws events put-rule --name r --event-bus-name custom --schedule-expression 'rate(5 minutes)'`);
  });
  it('mergeRepeated leaves different flags alone', () => {
    expect(mergeRepeated('x --a K=1 --b L=2 --a M=3')).toBe('x --a K=1 --b L=2 --a M=3');
  });
});
