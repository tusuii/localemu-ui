import { UserError } from './errors';

export function parseParams(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    if (i < 1) throw new UserError(`Invalid parameter line "${l}". Use Key=Value.`);
    return { ParameterKey: l.slice(0, i).trim(), ParameterValue: l.slice(i + 1) };
  });
}

export const SAMPLE_TEMPLATE = `AWSTemplateFormatVersion: '2010-09-09'
Description: Sample stack with a bucket and a queue
Parameters:
  Env:
    Type: String
    Default: dev
Resources:
  AssetsBucket:
    Type: AWS::S3::Bucket
  JobsQueue:
    Type: AWS::SQS::Queue
    Properties:
      VisibilityTimeout: 45
Outputs:
  BucketName:
    Value: !Ref AssetsBucket
  QueueUrl:
    Value: !Ref JobsQueue
`;

/**
 * Resolve the template the user supplied: an uploaded file wins over a URL, a URL over pasted text.
 * `required` = false lets update-style calls reuse the previous template.
 */
export async function templateFrom(f: FormData, required = true): Promise<{ TemplateBody?: string; TemplateURL?: string; UsePreviousTemplate?: boolean }> {
  const file = f.get('templateFile');
  if (file instanceof File && file.size > 0) {
    if (file.size > 1024 * 1024) throw new UserError('Template files are limited to 1 MB (use a template URL for larger ones).');
    const text = await file.text();
    if (!text.trim()) throw new UserError('The uploaded template file is empty.');
    return { TemplateBody: text };
  }
  const url = String(f.get('templateUrl') ?? '').trim();
  if (url) {
    if (!/^https?:\/\//i.test(url)) throw new UserError('The template URL must start with http:// or https://.');
    return { TemplateURL: url };
  }
  const body = String(f.get('template') ?? '');
  if (body.trim()) return { TemplateBody: body };
  if (required) throw new UserError('Provide a template: paste it, upload a file or enter a URL.');
  return { UsePreviousTemplate: true };
}

export const CAPABILITIES = ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM', 'CAPABILITY_AUTO_EXPAND'];
