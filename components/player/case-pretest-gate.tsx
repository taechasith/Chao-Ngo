"use client";

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { caseRoutes } from '../../lib/question-pack';
import { PretestRequestError, pretestErrorMessage, pretestRequest } from '../../lib/client/pretest-request';
import { useAnswerAutosave } from '../../lib/client/use-answer-autosave';
import { compatibleQuestion, useLiveQuestionnaire, type LiveForm } from '../../lib/client/use-live-questionnaire';
import { QuestionnairePanel } from './submit-flow';
import { Panel } from './panel';

export function CasePretestGate({ children, subgameId }: { children: ReactNode; subgameId: string }) {
  const [form, setForm] = useState<LiveForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState<PretestRequestError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { saver, status, pendingCount } = useAnswerAutosave(setMessage);
  const live = useLiveQuestionnaire({ forms: form ? [{ ...form, responses: answers }] : [], enabled: !ready, saver,
    onUpdate: (_old, next, pending) => { setForm(next); setAnswers({ ...next.responses, ...pending }); },
  });
  useEffect(() => {
    const controller = new AbortController();
    setReady(false); setForm(null); setMessage(''); setLoadError(null);
    void (async () => {
      try {
        const url = `/api/questionnaires/pretest:${subgameId}/sessions`;
        type Payload = { questionnaire: Omit<LiveForm, 'sessionId' | 'completed' | 'responses'>; sessionId: string | null; completed?: boolean; responses: Record<string, unknown>; previousForms?: LiveForm[] };
        let payload = await pretestRequest<Payload>(url, 'GET', controller.signal);
        if (payload.completed) { setReady(true); return; }
        if (!payload.sessionId) {
          payload = await pretestRequest<Payload>(url, 'POST', controller.signal);
          if (payload.completed) { setReady(true); return; }
        }
        if (!payload.sessionId) throw new Error('ยังเปิดแบบทดสอบไม่ได้ กรุณาลองอีกครั้ง');
        const sessionId = payload.sessionId;
        const initial = { ...payload.responses, ...saver.restore(sessionId, payload.questionnaire.questions.map(q => q.id)) };
        for (const previous of payload.previousForms ?? []) {
          saver.restore(previous.sessionId, previous.questions.map(q => q.id));
          Object.assign(initial, await saver.rebindSession(previous.sessionId, sessionId, (id, value) => {
            const source = previous.questions.find(q => q.id === id);
            const target = payload.questionnaire.questions.find(q => q.key === source?.key);
            return source && target && compatibleQuestion(source, target, value) ? target.id : undefined;
          }));
        }
        if (!controller.signal.aborted) {
          setForm({ ...payload.questionnaire, sessionId, completed: false, responses: payload.responses });
          setAnswers(initial); void saver.flush(sessionId);
        }
      } catch (error) { if (!controller.signal.aborted) {
        setLoadError(error instanceof PretestRequestError ? error : null);
        setMessage(pretestErrorMessage(error));
      } }
    })();
    return () => controller.abort();
  }, [subgameId, attempt, saver]);
  useEffect(() => {
    if (ready || form || !message || (loadError && loadError.status < 429)) return;
    const reconnect = () => setAttempt(value => value + 1);
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [ready, form, message, loadError]);
  if (ready) return children;
  return <div className="player-content">
    <Panel><span className="player-eyebrow">BEFORE THE CASE / ก่อนเปิดแฟ้ม</span><h1 className="mt-3 font-display text-3xl">ลองตอบจากความเข้าใจก่อนเล่น</h1>
      <p className="mt-4 leading-7 text-white/75">ตอบเฉพาะคดีที่เลือก ก่อนอ่านหลักฐานหรือใช้ AI ข้อที่ยังไม่รู้เลือก “ยังไม่แน่ใจ” ได้ ไม่มีการสอบผ่านหรือตก</p>
      {!form ? <p className="mt-4" role="status">{message || 'กำลังโหลดคำถามก่อนเล่น…'}</p> : null}
      {message && !form ? <button className="player-button mt-4" onClick={() => setAttempt(value => value + 1)} type="button">ลองอีกครั้ง</button> : null}
      {loadError?.status === 401 ? <Link className="player-button mt-4 ml-3" href={`/login?next=${encodeURIComponent(caseRoutes[subgameId] ?? '/play')}`}>เข้าสู่ระบบด้วย Google ใหม่</Link> : null}
      {loadError?.code === 'RESEARCH_CONSENT_REQUIRED' ? <Link className="player-button mt-4 ml-3" href="/onboarding">กลับไปยืนยันการเข้าร่วม</Link> : null}
      {loadError ? <p className="mt-3 text-sm text-white/60">รหัสสำหรับแจ้งผู้ดูแล: {loadError.status} / {loadError.code}</p> : null}
    </Panel>
    {form ? <fieldset className="contents" disabled={live.updating}><QuestionnairePanel answers={answers} form={form} errorMessage={message} guideTarget="case-pretest" sectionId="case-pretest" stage="PRE"
      onChange={(sessionId, questionId, value) => { setAnswers(previous => ({ ...previous, [questionId]: value })); saver.enqueue(sessionId, questionId, value); }}
      onComplete={async current => {
        setMessage('');
        if (await live.refresh()) { setMessage('คำถามเปลี่ยนแล้ว กรุณาทบทวนฉบับใหม่ก่อนเริ่มคดี'); return false; }
        if (!(await saver.flush(current.sessionId))) { setMessage('ยังบันทึกคำตอบไม่ครบ ลองอีกครั้งเมื่อเครือข่ายพร้อม'); return false; }
        const response = await fetch(`/api/questionnaire-sessions/${current.sessionId}/complete`, { method: 'POST', credentials: 'same-origin' });
        if (!response.ok) { setMessage(response.status === 400 ? 'กรุณาตอบข้อบังคับให้ครบ เลือก “ยังไม่แน่ใจ” ได้' : 'ยังบันทึกไม่ได้ กรุณาลองอีกครั้ง'); return false; }
        saver.forget(current.sessionId); setReady(true); return true;
      }} /></fieldset> : null}
    {form ? <p role="status">{live.notice || (pendingCount ? `คำตอบค้างบันทึก ${pendingCount} ข้อ` : status === 'saved' ? 'บันทึกคำตอบแล้ว' : 'คำตอบบันทึกอัตโนมัติ')}</p> : null}
  </div>;
}
