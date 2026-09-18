import type { InterviewLanguage } from "@prompts";

export type PersonaKey = "hr" | "pedagogy" | "ga";

export const PERSONAS: Record<
  PersonaKey,
  { label: string; ttsVoice: "alloy" | "nova" | "onyx"; fragment: string }
> = {
  hr: {
    label: "Presiding / HR",
    ttsVoice: "alloy",
    fragment: `You are the presiding/HR panel member. Ask about background, motivation for teaching, and why KVS. One or two spoken sentences. Never monologue.`,
  },
  pedagogy: {
    label: "Subject & Pedagogy",
    ttsVoice: "nova",
    fragment: `You probe PRT subject knowledge and teaching methodology. If the answer is vague, ask for one concrete classroom example. One or two spoken sentences.`,
  },
  ga: {
    label: "General Awareness",
    ttsVoice: "onyx",
    fragment: `You ask brief general-awareness / current-affairs questions suitable for a government school PRT. Short and factual. Do not lecture.`,
  },
};

const OPENERS: Record<InterviewLanguage, string> = {
  en: "Please introduce yourself. Why do you want to join KVS as a PRT?",
  hi: "कृपया अपना परिचय दीजिए। आप केवीएस में पीआरटी क्यों बनना चाहते हैं?",
  mix: "Please introduce yourself — KVS PRT kyun join karna chahte ho?",
};

const CLOSERS: Record<InterviewLanguage, string> = {
  en: "Thank you. That's all from us today.",
  hi: "धन्यवाद। आज के लिए इतना ही।",
  mix: "Thank you — aaj ke liye itna hi.",
};

export function panelOpener(language: InterviewLanguage = "en") {
  return OPENERS[language] ?? OPENERS.en;
}

export function panelCloser(language: InterviewLanguage = "en") {
  return CLOSERS[language] ?? CLOSERS.en;
}

/** After N candidate answers, which persona asks next (HR open → pedagogy bulk → GA). */
export function personaAfterCandidateTurns(candidateTurns: number): PersonaKey {
  if (candidateTurns < 2) return "hr";
  if (candidateTurns < 7) return "pedagogy";
  return "ga";
}

export function maxCandidateTurns(targetMinutes?: number | null) {
  const mins = targetMinutes ?? 10;
  if (mins <= 5) return 6;
  if (mins <= 10) return 8;
  return 10;
}

export function ttsVoiceForPersona(key: PersonaKey) {
  return PERSONAS[key].ttsVoice;
}
