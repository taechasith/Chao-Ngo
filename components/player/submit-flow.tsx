"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { aiChatUploadConsentVersion } from "../../lib/server/research-consent-copy";
import { InvestigativeAction } from "./investigative-action";
import { Panel, StatusBadge } from "./panel";

type FormQuestion = {
  id: string;
  key: string;
  options: unknown;
  promptTh: string;
  required: boolean;
  type: string;
};

type QuestionForm = {
  completed: boolean;
  questions: FormQuestion[];
  responses: Record<string, unknown>;
  sessionId: string;
  title: string;
};

type UploadSummary = { bytes: number; id: string; original_name: string; status: string };
type UploadKind = "ai_chat_pdf" | "answer_attachment";
type SelectedFile = { bytes: number; name: string };

type SubmissionRequirements = {
  allowedAnswerAttachmentExtensions: string[];
  instrumentVersion: string;
  maxAnswerAttachmentBytes: number;
  requiredAnswerQuestionKeys: string[];
  requiresAiChatPdf: boolean;
  requiresAnswerTextOrAttachment: boolean;
  requiresPosttest: boolean;
};

type SubmissionPayload = {
  acknowledgement: { acknowledged_at: string } | null;
  answerForm: QuestionForm | null;
  posttestForm: QuestionForm | null;
  requirements: SubmissionRequirements;
  status: string;
  submissionId: string;
  upload: UploadSummary | null;
  uploads: {
    aiChatPdf: UploadSummary | null;
    answerAttachment: UploadSummary | null;
  };
};

type Choice = { label: string; value: string };
type UploadResponse = {
  code?: string;
  upload?: { bytes: number; id: string; kind?: UploadKind; name: string; status: string };
};

type SubmissionCase = {
  id: string;
  eyebrow: string;
  route: string;
  subtitle: string;
  title: string;
};

const maximumPdfBytes = 20 * 1024 * 1024;
const selectableCases: SubmissionCase[] = [
  {
    eyebrow: "NODE ZONE / CASE",
    id: "subgame-node-zone-quantum",
    route: "/play/node-zone/quantum",
    subtitle: "THE CORRECT TRAJECTORY",
    title: "คดีควอนตัม",
  },
  {
    eyebrow: "NODE ZONE / CASE",
    id: "subgame-node-zone-space",
    route: "/play/node-zone/space",
    subtitle: "THIRTEEN DAYS IN UTOPIA",
    title: "คดีอวกาศ",
  },
  {
    eyebrow: "K.A. CASEFILES / NETLOOD CITY",
    id: "subgame-ka-fintech",
    route: "/play/ka-casefiles/maimee",
    subtitle: "FinTech",
    title: "คดี MAIMEE",
  },
  {
    eyebrow: "K.A. CASEFILES / NETLOOD CITY",
    id: "subgame-ka-wa-ve",
    route: "/play/ka-casefiles/wa-ve",
    subtitle: "Bio",
    title: "คดี WA VE",
  },
];

function caseForSubgameId(subgameId: string): SubmissionCase {
  return selectableCases.find((item) => item.id === subgameId) ?? {
    eyebrow: "SUBMISSION / CASE",
    id: subgameId,
    route: "/play",
    subtitle: "",
    title: "แฟ้มคดี",
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function choices(value: unknown): Choice[] {
  return Array.isArray(value) ? value.filter((item): item is Choice =>
    typeof item === "object" && item !== null &&
    typeof (item as Choice).label === "string" && typeof (item as Choice).value === "string",
  ) : [];
}

function thaiError(code: string): string {
  const messages: Record<string, string> = {
    ACKNOWLEDGEMENT_REQUIRED: "กรุณายืนยันเงื่อนไขการใช้ไฟล์ PDF ก่อนอัปโหลด",
    ANSWER_ATTACHMENT_NOT_ALLOWED: "แฟ้มคดีนี้ไม่รับไฟล์แนบคำตอบ",
    ANSWER_ATTACHMENT_REQUIRED: "กรุณาเลือกไฟล์คำตอบ",
    ANSWER_ATTACHMENT_SIZE_INVALID: "ไฟล์คำตอบต้องมีขนาดไม่เกินที่คดีกำหนด",
    ANSWER_ATTACHMENT_TYPE_INVALID: "ไฟล์คำตอบต้องเป็น TXT, DOCX, PDF, PPTX, PNG, JPG หรือ JPEG ที่ตรวจสอบได้",
    ANSWER_TEXT_OR_ATTACHMENT_REQUIRED: "กรุณากรอกคำตอบในระบบให้ครบ หรือแนบไฟล์คำตอบหนึ่งรายการ",
    PDF_SIGNATURE_INVALID: "ไฟล์นี้ไม่ใช่ PDF ที่อ่านได้",
    PDF_SIZE_INVALID: "ไฟล์ PDF ต้องมีขนาดไม่เกิน 20 MB",
    PDF_TYPE_INVALID: "กรุณาเลือกไฟล์ PDF เท่านั้น",
    PRIVATE_STORAGE_UNAVAILABLE: "พื้นที่จัดเก็บไฟล์ส่วนตัวยังไม่พร้อมใช้งาน",
    RESEARCH_CONSENT_REQUIRED: "กรุณาให้ความยินยอมการวิจัยก่อนดำเนินการ",
    RESEARCH_DATA_EXPIRED: "ข้อมูลวิจัยของบัญชีนี้ไม่พร้อมใช้งานแล้ว",
    REQUEST_RATE_LIMITED: "คุณลองดำเนินการหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
    SUBMISSION_CHANGED: "สถานะการส่งคำตอบเปลี่ยนไป กรุณารีเฟรชหน้าแล้วลองใหม่",
    UNAUTHENTICATED: "เข้าสู่ระบบก่อนส่งคำตอบ",
    UPLOAD_KIND_INVALID: "ชนิดไฟล์ที่ส่งไม่ถูกต้อง",
    UPLOAD_LIMIT_REACHED: "มีไฟล์ประเภทนี้แนบไว้แล้ว",
  };
  return messages[code] ?? "ดำเนินการไม่สำเร็จ ตรวจสอบข้อมูลแล้วลองอีกครั้ง";
}

function attachmentAccept(extensions: string[]): string {
  return extensions.map((extension) => `.${extension}`).join(",");
}

function uploadName(upload: UploadSummary | SelectedFile | null | undefined): string {
  if (!upload) return "";
  return "original_name" in upload ? upload.original_name : upload.name;
}

export function SubmitFlow({ initialSubgameId = "" }: { initialSubgameId?: string }) {
  const [subgameId, setSubgameId] = useState(initialSubgameId);
  const [submission, setSubmission] = useState<SubmissionPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgementPending, setAcknowledgementPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Partial<Record<UploadKind, SelectedFile>>>({});
  const [saving, setSaving] = useState(false);
  const [aiPdfNotice, setAiPdfNotice] = useState("");
  const [researchReady, setResearchReady] = useState<boolean | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const completedSessions = useRef(new Set<string>());
  const answersRef = useRef<Record<string, unknown>>({});
  const submissionRef = useRef<SubmissionPayload | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    submissionRef.current = submission;
  }, [submission]);

  const startDraft = useCallback(async (selectedSubgameId: string) => {
    setSubgameId(selectedSubgameId);
    setLoading(true);
    setMessage("");
    setSelectedFiles({});
    completedSessions.current.clear();
    try {
      const response = await fetch("/api/submissions", {
        body: JSON.stringify({ subgameId: selectedSubgameId }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = await response.json() as { code?: string; submission?: SubmissionPayload };
      if (!response.ok || !result.submission) {
        setMessage(thaiError(result.code ?? (response.status === 401 ? "UNAUTHENTICATED" : "")));
        return;
      }
      setSubmission(result.submission);
      setAcknowledged(Boolean(result.submission.acknowledgement));
      const initial = {
        ...(result.submission.answerForm?.responses ?? {}),
        ...(result.submission.posttestForm?.responses ?? {}),
      };
      answersRef.current = initial;
      setAnswers(initial);
    } catch {
      setMessage("เชื่อมต่อระบบไม่ได้ ลองอีกครั้งเมื่อเครือข่ายพร้อม");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/research-consent/notice", { credentials: "same-origin" })
      .then(async (response) => response.ok
        ? await response.json() as {
            collectionEnabled?: boolean;
            notice?: { aiChatPdfConsentCheckboxLabel?: string };
          }
        : null)
      .then((payload) => {
        setResearchReady(Boolean(payload?.collectionEnabled));
        if (payload?.notice?.aiChatPdfConsentCheckboxLabel) setAiPdfNotice(payload.notice.aiChatPdfConsentCheckboxLabel);
      })
      .catch(() => setResearchReady(false));
  }, []);

  useEffect(() => {
    if (researchReady && initialSubgameId) void startDraft(initialSubgameId);
  }, [initialSubgameId, researchReady, startDraft]);

  useEffect(() => () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
  }, []);

  async function saveAnswer(sessionId: string, questionId: string, value: unknown): Promise<boolean> {
    try {
      const response = await fetch(`/api/questionnaire-sessions/${sessionId}/responses`, {
        body: JSON.stringify({ questionId, value }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { code?: string };
        setMessage(thaiError(result.code ?? ""));
      }
      return response.ok;
    } catch {
      setMessage("เครือข่ายขัดข้อง คำตอบนี้ยังไม่ได้บันทึก กรุณาลองใหม่");
      return false;
    }
  }

  function changeAnswer(sessionId: string, questionId: string, value: unknown) {
    const next = { ...answersRef.current, [questionId]: value };
    answersRef.current = next;
    setAnswers(next);
    const key = `${sessionId}:${questionId}`;
    const prior = timers.current.get(key);
    if (prior) clearTimeout(prior);
    timers.current.set(key, setTimeout(() => {
      timers.current.delete(key);
      void saveAnswer(sessionId, questionId, value);
    }, 600));
  }

  async function completeForm(form: QuestionForm | null, requiredQuestionKeys: string[] = []): Promise<boolean> {
    if (!form || form.completed || completedSessions.current.has(form.sessionId)) return true;
    const missingText = form.questions.some((question) => {
      if (!requiredQuestionKeys.includes(question.key)) return false;
      const value = answersRef.current[question.id];
      return typeof value !== "string" || !value.trim();
    });
    if (missingText) {
      setMessage("กรุณากรอกคำตอบในระบบให้ครบ หรือเลือกส่งไฟล์คำตอบแทน");
      return false;
    }
    for (const question of form.questions) {
      const value = answersRef.current[question.id];
      if (timers.current.has(`${form.sessionId}:${question.id}`)) {
        clearTimeout(timers.current.get(`${form.sessionId}:${question.id}`));
        timers.current.delete(`${form.sessionId}:${question.id}`);
      }
      if (value !== undefined && !(await saveAnswer(form.sessionId, question.id, value))) return false;
    }
    const response = await fetch(`/api/questionnaire-sessions/${form.sessionId}/complete`, {
      credentials: "same-origin",
      method: "POST",
    });
    if (!response.ok) {
      setMessage("ตอบคำถามที่จำเป็นให้ครบก่อนดำเนินการต่อ");
      return false;
    }
    completedSessions.current.add(form.sessionId);
    return true;
  }

  async function updateAcknowledgement(next: boolean) {
    const current = submissionRef.current;
    if (!current || acknowledgementPending || !current.requirements.requiresAiChatPdf) return;
    setAcknowledgementPending(true);
    try {
      const response = await fetch(`/api/submissions/${current.submissionId}/acknowledgement`, {
        body: next ? JSON.stringify({ acknowledged: true, consentVersion: aiChatUploadConsentVersion }) : undefined,
        credentials: "same-origin",
        headers: next ? { "Content-Type": "application/json" } : undefined,
        method: next ? "POST" : "DELETE",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { code?: string };
        setMessage(thaiError(result.code ?? ""));
        return;
      }
      setAcknowledged(next);
      setSubmission((value) => value ? {
        ...value,
        acknowledgement: next ? { acknowledged_at: new Date().toISOString() } : null,
      } : value);
    } catch {
      setMessage("บันทึกการยืนยันไม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      setAcknowledgementPending(false);
    }
  }

  async function uploadFile(kind: UploadKind, file?: File) {
    const current = submissionRef.current;
    if (!current || !file) return;
    const maximumBytes = kind === "ai_chat_pdf" ? maximumPdfBytes : current.requirements.maxAnswerAttachmentBytes;
    if (file.size > maximumBytes) {
      setMessage(thaiError(kind === "ai_chat_pdf" ? "PDF_SIZE_INVALID" : "ANSWER_ATTACHMENT_SIZE_INVALID"));
      return;
    }
    setSelectedFiles((value) => ({ ...value, [kind]: { bytes: file.size, name: file.name } }));
    setUploading(true);
    setUploadProgress(0);
    setMessage("");
    const form = new FormData();
    form.set("file", file);
    form.set("kind", kind);
    try {
      const result = await new Promise<{ body: UploadResponse; ok: boolean }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", `/api/submissions/${current.submissionId}/uploads`);
        request.responseType = "json";
        request.withCredentials = true;
        request.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        });
        request.addEventListener("error", () => reject(new Error("UPLOAD_NETWORK_ERROR")));
        request.addEventListener("load", () => {
          const body = typeof request.response === "object" && request.response
            ? request.response as UploadResponse
            : {};
          resolve({ body, ok: request.status >= 200 && request.status < 300 });
        });
        request.send(form);
      });
      if (!result.ok || !result.body.upload) {
        setSelectedFiles((value) => {
          const next = { ...value };
          delete next[kind];
          return next;
        });
        setMessage(thaiError(result.body.code ?? ""));
        return;
      }
      const uploaded: UploadSummary = {
        bytes: result.body.upload.bytes,
        id: result.body.upload.id,
        original_name: result.body.upload.name,
        status: result.body.upload.status,
      };
      setSubmission((value) => {
        if (!value) return value;
        return kind === "ai_chat_pdf"
          ? { ...value, upload: uploaded, uploads: { ...value.uploads, aiChatPdf: uploaded } }
          : { ...value, uploads: { ...value.uploads, answerAttachment: uploaded } };
      });
      setSelectedFiles((value) => ({
        ...value,
        [kind]: { bytes: result.body.upload!.bytes, name: result.body.upload!.name },
      }));
      setUploadProgress(100);
    } catch {
      setSelectedFiles((value) => {
        const next = { ...value };
        delete next[kind];
        return next;
      });
      setMessage("อัปโหลดไม่สำเร็จ ตรวจสอบเครือข่ายแล้วลองใหม่");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function finalize() {
    const current = submissionRef.current;
    if (!current) return;
    setSaving(true);
    setMessage("");
    try {
      const hasAnswerAttachment = Boolean(current.uploads.answerAttachment);
      if (
        current.requirements.requiresAnswerTextOrAttachment &&
        !hasAnswerAttachment &&
        !(await completeForm(current.answerForm, current.requirements.requiredAnswerQuestionKeys))
      ) return;
      if (current.requirements.requiresPosttest && !(await completeForm(current.posttestForm))) return;
      const response = await fetch(`/api/submissions/${current.submissionId}/finalize`, {
        credentials: "same-origin",
        method: "POST",
      });
      const result = await response.json() as { code?: string; status?: string };
      if (!response.ok) {
        setMessage(thaiError(result.code ?? ""));
        return;
      }
      setSubmission((value) => value ? { ...value, status: "submitted" } : value);
      setMessage("ส่งคำตอบแล้ว ระบบบันทึกความคืบหน้าของคุณเรียบร้อย");
    } catch {
      setMessage("ส่งคำตอบไม่ได้ในขณะนี้ ลองอีกครั้งเมื่อเครือข่ายพร้อม");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Panel><p role="status">กำลังเปิดแฟ้มส่งคำตอบ…</p></Panel>;

  if (researchReady === null) return <Panel><p role="status">กำลังตรวจสอบสถานะการส่งคำตอบ…</p></Panel>;

  if (!researchReady) {
    return (
      <section className="player-submit-locked" data-player-reveal="primary">
        <article className="player-locked-dossier">
          <StatusBadge>SUBMISSION / LOCKED</StatusBadge>
          <h1>ยังส่งคำตอบไม่ได้</h1>
          <p>ระบบรับคำตอบของงานวิจัยกำลังเตรียมเปิดใช้งาน</p>
          <div className="player-locked-reason">
            <strong>สิ่งที่กำลังรอ</strong>
            <p>การส่งคำตอบจะเปิดเมื่อการตั้งค่าฝั่งงานวิจัยและสิทธิ์เข้าร่วมพร้อม</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="player-button player-button--primary" href="/play">กลับไปที่แฟ้มคดี</Link>
            <Link className="player-button" href="/profile">ดูความคืบหน้า</Link>
          </div>
        </article>
        <aside className="player-locked-rail" aria-label="ลำดับเมื่อระบบพร้อม">
          <span><b>01</b>เลือกคดี</span>
          <span><b>02</b>สำรวจหลักฐาน</span>
          <span><b>03</b>ส่งคำตอบตามเงื่อนไขของคดี</span>
        </aside>
      </section>
    );
  }

  if (!submission) {
    return (
      <div className="player-content">
        <header className="player-page-heading" data-player-reveal="heading">
          <StatusBadge>ส่งคำตอบ / CASEFILE</StatusBadge>
          <h1 className="font-display text-3xl text-white sm:text-4xl">เมื่อคุณคิดว่ารู้คำตอบแล้ว</h1>
          <p className="max-w-2xl text-sm leading-6 text-white/70">เลือกคดีที่ทำเสร็จแล้ว จากนั้นส่งคำตอบตามเงื่อนไขของแฟ้มคดีนั้น</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2" data-guide="submit-case" data-player-reveal="primary">
          {selectableCases.map((item) => (
            <button className="player-choice" key={item.id} onClick={() => void startDraft(item.id)} type="button">
              <span className="player-eyebrow">{item.eyebrow}</span>
              <span className="font-display text-2xl text-white">{item.title}</span>
              <span className="text-xs text-white/55">{item.subtitle}</span>
            </button>
          ))}
        </div>
        {message ? <p aria-live="polite" className="text-sm text-red-200">{message} <Link className="underline" href="/login">เข้าสู่ระบบ</Link></p> : null}
      </div>
    );
  }

  if (submission.status === "submitted" || submission.status === "accepted") {
    return <Panel><StatusBadge>ส่งแล้ว</StatusBadge><h1 className="mt-4 font-display text-3xl text-white">คำตอบของคุณถูกบันทึกแล้ว</h1><p className="mt-3 text-sm leading-6 text-white/70">กลับไปดูความคืบหน้าได้ที่ <Link className="underline" href="/profile">โปรไฟล์</Link></p></Panel>;
  }

  const activeCase = caseForSubgameId(subgameId);
  const answerAttachmentAllowed = submission.requirements.requiresAnswerTextOrAttachment &&
    submission.requirements.allowedAnswerAttachmentExtensions.length > 0;
  const stages = [
    { href: "#submission-stage-case", label: "คดีที่กำลังส่ง" },
    ...(submission.answerForm ? [{ href: "#submission-stage-answer", label: "คำตอบ" }] : []),
    ...(answerAttachmentAllowed ? [{ href: "#submission-stage-answer-attachment", label: "ไฟล์คำตอบ" }] : []),
    ...(submission.posttestForm && submission.requirements.requiresPosttest ? [{ href: "#submission-stage-posttest", label: "post-test" }] : []),
    ...(submission.requirements.requiresAiChatPdf ? [{ href: "#submission-stage-ai-pdf", label: "AI chat PDF" }] : []),
    { href: "#submission-stage-final", label: "ตรวจสอบและส่ง" },
  ];
  const answerAttachment = selectedFiles.answer_attachment ?? submission.uploads.answerAttachment;
  const aiChatPdf = selectedFiles.ai_chat_pdf ?? submission.uploads.aiChatPdf;
  const finalRequiresAi = submission.requirements.requiresAiChatPdf;

  return (
    <div className="player-content">
      <header className="player-page-heading" data-player-reveal="heading">
        <StatusBadge>SUBMISSION / READY</StatusBadge>
        <h1>เมื่อคุณคิดว่ารู้คำตอบแล้ว</h1>
        <p className="text-sm text-white/65">แบบร่างบันทึกอัตโนมัติเมื่อคุณเปลี่ยนคำตอบ</p>
      </header>
      <nav aria-label="ส่วนของแฟ้มส่งคำตอบ" className="player-form-stages">
        {stages.map((stage, index) => <a href={stage.href} key={stage.href}><span>{String(index + 1).padStart(2, "0")}</span>{stage.label}</a>)}
      </nav>
      <section className="player-submission-case" id="submission-stage-case">
        <div><span className="player-eyebrow">01 / {activeCase.eyebrow}</span><h2>{activeCase.title}</h2></div>
        <Link className="player-text-action" href={activeCase.route}>กลับไปเปิดหลักฐาน</Link>
      </section>
      {submission.answerForm ? (
        <QuestionnairePanel
          answers={answers}
          form={submission.answerForm}
          guideTarget="submit-answer"
          key={submission.answerForm.sessionId}
          onChange={changeAnswer}
          onComplete={completeForm}
          requiredQuestionKeys={submission.requirements.requiredAnswerQuestionKeys}
          sectionId="submission-stage-answer"
          stage="02"
        />
      ) : null}
      {answerAttachmentAllowed ? (
        <Panel data-guide="submit-answer-attachment" id="submission-stage-answer-attachment">
          <span className="player-eyebrow">FILE / ANSWER ATTACHMENT</span>
          <h2 className="mt-2 font-display text-2xl text-white">ส่งคำตอบเป็นไฟล์</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">เลือกส่งคำตอบที่กรอกในระบบ หรือแนบไฟล์หนึ่งรายการแทนกันได้ ไฟล์จะเก็บในพื้นที่ส่วนตัวและไม่แสดงผ่านคลังสาธารณะ</p>
          <label className="mt-5 grid gap-2 text-sm text-white/80">
            <span>{answerAttachment ? "มีไฟล์คำตอบแนบแล้ว" : `อนุญาต: ${submission.requirements.allowedAnswerAttachmentExtensions.map((extension) => extension.toUpperCase()).join(", ")}`}</span>
            <input accept={attachmentAccept(submission.requirements.allowedAnswerAttachmentExtensions)} aria-describedby="answer-attachment-state" className="min-h-12 max-w-full border border-white/20 bg-black p-2 text-sm file:mr-3 file:min-h-9 file:border-0 file:bg-white/10 file:px-3 file:text-white" disabled={uploading || Boolean(submission.uploads.answerAttachment)} onChange={(event) => void uploadFile("answer_attachment", event.currentTarget.files?.[0])} type="file" />
          </label>
          <p className="mt-3 text-sm text-white/65" id="answer-attachment-state" role="status">
            {uploading
              ? `กำลังอัปโหลดไปยังพื้นที่ส่วนตัว${uploadProgress === null ? "" : ` ${uploadProgress}%`}`
              : answerAttachment
                ? `แนบแล้ว: ${uploadName(answerAttachment)} (${formatFileSize(answerAttachment.bytes)})`
                : `ยังไม่ได้แนบไฟล์คำตอบ (ไม่เกิน ${formatFileSize(submission.requirements.maxAnswerAttachmentBytes)})`}
          </p>
        </Panel>
      ) : null}
      {submission.posttestForm && submission.requirements.requiresPosttest ? (
        <QuestionnairePanel
          answers={answers}
          form={submission.posttestForm}
          guideTarget="submit-posttest"
          key={submission.posttestForm.sessionId}
          onChange={changeAnswer}
          onComplete={completeForm}
          sectionId="submission-stage-posttest"
          stage="03"
        />
      ) : null}
      {submission.requirements.requiresAiChatPdf ? (
        <Panel data-guide="submit-ai-pdf" id="submission-stage-ai-pdf">
          <span className="player-eyebrow">AI CHAT PDF</span>
          <h2 className="mt-2 font-display text-2xl text-white">ไฟล์ PDF บทสนทนากับ AI</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">ไฟล์จะถูกเก็บในพื้นที่ส่วนตัวเพื่อวิเคราะห์งานวิจัยเท่านั้น จำกัดขนาดไม่เกิน 20 MB และไม่แสดงผ่านคลังไฟล์สาธารณะ</p>
          <figure className="mt-5 max-w-sm border border-white/15 bg-black/25 p-2">
            <img alt="ตัวอย่างการบันทึกบทสนทนา AI เป็น PDF" className="aspect-[16/9] w-full object-cover object-top" src="/ai-chat-pdf-instructions.png" />
            <figcaption className="px-1 pt-2 text-xs leading-5 text-white/55">บันทึกบทสนทนากับ AI เป็น PDF แล้วเลือกไฟล์นั้นด้านล่าง</figcaption>
          </figure>
          <label className="mt-5 flex min-h-12 items-start gap-3 border border-white/15 p-3 text-sm leading-6 text-white/80">
            <input checked={acknowledged} className="mt-1 size-4 accent-cyan-200" disabled={acknowledgementPending} onChange={(event) => void updateAcknowledgement(event.target.checked)} type="checkbox" />
            <span>{aiPdfNotice || "ฉันเข้าใจว่าในการส่งคำตอบ ระบบจะขอให้ฉันอัปโหลดไฟล์ PDF บทสนทนากับ AI เพื่อใช้ในงานวิจัย และไฟล์ดังกล่าวจะถูกจัดเก็บในพื้นที่ส่วนตัว"}</span>
          </label>
          {acknowledgementPending ? <p className="mt-3 text-sm text-white/65" role="status">กำลังบันทึกการยืนยัน…</p> : null}
          <label className="mt-5 grid gap-2 text-sm text-white/80">
            <span>{aiChatPdf ? "มีไฟล์ PDF แนบแล้ว" : "เลือกไฟล์ PDF"}</span>
            <input accept="application/pdf,.pdf" aria-describedby="pdf-upload-state" className="min-h-12 max-w-full border border-white/20 bg-black p-2 text-sm file:mr-3 file:min-h-9 file:border-0 file:bg-white/10 file:px-3 file:text-white" disabled={!acknowledged || uploading || acknowledgementPending} onChange={(event) => void uploadFile("ai_chat_pdf", event.currentTarget.files?.[0])} type="file" />
          </label>
          <p className="mt-3 text-sm text-white/65" id="pdf-upload-state" role="status">
            {uploading
              ? `กำลังอัปโหลดไปยังพื้นที่ส่วนตัว${uploadProgress === null ? "" : ` ${uploadProgress}%`}`
              : aiChatPdf
                ? `แนบแล้ว: ${uploadName(aiChatPdf)} (${formatFileSize(aiChatPdf.bytes)})`
                : "ยังไม่ได้เลือกไฟล์ PDF"}
          </p>
        </Panel>
      ) : null}
      <section className="player-submission-review" data-guide="submit-final" id="submission-stage-final">
        <span className="player-eyebrow">FINAL / ตรวจสอบและส่ง</span>
        <h2>พร้อมยืนยันสิ่งที่คุณคิดแล้วหรือยัง?</h2>
        <p>{finalRequiresAi
          ? "ตรวจคำตอบและ post-test ให้ครบ พร้อมแนบไฟล์ PDF บทสนทนากับ AI"
          : "กรอกคำตอบในระบบให้ครบ หรือแนบไฟล์คำตอบหนึ่งรายการ แล้วส่งคำตอบได้ทันที"}</p>
        {answerAttachmentAllowed ? <p className="player-upload-state" role="status">{submission.uploads.answerAttachment ? `ไฟล์คำตอบ: ${submission.uploads.answerAttachment.original_name}` : "ยังไม่ได้แนบไฟล์คำตอบ (กรอกคำตอบในระบบแทนได้)"}</p> : null}
        {finalRequiresAi ? <p className="player-upload-state" role="status">{submission.uploads.aiChatPdf ? `ไฟล์ AI chat PDF: ${submission.uploads.aiChatPdf.original_name}` : "ยังไม่ได้แนบไฟล์ PDF"}</p> : null}
        {message ? <p aria-live="polite" className="mt-4 text-sm text-red-200">{message}</p> : null}
        <InvestigativeAction className="mt-6 w-full sm:w-auto" disabled={saving || uploading || acknowledgementPending || (finalRequiresAi && (!acknowledged || !submission.uploads.aiChatPdf))} onClick={() => void finalize()}>
          {saving ? "กำลังส่งคำตอบ…" : "ส่งคำตอบ"}
        </InvestigativeAction>
        <p className="mt-3 text-xs leading-5 text-white/50">ยังไม่มั่นใจ? กลับไปเปิดหลักฐานได้ทุกเมื่อ</p>
      </section>
    </div>
  );
}

function QuestionnairePanel({
  answers,
  form,
  guideTarget,
  onChange,
  onComplete,
  requiredQuestionKeys = [],
  sectionId,
  stage,
}: {
  answers: Record<string, unknown>;
  form: QuestionForm;
  guideTarget: string;
  onChange: (sessionId: string, questionId: string, value: unknown) => void;
  onComplete: (form: QuestionForm, requiredQuestionKeys?: string[]) => Promise<boolean>;
  requiredQuestionKeys?: string[];
  sectionId: string;
  stage: string;
}) {
  const [complete, setComplete] = useState(form.completed);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  return (
    <Panel data-guide={guideTarget} id={sectionId}>
      <span className="player-eyebrow">{stage} / {stage === "02" ? "คำตอบของคุณ" : "POST-TEST"}</span>
      <h2 className="mt-2 font-display text-2xl">{form.title}</h2>
      <div className="mt-5 grid gap-6">
        {form.questions.map((question) => {
          const required = question.required || requiredQuestionKeys.includes(question.key);
          return (
            <fieldset className="player-question text-sm leading-6 text-white/85" disabled={complete} key={question.id}>
              <legend>{question.promptTh}{required ? <span className="ml-1 text-orange-200">*</span> : null}</legend>
              {question.type === "scale" ? (
                <span className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 5 }, (_, index) => index + 1).map((value) => (
                    <label className="player-scale-option" key={value}>
                      <input aria-label={`${question.promptTh}: ${value}`} checked={answers[question.id] === value} className="sr-only" name={question.id} onChange={() => onChange(form.sessionId, question.id, value)} type="radio" />{value}
                    </label>
                  ))}
                </span>
              ) : question.type === "single" ? (
                <select aria-label={question.promptTh} className="player-input" name={question.id} value={typeof answers[question.id] === "string" ? String(answers[question.id]) : ""} onChange={(event) => onChange(form.sessionId, question.id, event.currentTarget.value)}>
                  <option value="">เลือกคำตอบ</option>
                  {choices(question.options).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : question.type === "multi" ? (
                <span className="grid gap-2">
                  {choices(question.options).map((option) => {
                    const selected = Array.isArray(answers[question.id]) ? answers[question.id] as string[] : [];
                    return <label className="player-option" key={option.value}><input checked={selected.includes(option.value)} name={question.id} onChange={(event) => onChange(form.sessionId, question.id, event.target.checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))} type="checkbox" /><span>{option.label}</span></label>;
                  })}
                </span>
              ) : question.type === "short" ? (
                <input aria-label={question.promptTh} className="player-input" name={question.id} maxLength={500} value={typeof answers[question.id] === "string" ? String(answers[question.id]) : ""} onChange={(event) => onChange(form.sessionId, question.id, event.currentTarget.value)} />
              ) : (
                <textarea aria-label={question.promptTh} className="player-input min-h-32 resize-y leading-6" name={question.id} maxLength={4000} value={typeof answers[question.id] === "string" ? String(answers[question.id]) : ""} onChange={(event) => onChange(form.sessionId, question.id, event.currentTarget.value)} />
              )}
            </fieldset>
          );
        })}
      </div>
      {saveError ? <p className="mt-4 text-sm text-red-200" role="alert">ยังบันทึกส่วนนี้ไม่ได้ ตรวจคำตอบที่จำเป็นและการเชื่อมต่อ แล้วลองอีกครั้ง</p> : null}
      <button className="player-button mt-6 w-full sm:w-auto" disabled={saving || complete} onClick={async () => {
        setSaving(true);
        setSaveError(false);
        try { const ok = await onComplete(form, requiredQuestionKeys); setComplete(ok); setSaveError(!ok); }
        catch { setSaveError(true); }
        finally { setSaving(false); }
      }} type="button">
        {complete ? "บันทึกแล้ว" : saving ? "กำลังบันทึก…" : "บันทึกแบบสอบถาม"}
      </button>
    </Panel>
  );
}
