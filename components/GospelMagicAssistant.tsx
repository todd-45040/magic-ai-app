import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { createShow, addTasksToShow } from '../services/showsService';
import { GOSPEL_MAGIC_SYSTEM_INSTRUCTION } from '../constants';
import { WandIcon, SaveIcon, CheckIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';

interface GospelMagicAssistantProps {
  onIdeaSaved: () => void;
  onOpenShowPlanner?: (showId?: string | null, taskId?: string | null) => void;
  onOpenLiveRehearsal?: () => void;
}

type MinistryTone =
  | "Children's Church"
  | 'Youth Ministry'
  | 'Sunday Service'
  | 'Outreach / Evangelism'
  | 'Hospital / Pastoral Care'
  | 'VBS / Camp Setting';

interface MinistryBlueprint {
  scripture_focus: string;
  theological_theme: string;
  central_truth: string;
  routine_structure: Array<{
    title: string;
    stage_action: string;
    illustration: string;
    teaching_point: string;
    suggested_lines?: string[];
    notes?: string;
  }>;
  illustration_bridge: string;
  emotional_arc: string[];
  pastoral_tone_guidance: string;
  altar_call_sensitivity: {
    guidance: string;
    do: string[];
    dont: string[];
  };
  age_adjustments: Array<{
    audience: string;
    adjustments: string[];
  }>;
  potential_misinterpretations: string[];
  closing_prayer_option: string;

  audience_reaction_model?: {
    gasps_likelihood_1_to_10: number;
    skeptic_resistance_probability_0_to_1: number;
    confusion_risk_0_to_1: number;
    memory_distortion_strength_1_to_10: number;
    notes?: string;
  };
}

interface LayeredDiagramProps {
  compact?: boolean;
}

/**
 * A calm, structured visualizer to communicate “engineered layering”
 * without flashy effects.
 */
const PsychologicalLayerVisualizer: React.FC<LayeredDiagramProps> = ({ compact }) => (
  <div className={`rounded-xl border border-slate-800 bg-slate-950/30 ${compact ? 'p-3' : 'p-4'}`}>
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold text-slate-300">Layered Construction</p>
      <p className="text-[10px] text-slate-500">visualizer</p>
    </div>
    <p className="mt-1 text-[11px] text-slate-500">
      Build conviction step-by-step so the message lands clearly and respectfully.
    </p>

    <div className="mt-3 space-y-2">
      {[
        'Illustration Surface',
        'Scriptural Foundation',
        'Conviction Movement',
        'Reflection Moment',
        'Gospel Resolution',
      ].map((label, idx, arr) => (
        <div key={label} className="flex flex-col items-center">
          <div className="w-full max-w-[420px] rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
            <p className="text-xs text-slate-200 font-medium text-center">{label}</p>
          </div>
          {idx < arr.length - 1 && <div className="text-slate-600 text-sm leading-none my-1">↓</div>}
        </div>
      ))}
    </div>
  </div>
);

interface StressTestPersonaResult {
  persona: 'Intelligent skeptic' | 'Aggressive debunker' | 'Corporate HR mindset' | 'Teen audience' | string;
  likely_reaction: string;
  where_suspicion_forms: string[];
  recommended_patches: string[];
}

interface StressTestReport {
  overall_risk: 'Low' | 'Medium' | 'High' | string;
  vulnerability_report: string;
  where_suspicion_forms: string[];
  recommended_patches: string[];
  persona_results: StressTestPersonaResult[];
}

interface PhraseCategorySelection {
  bridge_phrases: boolean;
  reflection_questions: boolean;
  gentle_invitations: boolean;
  clarity_disclaimers: boolean;
  encouragement_lines: boolean;
}

interface MinistryPhrasesResult {
  bridge_phrases: string[];
  reflection_questions: string[];
  gentle_invitations: string[];
  clarity_disclaimers: string[];
  encouragement_lines: string[];
}


const MINISTRY_TONES: MinistryTone[] = [
  "Children's Church",
  'Youth Ministry',
  'Sunday Service',
  'Outreach / Evangelism',
  'Hospital / Pastoral Care',
  'VBS / Camp Setting',
];

const EXAMPLE_QUERIES = [
  "Create a routine for 'Torn and Restored Newspaper' about God's forgiveness.",
  "What Bible verse would fit with a 'Linking Rings' routine about unity?",
  'Brainstorm an effect to illustrate the story of the Loaves and Fishes.',
  "Help me script a message about 'new life in Christ' using a change bag.",
];

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Building your blueprint...</p>
    <p className="text-slate-400 text-sm">Structuring a message-first routine.</p>
  </div>
);

const ministryBlueprintSchema = {
  type: Type.OBJECT,
  properties: {
    scripture_focus: { type: Type.STRING },
    theological_theme: { type: Type.STRING },
    central_truth: { type: Type.STRING },
    routine_structure: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          stage_action: { type: Type.STRING },
          illustration: { type: Type.STRING },
          teaching_point: { type: Type.STRING },
          suggested_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
          notes: { type: Type.STRING },
        },
        required: ['title', 'stage_action', 'illustration', 'teaching_point'],
      },
    },
    illustration_bridge: { type: Type.STRING },
    emotional_arc: { type: Type.ARRAY, items: { type: Type.STRING } },
    pastoral_tone_guidance: { type: Type.STRING },
    altar_call_sensitivity: {
      type: Type.OBJECT,
      properties: {
        guidance: { type: Type.STRING },
        do: { type: Type.ARRAY, items: { type: Type.STRING } },
        dont: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['guidance', 'do', 'dont'],
    },
    age_adjustments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          audience: { type: Type.STRING },
          adjustments: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['audience', 'adjustments'],
      },
    },
    potential_misinterpretations: { type: Type.ARRAY, items: { type: Type.STRING } },
    closing_prayer_option: { type: Type.STRING },
  },
  required: [
    'scripture_focus',
    'theological_theme',
    'central_truth',
    'routine_structure',
    'illustration_bridge',
    'emotional_arc',
    'pastoral_tone_guidance',
    'altar_call_sensitivity',
    'age_adjustments',
    'potential_misinterpretations',
    'closing_prayer_option',
  ],
};


const stressTestSchema = {
  type: Type.OBJECT,
  properties: {
    overall_risk: { type: Type.STRING },
    vulnerability_report: { type: Type.STRING },
    where_suspicion_forms: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommended_patches: { type: Type.ARRAY, items: { type: Type.STRING } },
    persona_results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          persona: { type: Type.STRING },
          likely_reaction: { type: Type.STRING },
          where_suspicion_forms: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommended_patches: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['persona', 'likely_reaction', 'where_suspicion_forms', 'recommended_patches'],
      },
    },
  },
  required: ['overall_risk', 'vulnerability_report', 'where_suspicion_forms', 'recommended_patches', 'persona_results'],
};

const ministryPhrasesSchema = {
  type: Type.OBJECT,
  properties: {
    bridge_phrases: { type: Type.ARRAY, items: { type: Type.STRING } },
    reflection_questions: { type: Type.ARRAY, items: { type: Type.STRING } },
    gentle_invitations: { type: Type.ARRAY, items: { type: Type.STRING } },
    clarity_disclaimers: { type: Type.ARRAY, items: { type: Type.STRING } },
    encouragement_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'bridge_phrases',
    'reflection_questions',
    'gentle_invitations',
    'clarity_disclaimers',
    'encouragement_lines',
  ],
};
const mdEscape = (s: string) => (s || '').replace(/\r/g, '').trim();

const toMarkdownBlueprint = (
  q: string,
  tone: MinistryTone,
  doctrinalMode: boolean,
  bp: MinistryBlueprint
) => {
  const lines: string[] = [];
  lines.push(`## Ministry Blueprint: ${mdEscape(q)}`);
  lines.push('');
  lines.push(`**Ministry Tone:** ${tone}`);
  lines.push(`**Doctrinal Integrity Mode:** ${doctrinalMode ? 'On' : 'Off'}`);
  lines.push('');
  lines.push('### Scripture Focus');
  lines.push(mdEscape(bp.scripture_focus));
  lines.push('');
  lines.push('### Theological Theme');
  lines.push(mdEscape(bp.theological_theme));
  lines.push('');
  lines.push('### Central Truth');
  lines.push(mdEscape(bp.central_truth));
  lines.push('');
  lines.push('### Routine Structure');
  (bp.routine_structure || []).forEach((p, idx) => {
    lines.push(`**${idx + 1}. ${mdEscape(p.title)}**`);
    lines.push(`- Stage Action: ${mdEscape(p.stage_action)}`);
    lines.push(`- Illustration: ${mdEscape(p.illustration)}`);
    lines.push(`- Teaching Point: ${mdEscape(p.teaching_point)}`);
    if (p.suggested_lines?.length) {
      lines.push(`- Suggested Lines:`);
      p.suggested_lines.forEach((l) => lines.push(`  - ${mdEscape(l)}`));
    }
    if (p.notes) lines.push(`- Notes: ${mdEscape(p.notes)}`);
    lines.push('');
  });
  lines.push('### Illustration Bridge');
  lines.push(mdEscape(bp.illustration_bridge));
  lines.push('');
  lines.push('### Emotional Arc');
  (bp.emotional_arc || []).forEach((x) => lines.push(`- ${mdEscape(x)}`));
  lines.push('');
  lines.push('### Pastoral Tone Guidance');
  lines.push(mdEscape(bp.pastoral_tone_guidance));
  lines.push('');
  lines.push('### Altar Call Sensitivity');
  lines.push(mdEscape(bp.altar_call_sensitivity?.guidance || ''));
  if (bp.altar_call_sensitivity?.do?.length) {
    lines.push('**Do:**');
    bp.altar_call_sensitivity.do.forEach((x) => lines.push(`- ${mdEscape(x)}`));
  }
  if (bp.altar_call_sensitivity?.dont?.length) {
    lines.push('**Avoid:**');
    bp.altar_call_sensitivity.dont.forEach((x) => lines.push(`- ${mdEscape(x)}`));
  }
  lines.push('');
  lines.push('### Age Adjustments');
  (bp.age_adjustments || []).forEach((a) => {
    lines.push(`**${mdEscape(a.audience)}**`);
    (a.adjustments || []).forEach((x) => lines.push(`- ${mdEscape(x)}`));
    lines.push('');
  });
  lines.push('### Potential Misinterpretations');
  (bp.potential_misinterpretations || []).forEach((x) => lines.push(`- ${mdEscape(x)}`));
  lines.push('');
  lines.push('### Closing Prayer Option');
  lines.push(mdEscape(bp.closing_prayer_option));
  lines.push('');
  return lines.join('\n');
};

const Card: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title,
  children,
  defaultOpen,
}) => (
  <details className="group rounded-lg border border-slate-800 bg-slate-900/40" open={defaultOpen}>
    <summary className="cursor-pointer select-none list-none px-4 py-3 flex items-center justify-between">
      <span className="text-sm font-semibold text-slate-200">{title}</span>
      <span className="text-slate-500 group-open:rotate-180 transition-transform">▾</span>
    </summary>
    <div className="px-4 pb-4 pt-0 text-sm text-slate-200">{children}</div>
  </details>
);

const GospelMagicAssistant: React.FC<GospelMagicAssistantProps> = ({ onIdeaSaved }) => {
  const { currentUser } = useAppState() as any;

  const [theme, setTheme] = useState('');
  const [passage, setPassage] = useState('');
  const [ministryTone, setMinistryTone] = useState<MinistryTone>('Sunday Service');
  const [doctrinalMode, setDoctrinalMode] = useState(true);


  // Tier-2: Intelligence Layer
  const [stressReport, setStressReport] = useState<StressTestReport | null>(null);
  const [isStressLoading, setIsStressLoading] = useState(false);

  const [isSendingToPlanner, setIsSendingToPlanner] = useState(false);
  const [sendPlannerError, setSendPlannerError] = useState<string | null>(null);
  const [sendPlannerSuccess, setSendPlannerSuccess] = useState(false);

  const [isPreparingRehearsal, setIsPreparingRehearsal] = useState(false);
  const [rehearsalError, setRehearsalError] = useState<string | null>(null);
  const [stressError, setStressError] = useState<string | null>(null);

  const [phraseSelection, setPhraseSelection] = useState<PhraseCategorySelection>({
    bridge_phrases: true,
    reflection_questions: true,
    gentle_invitations: true,
    clarity_disclaimers: true,
    encouragement_lines: true,
  });
  const [phrasesPerCategory, setPhrasesPerCategory] = useState(5);
  const [phrasesResult, setPhrasesResult] = useState<MinistryPhrasesResult | null>(null);
  const [isPhrasesLoading, setIsPhrasesLoading] = useState(false);
  const [phrasesError, setPhrasesError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<MinistryBlueprint | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [lastQuery, setLastQuery] = useState('');

  const isFormValid = useMemo(() => theme.trim() || passage.trim(), [theme, passage]);

  const handleGenerate = async (searchQuery?: string) => {
    const currentTheme = searchQuery || theme;

    let themePart = (currentTheme || '').trim();
    let passagePart = (passage || '').trim();

    if (!themePart && !passagePart) {
      setError('Please enter a theme, effect, or Bible passage.');
      return;
    }

    // If the user clicked an example, it’s already a good full query.
    const userQuery = passagePart && themePart ? `${passagePart}: ${themePart}` : passagePart || themePart;
    setLastQuery(userQuery);

    setIsLoading(true);
    setError(null);
    setBlueprint(null);
    setStressReport(null);
    setStressError(null);
    setSaveStatus('idle');

    try {
      const doctrinalGuardrails = doctrinalMode
        ? `\n\nDoctrinal integrity guardrails (mandatory):\n- Avoid theological overreach or making denominationally controversial claims.\n- Avoid prosperity-style promises (no \'God will\' guarantees tied to the routine).\n- Do NOT imply the performer has spiritual authority or supernatural power.\n- Avoid emotional manipulation tactics.\n- Keep language pastoral, humble, and respectful.`
        : '';

      const prompt = `
Return STRICT JSON that matches the provided schema. Do not include markdown, prose outside JSON, or extra keys.

Context:
- Ministry Tone: ${ministryTone}
- Bible Passage (if provided): ${passagePart || '(none)'}
- Theme / Effect / Message (if provided): ${themePart || '(none)'}

Task:
Create a ministry-ready Gospel magic blueprint that connects an illustration (magic effect) to a biblical message.

Requirements:
- Stay respectful and pastoral in tone.
- Do not expose magic methods. Keep effects described at a high level.
- routine_structure should be practical and step-by-step: stage_action + teaching_point for each phase.
- Provide age_adjustments for at least: Children, Youth, Adults.
- Include potential_misinterpretations (what someone might wrongly conclude) and how to avoid them.
- altar_call_sensitivity must include: guidance, do, dont.
- closing_prayer_option should be gentle and appropriate for the selected tone.
${doctrinalGuardrails}
`;

      const response = await generateStructuredResponse(
        prompt,
        GOSPEL_MAGIC_SYSTEM_INSTRUCTION,
        ministryBlueprintSchema,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      setBlueprint(response as MinistryBlueprint);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
      setTheme('');
      setPassage('');
    }
  };

  const handleExampleClick = (exampleQuery: string) => {
    setTheme(exampleQuery);
    setPassage('');
    handleGenerate(exampleQuery);
  };

  const handleSave = () => {
    if (!blueprint) return;
    const fullContent = toMarkdownBlueprint(lastQuery, ministryTone, doctrinalMode, blueprint);
    saveIdea('text', fullContent, lastQuery);
    onIdeaSaved();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };
  const handleStressTest = async () => {
    if (!blueprint) return;

    setIsStressLoading(true);
    setStressError(null);
    setStressReport(null);

    try {
      const doctrinalGuardrails = doctrinalMode
        ? `\n\nDoctrinal integrity guardrails (mandatory):\n- Avoid theological overreach or denominationally controversial claims.\n- Avoid prosperity-style promises.\n- Do NOT imply the performer has spiritual authority or supernatural power.\n- Avoid emotional manipulation tactics.\n- Keep language pastoral, humble, and respectful.`
        : '';

      const prompt = `
Return STRICT JSON that matches the provided schema. No markdown. No extra keys.

You are reviewing a Gospel magic ministry blueprint for clarity, sensitivity, and credibility.

Ministry Tone: ${ministryTone}

Blueprint Summary:
- Scripture Focus: ${blueprint.scripture_focus}
- Theological Theme: ${blueprint.theological_theme}
- Central Truth: ${blueprint.central_truth}
- Illustration Bridge: ${blueprint.illustration_bridge}

Evaluate against these simulated perspectives:
1) Intelligent skeptic (friendly but discerning)
2) Aggressive debunker (hostile, assumes deception)
3) Corporate HR mindset (risk-averse, professionalism, consent)
4) Teen audience (attention, authenticity, cynicism)

Output:
- overall_risk: Low/Medium/High
- vulnerability_report: short paragraph
- where_suspicion_forms: bullet list
- recommended_patches: bullet list
- persona_results: list for each persona with likely_reaction + risks + patches

Important:
- Do NOT expose magic methods.
- Keep critique constructive and respectful.
${doctrinalGuardrails}
`;

      const response = await generateStructuredResponse(
        prompt,
        GOSPEL_MAGIC_SYSTEM_INSTRUCTION,
        stressTestSchema,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      setStressReport(response as StressTestReport);
    } catch (err: any) {
      setStressError(err instanceof Error ? err.message : 'Unable to run stress test.');
    } finally {
      setIsStressLoading(false);
    }
  };


  const handleSendToShowPlanner = async () => {
    if (!blueprint) return;
    setIsSendingToPlanner(true);
    setSendPlannerError(null);
    setSendPlannerSuccess(false);

    try {
      const topic = String(lastQuery || '').trim() || 'Ministry Routine';
      const showTitle = `Ministry Routine — ${topic}`;
      const descParts: string[] = [];
      if (blueprint.scripture_focus) descParts.push(`Scripture: ${blueprint.scripture_focus}`);
      if (blueprint.central_truth) descParts.push(`Central Truth: ${blueprint.central_truth}`);
      if (blueprint.theological_theme) descParts.push(`Theme: ${blueprint.theological_theme}`);
      const show = await createShow(showTitle, descParts.join('\n').slice(0, 800) || null);

      // Derive rough phases from the routine structure.
      const steps = Array.isArray(blueprint.routine_structure) ? blueprint.routine_structure : [];
      const step0 = steps[0]?.title ? `${steps[0].title}` : '';
      const step1 = steps[1]?.title ? `${steps[1].title}` : '';
      const step2 = steps[2]?.title ? `${steps[2].title}` : '';
      const lastStep = steps.length ? (steps[steps.length - 1]?.title ?? '') : '';

      const list = (label: string, items?: string[]) =>
        items && items.length ? `${label}\n- ${items.join('\n- ')}\n` : '';

      const reaction = blueprint.audience_reaction_model;
      const reactionText = reaction
        ? `Audience Reaction Model\n- Gasps (1–10): ${reaction.gasps_likelihood_1_to_10}\n- Skeptic resistance (0–1): ${reaction.skeptic_resistance_probability_0_to_1}\n- Confusion risk (0–1): ${reaction.confusion_risk_0_to_1}\n- Memory distortion (1–10): ${reaction.memory_distortion_strength_1_to_10}\n${reaction.notes ? `- Notes: ${reaction.notes}\n` : ''}`
        : '';

      const doctrinalNote = doctrinalMode
        ? `Doctrinal Integrity\n- Avoid overreach and performer-authority framing.\n- Avoid emotionally manipulative language.\n`
        : '';

      const openerNotes = [
        'OPENER FRAMING',
        blueprint.scripture_focus ? `Scripture Focus\n${blueprint.scripture_focus}\n` : '',
        blueprint.central_truth ? `Central Truth\n${blueprint.central_truth}\n` : '',
        blueprint.illustration_bridge ? `Illustration Bridge\n${blueprint.illustration_bridge}\n` : '',
        step0 ? `Suggested Opener Beat\n- ${step0}\n` : '',
        list('Potential Misinterpretations', blueprint.potential_misinterpretations),
        reactionText ? `${reactionText}\n` : '',
        doctrinalNote
      ].filter(Boolean).join('\n');

      const phase1Notes = [
        'PHASE 1',
        step1 ? `Beat\n- ${step1}\n` : '',
        steps[1]?.stage_action ? `Stage Action\n${steps[1].stage_action}\n` : '',
        steps[1]?.teaching_point ? `Teaching Point\n${steps[1].teaching_point}\n` : '',
        list('Suggested Lines', steps[1]?.suggested_lines),
        blueprint.pastoral_tone_guidance ? `Pastoral Tone\n${blueprint.pastoral_tone_guidance}\n` : ''
      ].filter(Boolean).join('\n');

      const phase2Notes = [
        'PHASE 2',
        step2 ? `Beat\n- ${step2}\n` : '',
        steps[2]?.stage_action ? `Stage Action\n${steps[2].stage_action}\n` : '',
        steps[2]?.teaching_point ? `Teaching Point\n${steps[2].teaching_point}\n` : '',
        list('Suggested Lines', steps[2]?.suggested_lines)
      ].filter(Boolean).join('\n');

      const revealNotes = [
        'REVEAL',
        lastStep ? `Climax Beat\n- ${lastStep}\n` : '',
        blueprint.emotional_arc?.length ? `Emotional Arc\n- ${blueprint.emotional_arc.join('\n- ')}\n` : '',
        blueprint.altar_call_sensitivity?.guidance ? `Altar Call Sensitivity\n${blueprint.altar_call_sensitivity.guidance}\n` : '',
        list('Do', blueprint.altar_call_sensitivity?.do),
        list("Don't", blueprint.altar_call_sensitivity?.dont)
      ].filter(Boolean).join('\n');

      const closerNotes = [
        'CLOSER TAG',
        blueprint.closing_prayer_option ? `Closing Prayer Option\n${blueprint.closing_prayer_option}\n` : '',
        doctrinalNote
      ].filter(Boolean).join('\n');

      const tasks = [
        { title: 'Opener framing', notes: openerNotes, tags: ['ministry', 'blueprint'] },
        { title: 'Phase 1', notes: phase1Notes, tags: ['ministry', 'blueprint'] },
        { title: 'Phase 2', notes: phase2Notes, tags: ['ministry', 'blueprint'] },
        { title: 'Reveal', notes: revealNotes, tags: ['ministry', 'blueprint'] },
        { title: 'Closer tag', notes: closerNotes, tags: ['ministry', 'blueprint'] }
      ];

      await addTasksToShow(show.id, tasks);
      setSendPlannerSuccess(true);

      // Navigate to Show Planner with the created show.
      onOpenShowPlanner?.(show.id, null);
    } catch (err: any) {
      setSendPlannerError(err?.message ? String(err.message) : 'Failed to send to Show Planner.');
    } finally {
      setIsSendingToPlanner(false);
    }
  };

  const handleRehearseInLiveStudio = async () => {
    if (!blueprint) return;
    setIsPreparingRehearsal(true);
    setRehearsalError(null);

    try {
      const title = `Ministry Rehearsal — ${String(lastQuery || '').trim() || 'Blueprint'}`;
      const blocks: string[] = [];
      if (blueprint.scripture_focus) blocks.push(`Scripture Focus\n${blueprint.scripture_focus}`);
      if (blueprint.central_truth) blocks.push(`Central Truth\n${blueprint.central_truth}`);
      if (blueprint.theological_theme) blocks.push(`Theme\n${blueprint.theological_theme}`);
      if (blueprint.illustration_bridge) blocks.push(`Illustration Bridge\n${blueprint.illustration_bridge}`);
      if (Array.isArray(blueprint.routine_structure) && blueprint.routine_structure.length) {
        const beats = blueprint.routine_structure
          .map((s, i) => `${i + 1}. ${s.title}${s.teaching_point ? ` — ${s.teaching_point}` : ''}`)
          .join('\n');
        blocks.push(`Routine Beats\n${beats}`);
      }
      if (Array.isArray(blueprint.emotional_arc) && blueprint.emotional_arc.length) {
        blocks.push(`Emotional Arc\n- ${blueprint.emotional_arc.join('\n- ')}`);
      }
      if (blueprint.pastoral_tone_guidance) blocks.push(`Pastoral Tone Guidance\n${blueprint.pastoral_tone_guidance}`);
      if (doctrinalMode) blocks.push(`Doctrinal Integrity\nKeep language careful, avoid performer-authority framing, and avoid emotional manipulation.`);
      if (blueprint.altar_call_sensitivity?.guidance) blocks.push(`Altar Call Sensitivity\n${blueprint.altar_call_sensitivity.guidance}`);

      const notes = blocks.join('\n\n').trim();

      const PREFILL_KEY = 'maw_live_rehearsal_prefill_v1';
      localStorage.setItem(PREFILL_KEY, JSON.stringify({ version: 1, title, notes }));

      onOpenLiveRehearsal?.();
    } catch (err: any) {
      setRehearsalError(err?.message ? String(err.message) : 'Failed to prepare rehearsal.');
    } finally {
      setIsPreparingRehearsal(false);
    }
  };


  const handleGeneratePhrases = async () => {
    const selected = Object.entries(phraseSelection)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');

    if (!selected) {
      setPhrasesError('Select at least one phrase type.');
      return;
    }

    setIsPhrasesLoading(true);
    setPhrasesError(null);
    setPhrasesResult(null);

    try {
      const doctrinalGuardrails = doctrinalMode
        ? `\n\nDoctrinal integrity guardrails (mandatory):\n- Avoid theological overreach or denominationally controversial claims.\n- Avoid prosperity-style promises.\n- Do NOT imply the performer has spiritual authority or supernatural power.\n- Avoid emotional manipulation tactics.\n- Keep language pastoral, humble, and respectful.`
        : '';

      const prompt = `
Return STRICT JSON that matches the provided schema. No markdown. No extra keys.

Generate ministry-safe performance phrasing to support a Gospel magic illustration.

Context:
- Ministry Tone: ${ministryTone}
- Scripture (optional): ${passage?.trim() || '(none)'}
- Theme / Effect (optional): ${theme?.trim() || '(none)'}
- Selected categories: ${selected}
- Phrases per category: ${phrasesPerCategory}

Guidelines:
- Keep phrases respectful, non-manipulative, and appropriate for church/ministry settings.
- Do NOT claim supernatural power or performer authority.
- Do NOT include exposure of magic methods.
- Keep phrases usable on stage (short, speakable).
${doctrinalGuardrails}

Populate arrays for categories the user selected; for unselected categories, return an empty array.
`;

      const response = await generateStructuredResponse(
        prompt,
        GOSPEL_MAGIC_SYSTEM_INSTRUCTION,
        ministryPhrasesSchema,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      setPhrasesResult(response as MinistryPhrasesResult);
    } catch (err: any) {
      setPhrasesError(err instanceof Error ? err.message : 'Unable to generate phrases.');
    } finally {
      setIsPhrasesLoading(false);
    }
  };



  const renderBlueprint = () => {
    if (!blueprint) return null;

    return (
      <div className="space-y-3 p-4 overflow-y-auto">
        <div className="text-xs text-slate-500 flex flex-wrap gap-2">
          <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-900/40">Tone: {ministryTone}</span>
          <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-900/40">
            Doctrinal Mode: {doctrinalMode ? 'On' : 'Off'}
          </span>
        </div>
        <div className="mt-2">
          <PsychologicalLayerVisualizer />
        </div>


        <Card title="Scripture Focus" defaultOpen>
          <p className="whitespace-pre-wrap">{blueprint.scripture_focus}</p>
        </Card>
        <Card title="Theological Theme">
          <p className="whitespace-pre-wrap">{blueprint.theological_theme}</p>
        </Card>
        <Card title="Central Truth" defaultOpen>
          <p className="whitespace-pre-wrap">{blueprint.central_truth}</p>
        </Card>

        <Card title="Routine Structure" defaultOpen>
          <div className="space-y-3">
            {(blueprint.routine_structure || []).map((p, idx) => (
              <div key={`${p.title}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <p className="text-slate-200 font-semibold">
                  {idx + 1}. {p.title}
                </p>

                <div className="mt-2">
                  <p className="text-slate-400 text-xs">Stage Action</p>
                  <p className="whitespace-pre-wrap">{p.stage_action}</p>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-slate-400 text-xs">Illustration</p>
                    <p className="whitespace-pre-wrap">{p.illustration}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Teaching Point</p>
                    <p className="whitespace-pre-wrap">{p.teaching_point}</p>
                  </div>
                </div>

                {!!p.suggested_lines?.length && (
                  <div className="mt-3">
                    <p className="text-slate-400 text-xs">Suggested Lines</p>
                    <ul className="list-disc ml-5 mt-1 space-y-1">
                      {p.suggested_lines.map((l, i) => (
                        <li key={i} className="text-slate-200">
                          {l}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!!p.notes && (
                  <div className="mt-3">
                    <p className="text-slate-400 text-xs">Notes</p>
                    <p className="whitespace-pre-wrap">{p.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card title="Illustration Bridge">
          <p className="whitespace-pre-wrap">{blueprint.illustration_bridge}</p>
        </Card>

        <Card title="Emotional Arc">
          <ul className="list-disc ml-5 space-y-1">
            {(blueprint.emotional_arc || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>

        <Card title="Pastoral Tone Guidance">
          <p className="whitespace-pre-wrap">{blueprint.pastoral_tone_guidance}</p>
        </Card>

        <Card title="Altar Call Sensitivity">
          <p className="whitespace-pre-wrap">{blueprint.altar_call_sensitivity?.guidance}</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-slate-400 text-xs">Do</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                {(blueprint.altar_call_sensitivity?.do || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Avoid</p>
              <ul className="list-disc ml-5 mt-1 space-y-1">
                {(blueprint.altar_call_sensitivity?.dont || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card title="Age Adjustments">
          <div className="space-y-3">
            {(blueprint.age_adjustments || []).map((a, i) => (
              <div key={`${a.audience}-${i}`} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <p className="font-semibold text-slate-200">{a.audience}</p>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  {(a.adjustments || []).map((x, j) => (
                    <li key={j}>{x}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Potential Misinterpretations">
          <ul className="list-disc ml-5 space-y-1">
            {(blueprint.potential_misinterpretations || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>

        
        <Card title="Stress Test Against Skeptic">
          {!stressReport && (
            <p className="text-slate-400 text-sm">
              Run a simulated review to identify where suspicion could form and how to strengthen clarity and credibility.
            </p>
          )}

          {stressError && <p className="text-red-400 text-sm">{stressError}</p>}

          {stressReport && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-900/40">
                  Overall Risk: <span className="text-slate-200 font-semibold">{stressReport.overall_risk}</span>
                </span>
              </div>

              <p className="whitespace-pre-wrap">{stressReport.vulnerability_report}</p>

              {!!stressReport.where_suspicion_forms?.length && (
                <div>
                  <p className="text-slate-400 text-xs">Where suspicion forms</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    {stressReport.where_suspicion_forms.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!stressReport.recommended_patches?.length && (
                <div>
                  <p className="text-slate-400 text-xs">Recommended patches</p>
                  <ul className="list-disc ml-5 mt-1 space-y-1">
                    {stressReport.recommended_patches.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!!stressReport.persona_results?.length && (
                <div className="space-y-2">
                  <p className="text-slate-400 text-xs">Persona notes</p>
                  {stressReport.persona_results.map((p, i) => (
                    <div key={i} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                      <p className="text-slate-200 font-semibold">{p.persona}</p>
                      <p className="mt-1 text-slate-200 whitespace-pre-wrap">{p.likely_reaction}</p>

                      {!!p.where_suspicion_forms?.length && (
                        <div className="mt-2">
                          <p className="text-slate-400 text-xs">Risk points</p>
                          <ul className="list-disc ml-5 mt-1 space-y-1">
                            {p.where_suspicion_forms.map((x, j) => (
                              <li key={j}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!!p.recommended_patches?.length && (
                        <div className="mt-2">
                          <p className="text-slate-400 text-xs">Patches</p>
                          <ul className="list-disc ml-5 mt-1 space-y-1">
                            {p.recommended_patches.map((x, j) => (
                              <li key={j}>{x}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

<Card title="Closing Prayer Option">
          <p className="whitespace-pre-wrap">{blueprint.closing_prayer_option}</p>
        </Card>
      </div>
    );
  };

  return (
    <div className="flex-1 lg:grid lg:grid-cols-2 gap-6 overflow-y-auto p-4 md:p-6">
      {/* Control Panel */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold text-slate-300 mb-2">Ministry Architecture Lab</h2>
        <p className="text-slate-400 mb-4">
          Build a structured, message-first Gospel magic blueprint. Add a theme/effect, a Scripture reference, and choose the ministry setting.
        </p>

        <div className="space-y-4">
          <div>
            <label htmlFor="gospel-passage" className="block text-sm font-medium text-slate-300 mb-1">
              Bible Passage (Optional)
            </label>
            <input
              id="gospel-passage"
              type="text"
              value={passage}
              onChange={(e) => {
                setPassage(e.target.value);
                setError(null);
              }}
              placeholder="e.g., John 3:16 or Genesis 1:1-3"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="gospel-theme" className="block text-sm font-medium text-slate-300 mb-1">
              Theme, Effect, or Message (Optional)
            </label>
            <textarea
              id="gospel-theme"
              rows={3}
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value);
                setError(null);
              }}
              placeholder="e.g., A routine about 'faith as a seed' using a growing flower effect."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="ministry-tone" className="block text-sm font-medium text-slate-300 mb-1">
              Ministry Tone
            </label>
            <select
              id="ministry-tone"
              value={ministryTone}
              onChange={(e) => setMinistryTone(e.target.value as MinistryTone)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white focus:outline-none focus:border-purple-500 transition-colors"
            >
              {MINISTRY_TONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
            <input
              type="checkbox"
              checked={doctrinalMode}
              onChange={(e) => setDoctrinalMode(e.target.checked)}
              className="mt-1 accent-purple-500"
            />
            <div>
              <p className="text-sm font-semibold text-slate-200">Respect Doctrinal Integrity</p>
              <p className="text-xs text-slate-400 mt-1">
                Avoid theological overreach, prosperity-style promises, implying performer authority, or emotionally manipulative language.
              </p>
            </div>
          </label>

          <div className="rounded-xl border border-slate-800 bg-slate-950/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Ministry Phrase Builder</p>
              <p className="text-[10px] text-slate-500">mini-tool</p>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Generate respectful, message-safe lines for transitions, reflection, and clarity (no method exposure).
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-200">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.bridge_phrases}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, bridge_phrases: e.target.checked }))}
                  className="accent-purple-500"
                />
                Bridge phrases
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.reflection_questions}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, reflection_questions: e.target.checked }))}
                  className="accent-purple-500"
                />
                Reflection questions
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.gentle_invitations}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, gentle_invitations: e.target.checked }))}
                  className="accent-purple-500"
                />
                Gentle invitations
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.clarity_disclaimers}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, clarity_disclaimers: e.target.checked }))}
                  className="accent-purple-500"
                />
                Clarity disclaimers
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.encouragement_lines}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, encouragement_lines: e.target.checked }))}
                  className="accent-purple-500"
                />
                Encouragement lines
              </label>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Phrases per category</span>
                <span className="text-slate-300">{phrasesPerCategory}</span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                value={phrasesPerCategory}
                onChange={(e) => setPhrasesPerCategory(parseInt(e.target.value, 10))}
                className="w-full mt-2 accent-purple-500"
              />
            </div>

            <button
              onClick={handleGeneratePhrases}
              disabled={isPhrasesLoading}
              className="w-full mt-3 py-2 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-100 font-semibold transition-colors disabled:bg-slate-700/60 disabled:cursor-not-allowed"
            >
              <WandIcon className="w-4 h-4" />
              <span>{isPhrasesLoading ? 'Generating…' : 'Generate Phrases'}</span>
            </button>

            {phrasesError && <p className="text-red-400 mt-2 text-xs">{phrasesError}</p>}

            {phrasesResult && (
              <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                {(
                  [
                    ['Bridge phrases', phrasesResult.bridge_phrases],
                    ['Reflection questions', phrasesResult.reflection_questions],
                    ['Gentle invitations', phrasesResult.gentle_invitations],
                    ['Clarity disclaimers', phrasesResult.clarity_disclaimers],
                    ['Encouragement lines', phrasesResult.encouragement_lines],
                  ] as Array<[string, string[]]>
                ).map(([label, arr]) => (
                  <details key={label} className="group rounded-lg border border-slate-800 bg-slate-950/30" open={label === 'Bridge phrases'}>
                    <summary className="cursor-pointer select-none list-none px-3 py-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">{label}</span>
                      <span className="text-slate-500 group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="px-3 pb-3 text-xs text-slate-200">
                      {arr?.length ? (
                        <ul className="list-disc ml-5 space-y-1">
                          {arr.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500">Not generated.</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>

</label>

          <button
            onClick={() => handleGenerate()}
            disabled={isLoading || !isFormValid}
            className="w-full py-3 mt-2 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
          >
            <WandIcon className="w-5 h-5" />
            <span>Build Ministry Blueprint</span>
          </button>

          {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}

          <div className="pt-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-2 text-center">Or try an example...</h3>
            <div className="w-full space-y-2">
              {EXAMPLE_QUERIES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => handleExampleClick(ex)}
                  className="w-full p-2 bg-slate-800/50 hover:bg-purple-900/40 border border-slate-700 rounded-lg text-xs text-slate-300 text-left transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Result Area */}
      <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingIndicator />
          </div>
        ) : blueprint ? (
          <div className="relative group flex-1 flex flex-col">
            {renderBlueprint()}
            <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">

              <button
                onClick={handleSendToShowPlanner}
                disabled={isSendingToPlanner || !blueprint}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-transparent border border-slate-600 hover:border-slate-400 rounded-md text-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Create a Show + tasks in Show Planner from this ministry blueprint"
              >
                {isSendingToPlanner ? (
                  <>
                    <div className="w-4 h-4 border-t-2 border-white/80 rounded-full animate-spin" />
                    <span>Sending…</span>
                  </>
                ) : (
                  <>
                    <span className="text-base leading-none">📋</span>
                    <span>Send to Show Planner</span>
                  </>
                )}
              </button>

              <button
                onClick={handleRehearseInLiveStudio}
                disabled={isPreparingRehearsal || !blueprint}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-transparent border border-slate-600 hover:border-slate-400 rounded-md text-slate-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                title="Jump into Live Rehearsal with this blueprint preloaded"
              >
                {isPreparingRehearsal ? (
                  <>
                    <div className="w-4 h-4 border-t-2 border-slate-300 rounded-full animate-spin" />
                    <span>Preparing…</span>
                  </>
                ) : (
                  <>
                    <WandIcon className="w-4 h-4" />
                    <span>Rehearse in Live Studio</span>
                  </>
                )}
              </button>

              <button
                onClick={handleStressTest}
                disabled={isStressLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-transparent border border-slate-600 hover:border-slate-400 rounded-md text-slate-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                title="Review for clarity, sensitivity, and where confusion or skepticism may arise"
              >
                <span className="text-base leading-none">🔍</span>
                <span>{isStressLoading ? 'Reviewing…' : 'Review Clarity'}</span>
              </button>

              <ShareButton
                title={`Ministry Blueprint: ${lastQuery}`}
                text={toMarkdownBlueprint(lastQuery, ministryTone, doctrinalMode, blueprint)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 transition-colors"
              >
                <ShareIcon className="w-4 h-4" />
                <span>Share</span>
              </ShareButton>
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saved'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200 disabled:cursor-default transition-colors"
              >
                {saveStatus === 'saved' ? (
                  <>
                    <CheckIcon className="w-4 h-4 text-green-400" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4" />
                    <span>Save Idea</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative overflow-hidden flex items-center justify-center text-center text-slate-500 p-6">
            {/* Reverent empty state: parchment blueprint + subtle cross-line motif (very faint) */}
            <div className="absolute inset-0 opacity-[0.10]">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-200/10 via-slate-950 to-slate-900" />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 600" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="600" height="600" fill="url(#grid)" />
                {/* subtle cross lines */}
                <path d="M300 140 L300 460" stroke="white" strokeWidth="2" opacity="0.5" />
                <path d="M220 260 L380 260" stroke="white" strokeWidth="2" opacity="0.5" />
              </svg>
            </div>

            <div className="relative max-w-md">
              <div className="mx-auto mb-4 w-full max-w-md">
                <PsychologicalLayerVisualizer compact />
              </div>
              <p className="text-slate-300 font-semibold">Your ministry blueprint will appear here.</p>
              <p className="text-slate-500 text-sm mt-2">
                Start with a Scripture reference or a message theme, choose the ministry tone, and generate a structured routine you can trust.
              </p>
              <div className="mt-4 text-xs text-slate-500">
                <p className="italic opacity-70 tracking-wide">“Let all things be done decently and in order.”</p>
                <p className="mt-1">(1 Corinthians 14:40)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GospelMagicAssistant;
