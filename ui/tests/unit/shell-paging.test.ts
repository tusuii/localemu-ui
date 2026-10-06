import { describe, expect, it } from 'vitest';
import { detectPaging } from '../../src/lib/shell';

describe('detectPaging', () => {
  it('finds token pairs from input/output member names', () => {
    expect(detectPaging(['MaxResults', 'NextToken'], ['QueueUrls', 'NextToken'])).toEqual({ inName: 'NextToken', outName: 'NextToken' });
    expect(detectPaging(['Bucket', 'ContinuationToken'], ['Contents', 'NextContinuationToken'])).toEqual({ inName: 'ContinuationToken', outName: 'NextContinuationToken' });
    expect(detectPaging(['Marker', 'MaxItems'], ['Users', 'IsTruncated', 'Marker'])).toEqual({ inName: 'Marker', outName: 'Marker' });
    expect(detectPaging(['Marker'], ['Functions', 'NextMarker'])).toEqual({ inName: 'Marker', outName: 'NextMarker' });
    expect(detectPaging(['TableName', 'ExclusiveStartKey'], ['Items', 'LastEvaluatedKey'])).toEqual({ inName: 'ExclusiveStartKey', outName: 'LastEvaluatedKey' });
    expect(detectPaging(['nextToken'], ['events', 'nextToken'])).toEqual({ inName: 'nextToken', outName: 'nextToken' });
  });
  it('returns null when there is no matching response member', () => {
    expect(detectPaging(['QueueUrl'], ['MessageId'])).toBeNull();
    expect(detectPaging(['NextToken'], ['Things'])).toBeNull();
  });
});
