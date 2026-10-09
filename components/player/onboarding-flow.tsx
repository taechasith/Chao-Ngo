"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { compatibleQuestion, useLiveQuestionnaire, type LiveForm } from "../../lib/client/use-live-questionnaire";
import { useAnswerAutosave } from "../../lib/client/use-answer-autosave";
import { kaRouteForSubgameId } from "../../lib/ka-casefiles";
import { Panel, StatusBadge } from "./panel";
import { GameRulesBrief } from "./game-rules-brief";
import { InvestigativeAction } from "./investigative-action";

type AnswerValue = null | number | string | string[];
type SaveState = "idle" | "saving" | "saved" | "error";

type ChoiceOption = {
  label: string;
  value: string;
};

type QuestionnaireQuestion = {
  id: string;
  key: string;
  options: unknown;
  promptTh: string;
  required: boolean;
  type: "file" | "long" | "multi" | "scale" | "short" | "single";
};

type ResearchNotice = {
  aiChatPdfConsentCheckboxLabel: string;
  approvedConsentText: string;
  aiChatPdfNotice: string;
  consentVersion: string;
  controllerContactEmail: string;
  controllerName: string;
  dataCategories: readonly string[];
  dataNoticeVersion: string;
  externalServiceNotice: string;
  lastUpdated: string;
  minimumParticipantAge: number;
  purpose: string;
  recipients: string;
  retentionAndWithdrawalPolicy: string;
  rightsNotice: string;
  researchConsentCheckboxLabel: string;
  retentionYears: number;
};

type NoticeResponse = {
  collectionEnabled: boolean;
  notice: ResearchNotice;
};

type SessionResponse = {
  questionnaire: {
    id: string;
    key: string;
    questions: QuestionnaireQuestion[];
    title: string;
    version: string;
  };
  responses: Record<string, unknown>;
  sessionId: string;
  completed?: boolean;
  previousForms?: LiveForm[];
  recommendation?: Recommendation | null;
};

type Recommendation = {
  components: {
    confidenceGap: number;
    interest: number;
    problemStyle: number;
  };
  subgameId: string;
};

const questionGroupStarts = [0, 4, 6, 11];

function isChoiceOption(value: unknown): value is ChoiceOption {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { label?: unknown }).label === "string" &&
    typeof (value as { value?: unknown }).value === "string"
  );
}

function getChoiceOptions(options: unknown): ChoiceOption[] {
  return Array.isArray(options) && options.every(isChoiceOption) ? options : [];
}

function getScaleRange(options: unknown): { max: number; min: number } {
  if (
    typeof options === "object" &&
    options !== null &&
    Number.isInteger((options as { min?: unknown }).min) &&
    Number.isInteger((options as { max?: unknown }).max)
  ) {
    const { max, min } = options as { max: number; min: number };
    return { max, min };
  }

  return { max: 5, min: 1 };
}

function isAnswerValue(value: unknown): value is AnswerValue {
  return (
    typeof value === "number" ||
    (typeof value === "string" && value.trim().length > 0) ||
    (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string"))
  );
}

function isQuestionAnswered(question: QuestionnaireQuestion, answer: unknown): boolean {
  return !question.required || isAnswerValue(answer);
}

function responseMessage(status: number): string {
  if (status === 401) {
    return "กรุณาเข้าสู่ระบบอีกครั้งก่อนเริ่มแบบสอบถาม";
  }

  if (status === 503) {
    return "การเก็บข้อมูลวิจัยยังไม่เปิดใช้งาน";
  }

  return "ไม่สามารถบันทึกข้อมูลได้ในขณะนี้ กรุณาลองใหม่";
}

function subgameName(subgameId: string): string {
  if (subgameId === "subgame-ka-fintech") {
    return "คดี MAIMEE · FinTech";
  }

  if (subgameId === "subgame-ka-wa-ve" || subgameId === "subgame-ka-psychology" || subgameId === "subgame-ka-biotech") {
    return "คดี WA VE · Bio";
  }

  if (subgameId === "subgame-node-zone-quantum") {
    return "Quantum: The Correct Trajectory";
  }

  if (subgameId === "subgame-node-zone-space") {
    return "Space: Thirteen Days in Utopia";
  }

  return "เกมที่พร้อมให้เล่น";
}

export function OnboardingFlow() {
  const [noticeResponse, setNoticeResponse] = useState<NoticeResponse | null>(null);
  const [instrument, setInstrument] = useState<{id:string;key:string;title:string;version:string}|null>(null);
  const [questionNotice, setQuestionNotice] = useState<LiveForm[]>([]);
  const [questions, setQuestions] = useState<QuestionnaireQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [researchParticipation, setResearchParticipation] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const answersRef = useRef<Record<string, unknown>>({});
  const { saver, status: autosaveState, pendingCount } = useAnswerAutosave(setMessage);
  const [initializing, setInitializing] = useState(true);

  const live = useLiveQuestionnaire({forms:instrument && sessionId ? [{...instrument,sessionId,questions,completed:false,responses:answers}] : [],enabled:step>=0 && saveState!=="saving",saver,
    onUpdate:(old,next,pending)=>{
      setQuestionNotice(previous=>[...previous,{...old,responses:{...old.responses,...answersRef.current}}]);
      const initial={...next.responses,...pending}; answersRef.current=initial;sessionIdRef.current=next.sessionId;
      setInstrument(next);setSessionId(next.sessionId);setQuestions(next.questions as QuestionnaireQuestion[]);setAnswers(initial);
      setStep(current=>Math.min(current,Math.max(0,questionGroupStarts.map((start,index)=>next.questions.slice(start,questionGroupStarts[index+1])).filter(group=>group.length).length-1)));
      void saver.flush(next.sessionId);
    },
  });

  const questionGroups = useMemo(
    () =>
      questionGroupStarts
        .map((start, index) => questions.slice(start, questionGroupStarts[index + 1]))
        .filter((group) => group.length > 0),
    [questions],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/research-consent/notice", { credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error("ไม่สามารถโหลดประกาศข้อมูลส่วนบุคคลได้ในขณะนี้");
        const notice = await response.json() as NoticeResponse;
        setNoticeResponse(notice);
        if (!notice.collectionEnabled) return;
        const consentResponse = await fetch("/api/research-consent", { credentials: "same-origin", signal: controller.signal });
        if (!consentResponse.ok) throw new Error(responseMessage(consentResponse.status));
        const { consent } = await consentResponse.json() as { consent: { research_participation: number; withdrawn_at: string | null; data_notice_version: string } | null };
        if (!consent || !consent.research_participation || consent.withdrawn_at || consent.data_notice_version !== notice.notice.dataNoticeVersion) return;
        setResearchParticipation(true);
        const existing = await fetch("/api/questionnaires/pregame/sessions", { credentials: "same-origin", signal: controller.signal });
        if (!existing.ok) throw new Error(responseMessage(existing.status));
        const payload = await existing.json() as SessionResponse;
        if (!payload.sessionId) { setStep(-2); return; }
        await loadSession(payload);
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้");
      } finally { if (!controller.signal.aborted) setInitializing(false); }
    })();
    return () => controller.abort();
    // loadSession reads only the session returned by the server on mount.
  }, [saver]);

  async function loadSession(payload: SessionResponse) {
    setInstrument(payload.questionnaire);
    sessionIdRef.current = payload.sessionId;
    const restored = payload.completed ? {} : saver.restore(payload.sessionId, payload.questionnaire.questions.map(question => question.id));
    const initial = { ...payload.responses, ...restored };
    const previousForms = payload.previousForms ?? [];
    if (!payload.completed) for (const previous of previousForms) {
      saver.restore(previous.sessionId,previous.questions.map(q=>q.id));
      Object.assign(initial,await saver.rebindSession(previous.sessionId,payload.sessionId,(id,value)=>{
        const source=previous.questions.find(q=>q.id===id);
        const target=payload.questionnaire.questions.find(q=>q.key===source?.key);
        return source && target && compatibleQuestion(source,target,value) ? target.id : undefined;
      }));
    }
    setQuestionNotice(previousForms.map(form=>({...form,responses:{...form.responses,...saver.historyAnswers(form.sessionId)}})));
    answersRef.current = initial;
    setSessionId(payload.sessionId);
    setQuestions(payload.questionnaire.questions);
    setAnswers(initial);
    if (payload.completed) {
      saver.forget(payload.sessionId);
      setRecommendation(payload.recommendation ?? null);
      // Completed without a recommendation should still offer the case index, not edit a locked form.
      setStep(-3);
    } else {
      const groups = questionGroupStarts.map((start, index) => payload.questionnaire.questions.slice(start, questionGroupStarts[index + 1])).filter(group => group.length);
      const firstIncomplete = groups.findIndex(group => !group.every(question => isQuestionAnswered(question, initial[question.id])));
      setStep(firstIncomplete === -1 ? groups.length - 1 : firstIncomplete);
      void saver.flush(payload.sessionId);
    }
    setSaveState("saved");
  }

  function updateAnswer(question: QuestionnaireQuestion, value: AnswerValue) {
    const nextAnswers = { ...answersRef.current, [question.id]: value };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    setMessage(null);
    if (sessionIdRef.current) saver.enqueue(sessionIdRef.current, question.id, value);
  }

  async function flushAnswers(): Promise<boolean> {
    return sessionIdRef.current ? saver.flush(sessionIdRef.current) : false;
  }

  async function startQuestionnaire() {
    const notice = noticeResponse?.notice;

    if (!notice || !noticeResponse?.collectionEnabled || !researchParticipation) {
      setMessage("กรุณายืนยันความยินยอมเข้าร่วมการวิจัยก่อนดำเนินการต่อ");
      return;
    }

    setMessage(null);
    setSaveState("saving");

    try {
      const consentResponse = step === -2 ? null : await fetch("/api/research-consent", {
        body: JSON.stringify({
          aiChatUploadConsent: false,
          consentVersion: notice.consentVersion,
          dataNoticeVersion: notice.dataNoticeVersion,
          researchParticipation,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (consentResponse && !consentResponse.ok) {
        setSaveState("error");
        setMessage(responseMessage(consentResponse.status));
        return;
      }

      const sessionResponse = await fetch("/api/questionnaires/pregame/sessions", {
        credentials: "same-origin",
        method: "POST",
      });

      if (!sessionResponse.ok) {
        setSaveState("error");
        setMessage(responseMessage(sessionResponse.status));
        return;
      }

      const payload = (await sessionResponse.json()) as SessionResponse;
      await loadSession(payload);
    } catch {
      setSaveState("error");
      setMessage("เครือข่ายไม่เสถียร ยังไม่สามารถเริ่มแบบสอบถามได้");
    }
  }

  async function moveToNextStep() {
    const currentGroup = questionGroups[step] ?? [];

    if (!currentGroup.every((question) => isQuestionAnswered(question, answersRef.current[question.id]))) {
      setMessage("กรุณาตอบคำถามที่จำเป็นให้ครบก่อนดำเนินการต่อ");
      return;
    }

    setMessage(null);

    if (!(await flushAnswers())) {
      return;
    }

    setStep((currentStep) => currentStep + 1);
  }

  async function completeQuestionnaire() {
    if (await live.refresh()) return;
    if (!sessionId || !questions.every((question) => isQuestionAnswered(question, answersRef.current[question.id]))) {
      setMessage("กรุณาตอบคำถามที่จำเป็นให้ครบก่อนสรุปผล");
      return;
    }

    setMessage(null);

    if (!(await flushAnswers())) {
      return;
    }

    setSaveState("saving");

    try {
      const response = await fetch(`/api/questionnaire-sessions/${sessionId}/complete`, {
        credentials: "same-origin",
        method: "POST",
      });

      if (!response.ok) {
        setSaveState("error");
        setMessage(responseMessage(response.status));
        return;
      }

      const payload = (await response.json()) as { recommendation: Recommendation };
      saver.forget(sessionId);
      setRecommendation(payload.recommendation);
      setSaveState("saved");
      setStep(questionGroups.length);
    } catch {
      setSaveState("error");
      setMessage("ไม่สามารถสรุปผลได้ในขณะนี้ กรุณาลองใหม่");
    }
  }

  if (!noticeResponse || initializing) {
    return (
      <Panel className="max-w-xl" tone="quiet">
        <p role="status" className="text-sm text-white/70">{message || "กำลังเตรียมข้อมูลก่อนเริ่มเล่น…"}</p>
        {message ? <button className="player-button mt-4" onClick={() => window.location.reload()} type="button">ลองอีกครั้ง</button> : null}
      </Panel>
    );
  }

  const { collectionEnabled, notice } = noticeResponse;

  if (!collectionEnabled) {
    return (
      <div className="player-onboarding">
        <GameRulesBrief />
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>BEFORE THE CASE / STEP 01</StatusBadge>
          <h1>ก่อนเริ่ม เราอยากให้คุณรู้ว่าข้อมูลอะไรจะถูกใช้</h1>
          <p>ใช้เวลาประมาณ 2-3 นาที ก่อนเปิดแฟ้มคดีแรก</p>
        </header>
        <div className="player-onboarding-grid" data-player-reveal="primary">
          <NoticePanel notice={notice} />
          <aside className="player-decision-panel">
            <span className="player-eyebrow">YOUR DECISION</span>
            <h2>ยังเริ่มไม่ได้</h2>
            <div className="player-system-note">
              <strong>การส่งข้อมูลวิจัยยังไม่เปิด</strong>
              <p>คุณยังเปิดแฟ้มคดีที่เผยแพร่ได้ตามปกติ แต่ระบบยังไม่เปิดรับคำตอบ แบบสอบถาม และไฟล์บทสนทนา AI สำหรับงานวิจัย</p>
            </div>
            <p>คุณยังสามารถดูแฟ้มคดีที่เปิดให้สำรวจได้ โดยระบบจะไม่ส่งหรือบันทึกคำตอบวิจัยก่อนหน้านั้น</p>
            <Link className="player-button w-full" href="/play">กลับไปที่แฟ้มคดี</Link>
          </aside>
        </div>
      </div>
    );
  }

  if (recommendation) return <RecommendationResult recommendation={recommendation} />;
  if (step === -3) return <Panel><h1>บันทึกข้อมูลก่อนเริ่มเล่นแล้ว</h1><Link className="player-button mt-4" href="/play">เปิดแฟ้มคดี</Link></Panel>;
  if (step < 0) {
    return (
      <div className="player-onboarding">
        <GameRulesBrief />
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>BEFORE THE CASE / STEP 01</StatusBadge>
          <h1>ก่อนเริ่ม เราอยากให้คุณรู้ว่าข้อมูลอะไรจะถูกใช้</h1>
          <p>ใช้เวลาประมาณ 2-3 นาที ก่อนเปิดแฟ้มคดีแรก</p>
        </header>
        <div className="player-onboarding-grid" data-player-reveal="primary">
          <NoticePanel notice={notice} />
          <aside className="player-decision-panel">
            <span className="player-eyebrow">YOUR DECISION</span>
            <h2>การยินยอมของคุณ</h2>
            <p>อ่านข้อมูลในเอกสารนี้ให้ครบก่อนตัดสินใจเข้าร่วม</p>
            <div className="player-system-note">
              <strong>ก่อนเปิดแฟ้มคดี</strong>
              <p>โครงการเปิดรับผู้เข้าร่วมที่มีอายุ {notice.minimumParticipantAge} ปีขึ้นไป</p>
            </div>
            <label className="player-consent-control">
            <input
              checked={researchParticipation}
              disabled={step === -2}
              onChange={(event) => setResearchParticipation(event.target.checked)}
              type="checkbox"
            />
            <span>{notice.researchConsentCheckboxLabel}</span>
            </label>
            <FlowMessage message={message} saveState={saveState} />
            <InvestigativeAction
            className="w-full"
            disabled={!noticeResponse.collectionEnabled || !researchParticipation || saveState === "saving"}
            onClick={() => void startQuestionnaire()}
            type="button"
          >
              {step === -2 ? "ไปต่อ" : "ยินยอมและไปต่อ"}
          </InvestigativeAction>
            <Link className="player-text-action" href="/play">กลับไปที่แฟ้มคดี</Link>
          </aside>
        </div>
      </div>
    );
  }

  if (recommendation) {
    return <RecommendationResult recommendation={recommendation} />;
  }

  const currentGroup = questionGroups[step] ?? [];
  const isFinalQuestionGroup = step === questionGroups.length - 1;

  return (
    <div className="player-onboarding">
      <GameRulesBrief />
      <div className="player-page-heading flex max-w-none flex-wrap items-end justify-between gap-4" data-player-reveal="heading">
        <div>
          <StatusBadge>แบบสอบถามก่อนเล่น</StatusBadge>
          <h1 className="mt-3">ข้อมูลก่อนเริ่มคดี</h1>
        </div>
        <p className="text-sm text-white/60">ส่วนที่ {step + 1} จาก {questionGroups.length}</p>
      </div>
      <Panel data-player-reveal="primary">
        <div aria-hidden="true" className="h-px bg-white/10">
          <div className="h-px bg-[#8fc9c5] transition-[width]" style={{ width: `${((step + 1) / questionGroups.length) * 100}%` }} />
        </div>
        {live.notice ? <p role="status" className="player-system-note mt-5">{live.notice}</p> : null}
        {questionNotice.map(form=><details className="player-system-note mt-4" key={form.sessionId}><summary>คำตอบก่อนแก้ไขคำถาม · {form.version}</summary>{form.questions.map(q=><div key={q.id}><p>{q.promptTh}</p><p className="whitespace-pre-wrap">{String(form.responses[q.id] ?? "ยังไม่ได้ตอบ")}</p></div>)}</details>)}
        <fieldset disabled={live.updating} className="mt-7 space-y-8">
          {currentGroup.map((question) => (
            <QuestionField
              answer={answers[question.id]}
              key={question.id}
              onChange={(value) => updateAnswer(question, value)}
              question={question}
            />
          ))}
        </fieldset>
        <FlowMessage message={message} saveState={pendingCount ? autosaveState : saveState} />
        {pendingCount ? <button className="player-button mt-3" onClick={() => { setMessage(null); void flushAnswers(); }} type="button">บันทึกคำตอบที่ค้าง / ลองอีกครั้ง</button> : null}
        <div className="mt-8 flex flex-wrap justify-between gap-3">
          <button
            className="player-button"
            disabled={saveState === "saving" || step === 0}
            onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
            type="button"
          >
            ย้อนกลับ
          </button>
          <button
            className="player-button player-button--primary"
            disabled={saveState === "saving"}
            onClick={() => void (isFinalQuestionGroup ? completeQuestionnaire() : moveToNextStep())}
            type="button"
          >
            {isFinalQuestionGroup ? "สรุปคำตอบ" : "ดำเนินการต่อ"}
          </button>
        </div>
      </Panel>
    </div>
  );
}

function NoticePanel({ notice }: { notice: ResearchNotice }) {
  const paragraphs = notice.approvedConsentText.split("\n\n").filter(Boolean);
  const sectionTitles = ["เราศึกษาอะไร", "ข้อมูลอะไรที่จะถูกเก็บ", "อะไรที่เราไม่เก็บ", "ข้อมูลถูกเก็บไว้นานเท่าไร", "หากมีคำถาม ติดต่อใคร"];

  return (
    <article className="player-research-document">
      <span className="player-eyebrow">RESEARCH NOTICE / VERSION {notice.dataNoticeVersion}</span>
      <h2>การยินยอมเข้าร่วมการเก็บข้อมูลเพื่อการวิจัย</h2>
      {paragraphs.map((paragraph, index) => <section className="player-notice-section" key={paragraph}>
        <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div><h3>{sectionTitles[index] ?? "ข้อมูลเพิ่มเติม"}</h3><p>{paragraph}</p></div>
      </section>)}
      <footer>ปรับปรุง {notice.lastUpdated}</footer>
    </article>
  );
}

function FlowMessage({ message, saveState }: { message: string | null; saveState: SaveState }) {
  if (message) {
    return <p aria-live="polite" className="mt-5 text-sm text-red-200">{message}</p>;
  }

  if (saveState === "saving") {
    return <p aria-live="polite" className="mt-5 text-sm text-white/60">กำลังบันทึก</p>;
  }

  if (saveState === "saved") {
    return <p aria-live="polite" className="mt-5 text-sm text-cyan-100">บันทึกแล้ว</p>;
  }

  return null;
}

function QuestionField({
  answer,
  onChange,
  question,
}: {
  answer: unknown;
  onChange: (value: AnswerValue) => void;
  question: QuestionnaireQuestion;
}) {
  const choiceOptions = getChoiceOptions(question.options);
  const promptId = `onboarding-question-${question.id}`;

  if (question.type === "single") {
    return (
      <fieldset aria-labelledby={promptId} className="player-question">
        <div className="player-question-heading text-base leading-7 text-white" id={promptId}>
          <span className="player-question-prompt">{question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {choiceOptions.map((option) => (
            <label className="player-option" key={option.value}>
              <input
                checked={answer === option.value}
                className="size-4 accent-cyan-200"
                name={question.id}
                onChange={() => onChange(option.value)}
                type="radio"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  if (question.type === "multi") {
    const selectedValues = Array.isArray(answer) ? answer.filter((value): value is string => typeof value === "string") : [];

    return (
      <fieldset aria-labelledby={promptId} className="player-question">
        <div className="player-question-heading text-base leading-7 text-white" id={promptId}>
          <span className="player-question-prompt">{question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {choiceOptions.map((option) => {
            const isSelected = selectedValues.includes(option.value);
            const nextValue = isSelected
              ? selectedValues.filter((value) => value !== option.value)
              : [...selectedValues, option.value];

            return (
              <label className="player-option" key={option.value}>
                <input
                  checked={isSelected}
                  className="size-4 accent-cyan-200"
                  onChange={() => onChange(nextValue)}
                  type="checkbox"
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (question.type === "scale") {
    const { max, min } = getScaleRange(question.options);
    const values = Array.from({ length: max - min + 1 }, (_, index) => min + index);

    return (
      <fieldset aria-labelledby={promptId} className="player-question">
        <div className="player-question-heading text-base leading-7 text-white" id={promptId}>
          <span className="player-question-prompt">{question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}</span>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {values.map((value) => (
            <label className="player-scale-option" key={value}>
              <input
                aria-label={`${question.promptTh} ${value}`}
                checked={answer === value}
                className="sr-only"
                name={question.id}
                onChange={() => onChange(value)}
                type="radio"
              />
              {value}
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-white/50"><span>น้อย</span><span>มาก</span></div>
      </fieldset>
    );
  }

  return (
    <label className="player-question grid gap-3 text-base leading-7 text-white">
      <span>{question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}</span>
      <input
        className="player-input"
        maxLength={500}
        onChange={(event) => onChange(event.target.value.trim().length > 0 ? event.target.value : null)}
        required={question.required}
        type="text"
        value={typeof answer === "string" ? answer : ""}
      />
    </label>
  );
}

function RecommendationResult({ recommendation }: { recommendation: Recommendation }) {
  const kaRoute = kaRouteForSubgameId(recommendation.subgameId);
  if (kaRoute) {
    return <KaRecommendationResult recommendation={recommendation} route={kaRoute} />;
  }

  const interestPercent = Math.round(recommendation.components.interest * 100);
  const problemStylePercent = Math.round(recommendation.components.problemStyle * 100);
  const confidenceGapPercent = Math.round(recommendation.components.confidenceGap * 100);

  return (
    <div className="player-onboarding">
      <GameRulesBrief />
      <div className="player-page-heading" data-player-reveal="heading">
        <StatusBadge>ข้อเสนอแนะ</StatusBadge>
        <h1>ลองเริ่มที่ {subgameName(recommendation.subgameId)}</h1>
        <p className="max-w-prose text-base leading-7 text-white/75">
          นี่เป็นเพียงข้อเสนอแนะจากคำตอบของคุณ ไม่ใช่การวัดความสามารถหรือสติปัญญา คุณยังเลือกเล่นเกมย่อยที่เปิดให้เล่นเกมใดก็ได้
        </p>
      </div>
      <Panel data-player-reveal="primary">
        <h2 className="font-display text-2xl text-white">เหตุผลที่ใช้เสนอ</h2>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
          <li>ความสนใจในหัวข้อที่เกี่ยวข้อง: {interestPercent}%</li>
          <li>ความสอดคล้องกับรูปแบบปัญหาที่เลือก: {problemStylePercent}%</li>
          <li>พื้นที่ให้สำรวจจากความคุ้นเคยที่ประเมินตนเอง: {confidenceGapPercent}%</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <InvestigativeAction href={recommendation.subgameId === "subgame-node-zone-space" ? "/play/node-zone/space" : "/play/node-zone/quantum"}>เริ่มคดีที่แนะนำ</InvestigativeAction>
          <Link className="player-button" href="/play/node-zone">เลือกคดีอื่น</Link>
        </div>
      </Panel>
    </div>
  );
}

function KaRecommendationResult({ recommendation, route }: { recommendation: Recommendation; route: string }) {
  const interestPercent = Math.round(recommendation.components.interest * 100);
  const problemStylePercent = Math.round(recommendation.components.problemStyle * 100);
  const confidenceGapPercent = Math.round(recommendation.components.confidenceGap * 100);

  return (
    <div className="player-onboarding">
      <GameRulesBrief />
      <div className="player-page-heading" data-player-reveal="heading">
        <StatusBadge>ข้อเสนอแนะ</StatusBadge>
        <h1>ลองเริ่มที่ {subgameName(recommendation.subgameId)}</h1>
        <p className="max-w-prose text-base leading-7 text-white/75">คำแนะนำนี้สะท้อนคำตอบที่คุณให้ไว้ ไม่ใช่การวัดความสามารถ และคุณยังเลือกคดีอื่นได้เสมอ</p>
      </div>
      <Panel data-player-reveal="primary">
        <h2 className="font-display text-2xl text-white">เหตุผลที่แนะนำเส้นทางนี้</h2>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-white/75">
          <li>ความสนใจในหัวข้อที่เกี่ยวข้อง: {interestPercent}%</li>
          <li>ความสอดคล้องกับรูปแบบปัญหาที่เลือก: {problemStylePercent}%</li>
          <li>พื้นที่ให้สำรวจจากความคุ้นเคยที่ประเมินตนเอง: {confidenceGapPercent}%</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <InvestigativeAction href={route}>เริ่มคดีที่แนะนำ</InvestigativeAction>
          <Link className="player-button" href="/play/ka-casefiles">เลือกคดี NetLood City</Link>
        </div>
      </Panel>
    </div>
  );
}
