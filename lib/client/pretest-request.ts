export class PretestRequestError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

export function pretestErrorMessage(error: unknown): string {
  if (!(error instanceof PretestRequestError)) return 'เชื่อมต่อไม่ได้ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง คำตอบเดิมยังอยู่';
  if (error.status === 401) return 'การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่ คำตอบเดิมยังอยู่';
  if (error.code === 'RESEARCH_CONSENT_REQUIRED') return 'กรุณากลับไปยืนยันการเข้าร่วมก่อนเปิดแฟ้มคดี';
  if (error.code === 'RESEARCH_DATA_EXPIRED') return 'บัญชีนี้ยังเข้าถึงข้อมูลเกมไม่ได้ กรุณาติดต่อผู้ดูแล';
  if (error.code === 'QUESTIONNAIRE_NOT_FOUND') return 'ยังไม่มีแบบก่อนเล่นที่เผยแพร่สำหรับคดีนี้ กรุณาแจ้งผู้ดูแล';
  if (error.status === 429) return 'มีการโหลดซ้ำหลายครั้ง กรุณารอสักครู่แล้วลองอีกครั้ง';
  if (error.code === 'DATABASE_BUSY') return 'ระบบบันทึกข้อมูลกำลังมีผู้ใช้จำนวนมาก กรุณาลองอีกครั้งในสักครู่';
  if (error.code === 'AUTH_NOT_CONFIGURED' || error.code === 'RESEARCH_CONSENT_UNAVAILABLE') return 'ระบบบัญชียังไม่พร้อม กรุณาแจ้งผู้ดูแล';
  return 'ยังโหลดคำถามก่อนเล่นไม่ได้ กรุณาลองอีกครั้ง';
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Retry this resumable session endpoint only. Never use for finalizing submissions. */
export async function pretestRequest<T>(url: string, method: 'GET' | 'POST', signal: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    let error: unknown;
    let retryDelay = 1500 * (attempt + 1) + Math.floor(Math.random() * 500);
    const requestController = new AbortController();
    const abort = () => requestController.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => requestController.abort(new DOMException('Request timed out', 'TimeoutError')), 10000);
    try {
      const response = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', signal: requestController.signal });
      if (response.ok) return await response.json() as T;
      const payload = await response.json().catch(() => ({})) as { code?: string };
      error = new PretestRequestError(payload.code ?? 'LOAD_FAILED', response.status);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= 2) throw error;
      const retryAfter = Number(response.headers.get('Retry-After'));
      if (retryAfter > 0) retryDelay = Math.max(retryDelay, Math.min(retryAfter * 1000, 10000));
    } catch (caught) {
      if (signal.aborted || caught instanceof PretestRequestError || attempt >= 2) throw caught;
      error = caught;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
    // Only network errors and explicitly transient responses reach this delay.
    if (!error) throw new Error('Missing request error');
    await pause(retryDelay, signal);
  }
}
