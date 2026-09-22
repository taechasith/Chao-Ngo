"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { Panel, StatusBadge } from "./panel";
import { GameRulesBrief } from "./game-rules-brief";

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
    questions: QuestionnaireQuestion[];
    title: string;
    version: string;
  };
  responses: Record<string, unknown>;
  sessionId: string;
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
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const questionGroups = useMemo(
    () =>
      questionGroupStarts
        .map((start, index) => questions.slice(start, questionGroupStarts[index + 1]))
        .filter((group) => group.length > 0),
    [questions],
  );

  useEffect(() => {
    void fetch("/api/research-consent/notice", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? (response.json() as Promise<NoticeResponse>) : null))
      .then((response) => {
        if (!response) {
          setMessage("ไม่สามารถโหลดประกาศข้อมูลส่วนบุคคลได้ในขณะนี้");
          return;
        }

        setNoticeResponse(response);
      })
      .catch(() => setMessage("ไม่สามารถเชื่อมต่อกับระบบได้ในขณะนี้"));

    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  async function saveAnswer(question: QuestionnaireQuestion, value: AnswerValue): Promise<boolean> {
    const activeSessionId = sessionIdRef.current;

    if (!activeSessionId) {
      return false;
    }

    setSaveState("saving");

    try {
      const response = await fetch(`/api/questionnaire-sessions/${activeSessionId}/responses`, {
        body: JSON.stringify({ questionId: question.id, value }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      if (!response.ok) {
        setSaveState("error");
        setMessage(responseMessage(response.status));
        return false;
      }

      setSaveState("saved");
      return true;
    } catch {
      setSaveState("error");
      setMessage("เครือข่ายไม่เสถียร ข้อมูลนี้ยังไม่ได้บันทึก");
      return false;
    }
  }

  function scheduleAutosave(question: QuestionnaireQuestion, value: AnswerValue) {
    const previousTimer = timersRef.current.get(question.id);

    if (previousTimer) {
      clearTimeout(previousTimer);
    }

    const timer = setTimeout(() => {
      timersRef.current.delete(question.id);
      void saveAnswer(question, value);
    }, 700);

    timersRef.current.set(question.id, timer);
  }

  function updateAnswer(question: QuestionnaireQuestion, value: AnswerValue) {
    const nextAnswers = { ...answersRef.current, [question.id]: value };
    answersRef.current = nextAnswers;
    setAnswers(nextAnswers);
    scheduleAutosave(question, value);
  }

  async function flushAnswers(targetQuestions: QuestionnaireQuestion[]): Promise<boolean> {
    const saves: Promise<boolean>[] = [];

    for (const question of targetQuestions) {
      const timer = timersRef.current.get(question.id);

      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(question.id);
      }

      const value = answersRef.current[question.id];

      if (value === null || isAnswerValue(value)) {
        saves.push(saveAnswer(question, value));
      }
    }

    const results = await Promise.all(saves);
    return results.every(Boolean);
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
      const consentResponse = await fetch("/api/research-consent", {
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

      if (!consentResponse.ok) {
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
      sessionIdRef.current = payload.sessionId;
      answersRef.current = payload.responses;
      setSessionId(payload.sessionId);
      setQuestions(payload.questionnaire.questions);
      setAnswers(payload.responses);
      setSaveState("saved");
      setStep(0);
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

    if (!(await flushAnswers(currentGroup))) {
      return;
    }

    setStep((currentStep) => currentStep + 1);
  }

  async function completeQuestionnaire() {
    if (!sessionId || !questions.every((question) => isQuestionAnswered(question, answersRef.current[question.id]))) {
      setMessage("กรุณาตอบคำถามที่จำเป็นให้ครบก่อนสรุปผล");
      return;
    }

    setMessage(null);

    if (!(await flushAnswers(questions))) {
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
      setRecommendation(payload.recommendation);
      setSaveState("saved");
      setStep(questionGroups.length);
    } catch {
      setSaveState("error");
      setMessage("ไม่สามารถสรุปผลได้ในขณะนี้ กรุณาลองใหม่");
    }
  }

  if (!noticeResponse) {
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
              onChange={(event) => setResearchParticipation(event.target.checked)}
              type="checkbox"
            />
            <span>{notice.researchConsentCheckboxLabel}</span>
            </label>
            <FlowMessage message={message} saveState={saveState} />
            <button
            className="player-button player-button--primary w-full"
            disabled={!noticeResponse.collectionEnabled || !researchParticipation || saveState === "saving"}
            onClick={() => void startQuestionnaire()}
            type="button"
          >
              ยินยอมและไปต่อ
          </button>
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
        <div className="mt-7 space-y-8">
          {currentGroup.map((question) => (
            <QuestionField
              answer={answers[question.id]}
              key={question.id}
              onChange={(value) => updateAnswer(question, value)}
              question={question}
            />
          ))}
        </div>
        <FlowMessage message={message} saveState={saveState} />
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

  if (question.type === "single") {
    return (
      <fieldset className="player-question">
        <legend className="text-base leading-7 text-white">
          {question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
      <fieldset className="player-question">
        <legend className="text-base leading-7 text-white">
          {question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}
        </legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
      <fieldset className="player-question">
        <legend className="text-base leading-7 text-white">
          {question.promptTh}{question.required ? <span className="ml-1 text-cyan-100">*</span> : null}
        </legend>
        <div className="mt-3 grid grid-cols-5 gap-2">
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
          <Link className="player-button player-button--primary" href={recommendation.subgameId === "subgame-node-zone-space" ? "/play/node-zone/space" : "/play/node-zone/quantum"}>เปิดแฟ้มที่แนะนำ</Link>
          <Link className="player-button" href="/play/node-zone">เลือกคดีอื่น</Link>
        </div>
      </Panel>
    </div>
  );
}
