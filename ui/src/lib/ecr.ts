import { PUBLIC_ENDPOINT } from './config';

export const POLICY_TEMPLATE = JSON.stringify({
  Version: '2012-10-17',
  Statement: [{ Sid: 'AllowPull', Effect: 'Allow', Principal: '*', Action: ['ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage', 'ecr:BatchCheckLayerAvailability'] }],
}, null, 2);

export const LIFECYCLE_TEMPLATE = JSON.stringify({
  rules: [{ rulePriority: 1, description: 'Expire untagged images beyond the newest 10', selection: { tagStatus: 'untagged', countType: 'imageCountMoreThan', countNumber: 10 }, action: { type: 'expire' } }],
}, null, 2);

/** Docker commands for pushing a local image to this repository on LocalEmu. */
export function pushCommands(repoUri: string, region: string) {
  const registry = repoUri.split('/')[0];
  return [
    `aws ecr get-login-password --region ${region} --endpoint-url ${PUBLIC_ENDPOINT} \\`,
    `  | docker login --username AWS --password-stdin ${registry}`,
    `docker build -t ${repoUri.split('/').slice(1).join('/')} .`,
    `docker tag ${repoUri.split('/').slice(1).join('/')}:latest ${repoUri}:latest`,
    `docker push ${repoUri}:latest`,
  ].join('\n');
}
