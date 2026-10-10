import { describe, expect, it } from 'vitest';
// @ts-expect-error Standalone CI diagnostic script.
import { summarizePretestEvent } from './tail-pretest-diagnostics.mjs';
describe('private pretest diagnostics', () => {
  it('retains only aggregate status and known error category', () => {
    const event = {event:{request:{url:'https://example.test/api/questionnaires/pretest:subgame-ka-wa-ve/sessions?email=private@example.test',headers:{cookie:'secret'}},response:{status:500}},exceptions:[{message:'D1_ERROR: D1 DB is overloaded. Requests queued for too long. secret private@example.test'}]};
    expect(summarizePretestEvent(event)).toEqual({status:500,reason:'database_busy'});
  });
  it('ignores other endpoints and unknown exception contents', () => {
    expect(summarizePretestEvent({event:{request:{url:'https://example.test/api/auth/callback/google?code=secret'}}})).toBeNull();
    expect(summarizePretestEvent({event:{request:{url:'https://example.test/api/questionnaires/pretest%3Asubgame-ka-fintech/sessions'},response:{status:500}},exceptions:[{message:'private user answer'}]})).toEqual({status:500,reason:'unclassified_exception'});
  });
});
