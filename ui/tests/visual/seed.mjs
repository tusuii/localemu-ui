// Seeds a known, small set of resources under a dedicated account id so the
// screenshots never depend on whatever else lives in the LocalEmu instance.
import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, CreateTableCommand, PutItemCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, CreateQueueCommand } from '@aws-sdk/client-sqs';
import { IAMClient, CreateRoleCommand, AttachRolePolicyCommand, CreatePolicyCommand } from '@aws-sdk/client-iam';
import { EC2Client, RunInstancesCommand, DescribeInstancesCommand, CreateTagsCommand } from '@aws-sdk/client-ec2';
import { NodeHttpHandler } from '@smithy/node-http-handler';

export const ACCOUNT = '111111111111';
export const REGION = 'us-east-1';
export const ENDPOINT = (process.env.LOCALEMU_ENDPOINT ?? 'http://localhost:4566').replace(/\/+$/, '');

const cfg = {
  endpoint: ENDPOINT, region: REGION,
  credentials: { accessKeyId: ACCOUNT, secretAccessKey: 'test' },
  requestHandler: new NodeHttpHandler({ connectionTimeout: 5000, requestTimeout: 30000 }),
};
const quiet = async (fn) => { try { return await fn(); } catch (e) { if (!/Exists|AlreadyOwned|InUse|EntityAlreadyExists|already/i.test(`${e.name} ${e.message}`)) throw e; } };

const trust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] });
const ec2Trust = trust.replace('lambda.amazonaws.com', 'ec2.amazonaws.com');

export async function seed() {
  const s3 = new S3Client({ ...cfg, forcePathStyle: true });
  for (const b of ['vr-assets', 'vr-logs']) await quiet(() => s3.send(new CreateBucketCommand({ Bucket: b })));
  const put = (Key, Body, ContentType) => s3.send(new PutObjectCommand({ Bucket: 'vr-assets', Key, Body, ContentType }));
  await put('readme.txt', 'Visual regression fixture.\n', 'text/plain');
  await put('data/report.csv', 'id,total\n1,10\n2,20\n', 'text/csv');
  await put('data/archive/2024.json', '{"year":2024}', 'application/json');
  await put('images/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>', 'image/svg+xml');

  const ddb = new DynamoDBClient(cfg);
  await quiet(() => ddb.send(new CreateTableCommand({
    TableName: 'vr-orders', BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }], AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
  })));
  for (let i = 1; i <= 3; i++) {
    await ddb.send(new PutItemCommand({ TableName: 'vr-orders', Item: { id: { S: `order-${i}` }, total: { N: String(i * 25) }, status: { S: i === 2 ? 'shipped' : 'pending' } } }));
  }
  await ddb.send(new DescribeTableCommand({ TableName: 'vr-orders' }));

  const sqs = new SQSClient(cfg);
  for (const q of ['vr-jobs', 'vr-dead-letter']) await quiet(() => sqs.send(new CreateQueueCommand({ QueueName: q })));
  await quiet(() => sqs.send(new CreateQueueCommand({ QueueName: 'vr-events.fifo', Attributes: { FifoQueue: 'true' } })));

  const iam = new IAMClient(cfg);
  await quiet(() => iam.send(new CreateRoleCommand({ RoleName: 'vr-lambda-role', AssumeRolePolicyDocument: trust, Description: 'Visual test role' })));
  await quiet(() => iam.send(new CreateRoleCommand({ RoleName: 'vr-ec2-role', AssumeRolePolicyDocument: ec2Trust })));
  await quiet(() => iam.send(new AttachRolePolicyCommand({ RoleName: 'vr-lambda-role', PolicyArn: 'arn:aws:iam::aws:policy/AWSLambdaExecute' })));

  const ec2 = new EC2Client(cfg);
  const found = await ec2.send(new DescribeInstancesCommand({ Filters: [{ Name: 'tag:Name', Values: ['vr-web'] }, { Name: 'instance-state-name', Values: ['pending', 'running', 'stopped'] }] }));
  if (!found.Reservations?.length) {
    const r = await ec2.send(new RunInstancesCommand({ ImageId: 'ami-03cf127a', InstanceType: 't3.micro', MinCount: 1, MaxCount: 1, TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: 'vr-web' }] }] }));
    await ec2.send(new CreateTagsCommand({ Resources: [r.Instances[0].InstanceId], Tags: [{ Key: 'Name', Value: 'vr-web' }] }));
  }
}
