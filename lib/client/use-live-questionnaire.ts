"use client";
import { useEffect, useRef, useState } from "react";
import { type AnswerAutosave } from "./answer-autosave";
import { validateQuestionValue, type QuestionType } from "../server/questionnaires/validation";
export type LiveQuestion = {id:string;key:string;type:string;options:unknown;promptTh:string;required:boolean};
export type LiveForm = {id:string;key:string;sessionId:string;version:string;title:string;completed:boolean;questions:LiveQuestion[];responses:Record<string,unknown>};
export function compatibleQuestion(old:LiveQuestion,next:LiveQuestion,value:unknown) {
  return old.key===next.key && old.type===next.type && (value===null || validateQuestionValue({id:next.id,questionKey:next.key,type:next.type as QuestionType,required:next.required,optionsJson:JSON.stringify(next.options)},value).success);
}
export function useLiveQuestionnaire({forms,enabled,saver,onUpdate}:{forms:LiveForm[];enabled:boolean;saver:AnswerAutosave;onUpdate:(old:LiveForm,next:LiveForm,pending:Record<string,unknown>)=>Promise<void>|void}) {
  const latest=useRef({forms,enabled,onUpdate}); latest.current={forms,enabled,onUpdate};
  const checking=useRef(false); const [updating,setUpdating]=useState(false); const [notice,setNotice]=useState("");
  const refresh=async()=>{
    if(checking.current || !latest.current.enabled || !latest.current.forms.length || document.visibilityState==='hidden') return false;
    checking.current=true;let updated=false;
    try {
      const response=await fetch('/api/questionnaires/revisions',{cache:'no-store'});if(!response.ok) return false;
      const {revisions}=await response.json() as {revisions:Record<string,string>};
      for(const old of latest.current.forms) {
        if(!revisions[old.key] || revisions[old.key]===old.id) continue;
        setUpdating(true);
        // Flush first. If another tab already rotated, rebind the pending local copies instead.
        await saver.flush(old.sessionId);
        const changed=await fetch(`/api/questionnaire-sessions/${old.sessionId}/refresh`,{method:'POST',credentials:'same-origin'});
        if(!changed.ok) continue;
        const result=await changed.json() as {updated:boolean;form:LiveForm};
        if(!result.updated) continue;
        const pending=await saver.rebindSession(old.sessionId,result.form.sessionId,(id,value)=>{
          const source=old.questions.find(q=>q.id===id);const target=result.form.questions.find(q=>q.key===source?.key);
          return source && target && compatibleQuestion(source,target,value) ? target.id : undefined;
        });
        await latest.current.onUpdate(old,result.form,pending);updated=true;
        setNotice('แอดมินแก้ไขคำถามแล้ว อัปเดตเป็นฉบับล่าสุดให้แล้ว กรุณาทบทวนคำตอบก่อนส่ง คำตอบเดิมยังเก็บไว้ในประวัติ');
      }
    } catch { /* Retain the open form and retry after reconnect; no answers are discarded. */ }
    finally {checking.current=false;setUpdating(false);}
    return updated;
  };
  const run=useRef(refresh);run.current=refresh;
  useEffect(()=>{
    const check=()=>{void run.current();};
    const timer=setInterval(check,5000+Math.floor(Math.random()*1000));check();
    window.addEventListener('focus',check);window.addEventListener('online',check);document.addEventListener('visibilitychange',check);
    return()=>{clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check);document.removeEventListener('visibilitychange',check);};
  },[]);
  return {updating,notice,refresh};
}
