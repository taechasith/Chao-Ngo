import { afterEach, describe, expect, it, vi } from 'vitest';
import { PretestRequestError, pretestErrorMessage, pretestRequest } from './pretest-request';
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const reply = (status: number, code?: string) => Response.json(code ? {code} : {sessionId:'saved',completed:true}, {status, headers:{'Retry-After':'2'}});
describe('pretest load recovery', () => {
  it('retries a busy database and returns the existing saved session', async () => {
    vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValueOnce(reply(503,'DATABASE_BUSY')).mockResolvedValueOnce(reply(200)); vi.stubGlobal('fetch',fetch);
    const task = pretestRequest('/pretest','GET',new AbortController().signal);
    await vi.runAllTimersAsync(); expect(await task).toEqual({sessionId:'saved',completed:true}); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('can resume after a lost POST response without clearing answers', async () => {
    vi.useFakeTimers(); const fetch = vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(reply(200)); vi.stubGlobal('fetch',fetch);
    const task = pretestRequest('/pretest','POST',new AbortController().signal);
    await vi.runAllTimersAsync(); expect(await task).toMatchObject({sessionId:'saved'}); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([[401,'UNAUTHENTICATED'],[403,'RESEARCH_CONSENT_REQUIRED'],[404,'QUESTIONNAIRE_NOT_FOUND']])('does not retry permanent status %s or bypass the pretest', async (status,code) => {
    const fetch = vi.fn().mockResolvedValue(reply(Number(status),String(code))); vi.stubGlobal('fetch',fetch);
    await expect(pretestRequest('/pretest','GET',new AbortController().signal)).rejects.toMatchObject({status,code}); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('limits retry attempts and keeps an actionable failure code', async () => {
    vi.useFakeTimers(); const fetch = vi.fn().mockImplementation(() => Promise.resolve(reply(503,'DATABASE_BUSY'))); vi.stubGlobal('fetch',fetch);
    const task = expect(pretestRequest('/pretest','GET',new AbortController().signal)).rejects.toMatchObject({status:503,code:'DATABASE_BUSY'});
    await vi.runAllTimersAsync(); await task; expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('stops loading when the participant leaves the case', async () => {
    vi.useFakeTimers(); const fetch = vi.fn().mockResolvedValue(reply(503,'DATABASE_BUSY')); vi.stubGlobal('fetch',fetch);
    const controller = new AbortController(); const task = expect(pretestRequest('/pretest','GET',controller.signal)).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(0); controller.abort(); await task; await vi.runAllTimersAsync(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('recovers from a stalled request instead of loading forever', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementationOnce((_url, options) => new Promise((_resolve,reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason)))).mockResolvedValueOnce(reply(200));
    vi.stubGlobal('fetch',fetch);
    const task = pretestRequest('/pretest','GET',new AbortController().signal);
    await vi.runAllTimersAsync(); expect(await task).toMatchObject({sessionId:'saved'}); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('distinguishes sign-in, consent, and database failures', () => {
    expect(pretestErrorMessage(new PretestRequestError('UNAUTHENTICATED',401))).toContain('เข้าสู่ระบบใหม่');
    expect(pretestErrorMessage(new PretestRequestError('RESEARCH_CONSENT_REQUIRED',403))).toContain('ยืนยันการเข้าร่วม');
    expect(pretestErrorMessage(new PretestRequestError('DATABASE_BUSY',503))).toContain('ผู้ใช้จำนวนมาก');
  });
});
