import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { CohesionActions } from './CohesionActions';
import { createShow, addTasksToShow } from '../services/showsService';
import { GOSPEL_MAGIC_SYSTEM_INSTRUCTION } from '../constants';
import { WandIcon, SaveIcon, CheckIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';
import { trackClientEvent } from '../services/telemetryClient';

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

type PhraseTone = 'Gentle' | 'Reflective' | 'Encouraging' | 'Evangelistic' | 'Devotional' | 'Child-friendly';

interface MinistryBlueprint {
  scripture_focus: string;
  theological_theme: string;
  central_truth: string;
  why_this_effect_serves_the_message: {
    why_this_illustration_works: string;
    message_support: string;
    should_not_imply: string[];
    humble_introduction: string;
    scripture_transition: string;
  };
  ministry_use_case: string;
  effect_fit_assessment: string;
  reverence_risk_notes: string[];
  performer_humility_lines: string[];
  scripture_handling_notes: string;
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
const MinistryLayerVisualizer: React.FC<LayeredDiagramProps> = ({ compact }) => (
  <div className={`rounded-xl border border-slate-800 bg-slate-950/30 ${compact ? 'p-3' : 'p-4'}`}>
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold text-amber-200">Message Construction</p>
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
  persona: 'New believer' | 'Longtime church member' | 'Teen listener' | 'Outreach guest' | 'Church leadership mindset' | string;
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
  scripture_transition_lines: boolean;
  humble_closing_lines: boolean;
}

interface MinistryPhrasesResult {
  bridge_phrases: string[];
  reflection_questions: string[];
  gentle_invitations: string[];
  clarity_disclaimers: string[];
  encouragement_lines: string[];
  scripture_transition_lines: string[];
  humble_closing_lines: string[];
}


const MINISTRY_TONES: MinistryTone[] = [
  "Children's Church",
  'Youth Ministry',
  'Sunday Service',
  'Outreach / Evangelism',
  'Hospital / Pastoral Care',
  'VBS / Camp Setting',
];

const PHRASE_TONES: PhraseTone[] = [
  'Gentle',
  'Reflective',
  'Encouraging',
  'Evangelistic',
  'Devotional',
  'Child-friendly',
];

const EXAMPLE_QUERIES = [
  "Create a children's church object lesson about forgiveness using a torn-and-restored effect.",
  "Build a sermon illustration about unity in Christ using linking rings.",
  "Create a gentle outreach routine about hope and restoration using a rope effect.",
  "Help me present a youth-service illustration about choices and consequences with clear biblical application.",
  "Create a hospital-room encouragement illustration about peace and God's presence with a soft, non-showy tone.",
  "Create a simple object lesson that supports the Scripture without making the effect feel like spiritual proof.",
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
    why_this_effect_serves_the_message: {
      type: Type.OBJECT,
      properties: {
        why_this_illustration_works: { type: Type.STRING },
        message_support: { type: Type.STRING },
        should_not_imply: { type: Type.ARRAY, items: { type: Type.STRING } },
        humble_introduction: { type: Type.STRING },
        scripture_transition: { type: Type.STRING },
      },
      required: [
        'why_this_illustration_works',
        'message_support',
        'should_not_imply',
        'humble_introduction',
        'scripture_transition',
      ],
    },
    ministry_use_case: { type: Type.STRING },
    effect_fit_assessment: { type: Type.STRING },
    reverence_risk_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
    performer_humility_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
    scripture_handling_notes: { type: Type.STRING },
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
    'why_this_effect_serves_the_message',
    'ministry_use_case',
    'effect_fit_assessment',
    'reverence_risk_notes',
    'performer_humility_lines',
    'scripture_handling_notes',
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
    scripture_transition_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
    humble_closing_lines: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'bridge_phrases',
    'reflection_questions',
    'gentle_invitations',
    'clarity_disclaimers',
    'encouragement_lines',
    'scripture_transition_lines',
    'humble_closing_lines',
  ],
};
const mdEscape = (s: string) => (s || '').replace(/\r/g, '').trim();

const toMarkdownBlueprint = (
  q: string,
  tone: MinistryTone,
  doctrinalMode: boolean,
  ministrySensitivityMode: boolean,
  bp: MinistryBlueprint
) => {
  const lines: string[] = [];
  lines.push(`## Ministry Blueprint: ${mdEscape(q)}`);
  lines.push('');
  lines.push(`**Ministry Tone:** ${tone}`);
  lines.push(`**Doctrinal Integrity Mode:** ${doctrinalMode ? 'On' : 'Off'}`);
  lines.push(`**Ministry Sensitivity Mode:** ${ministrySensitivityMode ? 'On' : 'Off'}`);
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
  lines.push('### Why This Effect Serves the Message');
  lines.push(`- Why this illustration works: ${mdEscape(bp.why_this_effect_serves_the_message?.why_this_illustration_works || '')}`);
  lines.push(`- What part of the message it supports: ${mdEscape(bp.why_this_effect_serves_the_message?.message_support || '')}`);
  if (bp.why_this_effect_serves_the_message?.should_not_imply?.length) {
    lines.push('- What it should not imply:');
    bp.why_this_effect_serves_the_message.should_not_imply.forEach((x) => lines.push(`  - ${mdEscape(x)}`));
  }
  lines.push(`- How to introduce it humbly: ${mdEscape(bp.why_this_effect_serves_the_message?.humble_introduction || '')}`);
  lines.push(`- How to transition back to Scripture: ${mdEscape(bp.why_this_effect_serves_the_message?.scripture_transition || '')}`);
  lines.push('');
  lines.push('### Ministry Use Case');
  lines.push(mdEscape(bp.ministry_use_case));
  lines.push('');
  lines.push('### Effect Fit Assessment');
  lines.push(mdEscape(bp.effect_fit_assessment));
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
  lines.push('### Reverence Risk Notes');
  (bp.reverence_risk_notes || []).forEach((x) => lines.push(`- ${mdEscape(x)}`));
  lines.push('');
  lines.push('### Performer Humility Lines');
  (bp.performer_humility_lines || []).forEach((x) => lines.push(`- ${mdEscape(x)}`));
  lines.push('');
  lines.push('### Scripture Handling Notes');
  lines.push(mdEscape(bp.scripture_handling_notes));
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

const renderPhraseResultSections = (phrasesResult: MinistryPhrasesResult | null) => {
  if (!phrasesResult) return <p className="text-slate-400 text-sm">Use the Ministry Phrase Builder to generate respectful transitions, Scripture moments, and humble closing lines.</p>;

  return (
    <div className="space-y-2">
      {(
        [
          ['Bridge phrases', phrasesResult.bridge_phrases],
          ['Reflection questions', phrasesResult.reflection_questions],
          ['Gentle invitations', phrasesResult.gentle_invitations],
          ['Clarity disclaimers', phrasesResult.clarity_disclaimers],
          ['Encouragement lines', phrasesResult.encouragement_lines],
          ['Scripture transition lines', phrasesResult.scripture_transition_lines],
          ['Humble closing lines', phrasesResult.humble_closing_lines],
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
  );
};

const toTag = (s: string) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);

const buildIdeaVaultTags = (
  bp: MinistryBlueprint,
  tone: MinistryTone,
  phraseTone: PhraseTone,
  doctrinalMode: boolean,
  ministrySensitivityMode: boolean,
  stressReport: StressTestReport | null
) => {
  const tags = [
    'gospel-magic',
    'ministry',
    `tone-${toTag(tone)}`,
    doctrinalMode ? 'doctrinal-integrity-on' : 'doctrinal-integrity-off',
    ministrySensitivityMode ? 'ministry-sensitivity-on' : 'ministry-sensitivity-off',
  ];

  if (bp.scripture_focus) tags.push(`scripture-${toTag(bp.scripture_focus)}`);
  if (bp.ministry_use_case) tags.push(`use-case-${toTag(bp.ministry_use_case)}`);
  if (phraseTone) tags.push(`phrase-tone-${toTag(phraseTone)}`);
  if (stressReport?.overall_risk) tags.push(`clarity-review-${toTag(stressReport.overall_risk)}`);

  return Array.from(new Set(tags.filter(Boolean))).slice(0, 12);
};

const buildIdeaVaultMetadataBlock = (
  bp: MinistryBlueprint,
  tone: MinistryTone,
  phraseTone: PhraseTone,
  doctrinalMode: boolean,
  ministrySensitivityMode: boolean,
  stressReport: StressTestReport | null
) => {
  const lines = [
    '### Idea Vault Metadata',
    `- Ministry Tone: ${tone}`,
    `- Ministry Context: ${bp.ministry_use_case || 'Not specified'}`,
    `- Doctrinal Integrity Mode: ${doctrinalMode ? 'On' : 'Off'}`,
    `- Ministry Sensitivity Mode: ${ministrySensitivityMode ? 'On' : 'Off'}`,
    `- Scripture Focus: ${bp.scripture_focus || 'Not specified'}`,
    `- Phrase Tone: ${phraseTone || 'Not specified'}`,
    `- Ministry Clarity Review: ${stressReport ? stressReport.overall_risk : 'Not run'}`,
  ];
  if (stressReport?.vulnerability_report) {
    lines.push(`- Clarity Review Summary: ${mdEscape(stressReport.vulnerability_report)}`);
  }
  lines.push('');
  return lines.join('\n');
};

const GospelMagicAssistant: React.FC<GospelMagicAssistantProps> = ({ onIdeaSaved, onOpenShowPlanner, onOpenLiveRehearsal }) => {
  const { currentUser } = useAppState() as any;

  const trackGospelEvent = (action: string, extras?: { outcome?: 'SUCCESS_NOT_CHARGED' | 'ERROR_UPSTREAM' | 'ALLOWED' | 'SUCCESS_CHARGED'; http_status?: number; error_code?: string; retryable?: boolean; units?: number; metadata?: any }) => {
    void trackClientEvent({
      tool: 'gospel_magic',
      action,
      outcome: extras?.outcome,
      http_status: extras?.http_status,
      error_code: extras?.error_code,
      retryable: extras?.retryable,
      units: extras?.units,
      metadata: extras?.metadata,
    });
  };

  const [theme, setTheme] = useState('');
  const [passage, setPassage] = useState('');
  const [ministryTone, setMinistryTone] = useState<MinistryTone>('Sunday Service');
  const [doctrinalMode, setDoctrinalMode] = useState(true);
  const [ministrySensitivityMode, setMinistrySensitivityMode] = useState(true);


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
    scripture_transition_lines: true,
    humble_closing_lines: true,
  });
  const [phraseTone, setPhraseTone] = useState<PhraseTone>('Gentle');
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

    trackGospelEvent('gospel_magic_generate_start', { outcome: 'ALLOWED' });

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
      const ministrySensitivityGuardrails = ministrySensitivityMode
        ? `\n\nMinistry sensitivity guardrails (mandatory):\n- Avoid emotional pressure or manipulative invitation language.\n- Do NOT imply that the effect demonstrates a miracle or supernatural proof.\n- Do NOT present the performer as having spiritual authority, divine insight, or special power.\n- Do NOT use tricks as proof that Christianity is true.\n- Keep volunteer handling gentle, fully respectful, and never embarrassing.`
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
- Include why_this_effect_serves_the_message with: why_this_illustration_works, message_support, should_not_imply, humble_introduction, scripture_transition.
- Include ministry_use_case explaining where this routine best fits in ministry.
- Include effect_fit_assessment explaining why the chosen illustration supports the message without implying supernatural power.
- Include reverence_risk_notes warning where the effect could feel gimmicky, manipulative, or spiritually confusing.
- Include performer_humility_lines with 2-4 short lines that keep the performer humble and avoid self-importance.
- Include scripture_handling_notes to help the performer treat the passage carefully and avoid overclaiming.
- Make the Why This Effect Serves the Message section especially practical, humble, and message-first.
- altar_call_sensitivity must include: guidance, do, dont.
- closing_prayer_option should be gentle and appropriate for the selected tone.
${doctrinalGuardrails}${ministrySensitivityGuardrails}
`;

      const response = await generateStructuredResponse(
        prompt,
        GOSPEL_MAGIC_SYSTEM_INSTRUCTION,
        ministryBlueprintSchema,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      const nextBlueprint = response as MinistryBlueprint;
      setBlueprint(nextBlueprint);
      trackGospelEvent('gospel_magic_generate_success', {
        outcome: 'SUCCESS_NOT_CHARGED',
        units: Array.isArray(nextBlueprint?.routine_structure) ? nextBlueprint.routine_structure.length : 0,
      });
    } catch (err: any) {
      trackGospelEvent('gospel_magic_generate_error', {
        outcome: 'ERROR_UPSTREAM',
        error_code: 'generate_error',
        retryable: true,
      });
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
      setTheme('');
      setPassage('');
    }
  };

  const handleExampleClick = (exampleQuery: string) => {
    trackGospelEvent('gospel_magic_example_prompt_used', { outcome: 'ALLOWED' });
    setTheme(exampleQuery);
    setPassage('');
    handleGenerate(exampleQuery);
  };

  const handleSave = async () => {
    if (!blueprint) return;
    try {
      const fullContent = [
        buildIdeaVaultMetadataBlock(
          blueprint,
          ministryTone,
          phraseTone,
          doctrinalMode,
          ministrySensitivityMode,
          stressReport
        ),
        toMarkdownBlueprint(lastQuery, ministryTone, doctrinalMode, ministrySensitivityMode, blueprint),
      ].join('\n');
      const tags = buildIdeaVaultTags(
        blueprint,
        ministryTone,
        phraseTone,
        doctrinalMode,
        ministrySensitivityMode,
        stressReport
      );
      await saveIdea({ type: 'text', content: fullContent, title: lastQuery, tags });
      trackGospelEvent('gospel_magic_save_idea', { outcome: 'SUCCESS_NOT_CHARGED' });
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      trackGospelEvent('gospel_magic_save_error', { outcome: 'ERROR_UPSTREAM', error_code: 'save_error', retryable: true });
      console.error('Failed to save Gospel Magic idea', err);
    }
  };
  const handleStressTest = async () => {
    if (!blueprint) return;

    trackGospelEvent('gospel_magic_clarity_review_start', { outcome: 'ALLOWED' });

    setIsStressLoading(true);
    setStressError(null);
    setStressReport(null);

    try {
      const doctrinalGuardrails = doctrinalMode
        ? `\n\nDoctrinal integrity guardrails (mandatory):\n- Avoid theological overreach or denominationally controversial claims.\n- Avoid prosperity-style promises.\n- Do NOT imply the performer has spiritual authority or supernatural power.\n- Avoid emotional manipulation tactics.\n- Keep language pastoral, humble, and respectful.`
        : '';
      const ministrySensitivityGuardrails = ministrySensitivityMode
        ? `\n\nMinistry sensitivity guardrails (mandatory):\n- Flag any place where the routine could feel manipulative, miracle-implying, spiritually overclaimed, or embarrassing to a volunteer.\n- Prefer gentler wording and pastoral restraint when suggesting patches.`
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

Evaluate against these ministry-aware perspectives:
1) New believer (still learning church language and spiritual concepts)
2) Longtime church member (sensitive to biblical accuracy and tone)
3) Teen listener (authenticity, clarity, attention)
4) Outreach guest unfamiliar with church language
5) Church leadership mindset (pastoral sensitivity, consent, appropriateness)

Output:
- overall_risk: Low/Medium/High
- vulnerability_report: short paragraph
- where_suspicion_forms: places where the message may become unclear, overclaimed, manipulative, or too showy
- recommended_patches: concrete wording or structure improvements
- persona_results: list for each persona with likely_reaction + risks + patches

Important:
- Do NOT expose magic methods.
- Keep critique constructive, ministry-aware, and respectful.
${doctrinalGuardrails}${ministrySensitivityGuardrails}
`;

      const response = await generateStructuredResponse(
        prompt,
        GOSPEL_MAGIC_SYSTEM_INSTRUCTION,
        stressTestSchema,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      const nextStressReport = response as StressTestReport;
      setStressReport(nextStressReport);
      trackGospelEvent('gospel_magic_clarity_review_success', {
        outcome: 'SUCCESS_NOT_CHARGED',
        units: Array.isArray(nextStressReport?.persona_results) ? nextStressReport.persona_results.length : 0,
      });
    } catch (err: any) {
      trackGospelEvent('gospel_magic_clarity_review_error', { outcome: 'ERROR_UPSTREAM', error_code: 'clarity_review_error', retryable: true });
      setStressError(err instanceof Error ? err.message : 'Unable to run ministry clarity review.');
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
      if (blueprint.why_this_effect_serves_the_message?.message_support) descParts.push(`Message Support: ${blueprint.why_this_effect_serves_the_message.message_support}`);
      if (blueprint.ministry_use_case) descParts.push(`Ministry Context: ${blueprint.ministry_use_case}`);
      if (blueprint.theological_theme) descParts.push(`Theme: ${blueprint.theological_theme}`);
      const show = await createShow(showTitle, descParts.join('\n').slice(0, 800) || null);

      const steps = Array.isArray(blueprint.routine_structure) ? blueprint.routine_structure : [];
      const volunteerNotes = steps
        .filter((s) => /volunteer|participant|helper/i.test(`${s.stage_action || ''} ${s.illustration || ''} ${s.notes || ''}`))
        .map((s) => `- ${s.title}: ${s.stage_action || s.notes || s.illustration}`)
        .join('\n');

      const scriptureFramingNotes = [
        'SCRIPTURE FRAMING',
        blueprint.scripture_focus ? `Scripture Focus\n${blueprint.scripture_focus}\n` : '',
        blueprint.central_truth ? `Central Truth\n${blueprint.central_truth}\n` : '',
        blueprint.scripture_handling_notes ? `Scripture Handling Notes\n${blueprint.scripture_handling_notes}\n` : '',
        blueprint.pastoral_tone_guidance ? `Pastoral Tone Guidance\n${blueprint.pastoral_tone_guidance}\n` : '',
        doctrinalMode ? `Doctrinal Integrity\n- Avoid theological overreach and performer-authority framing.\n- Keep the emphasis on Scripture rather than the effect.\n` : '',
        ministrySensitivityMode ? `Ministry Sensitivity\n- Avoid emotional pressure, miracle implication, and manipulative tone.\n` : '',
      ].filter(Boolean).join('\n');

      const illustrationSetupNotes = [
        'ILLUSTRATION SETUP',
        blueprint.effect_fit_assessment ? `Effect Fit Assessment\n${blueprint.effect_fit_assessment}\n` : '',
        blueprint.illustration_bridge ? `Illustration Bridge\n${blueprint.illustration_bridge}\n` : '',
        blueprint.why_this_effect_serves_the_message?.why_this_illustration_works
          ? `Why This Illustration Works\n${blueprint.why_this_effect_serves_the_message.why_this_illustration_works}\n`
          : '',
        steps[0]?.stage_action ? `Opening Stage Action\n${steps[0].stage_action}\n` : '',
        steps[0]?.illustration ? `Opening Illustration\n${steps[0].illustration}\n` : '',
        blueprint.reverence_risk_notes?.length ? `Reverence Risk Notes\n- ${blueprint.reverence_risk_notes.join('\n- ')}\n` : '',
      ].filter(Boolean).join('\n');

      const messageTransitionNotes = [
        'MESSAGE TRANSITION',
        blueprint.why_this_effect_serves_the_message?.message_support
          ? `Message Support\n${blueprint.why_this_effect_serves_the_message.message_support}\n`
          : '',
        blueprint.why_this_effect_serves_the_message?.humble_introduction
          ? `Humble Introduction\n${blueprint.why_this_effect_serves_the_message.humble_introduction}\n`
          : '',
        blueprint.why_this_effect_serves_the_message?.scripture_transition
          ? `Return to Scripture\n${blueprint.why_this_effect_serves_the_message.scripture_transition}\n`
          : '',
        steps[1]?.teaching_point ? `Suggested Teaching Point\n${steps[1].teaching_point}\n` : '',
        blueprint.performer_humility_lines?.length ? `Humility Lines\n- ${blueprint.performer_humility_lines.join('\n- ')}\n` : '',
      ].filter(Boolean).join('\n');

      const reflectionMomentNotes = [
        'AUDIENCE REFLECTION MOMENT',
        blueprint.ministry_use_case ? `Ministry Use Case\n${blueprint.ministry_use_case}\n` : '',
        blueprint.altar_call_sensitivity?.guidance ? `Pastoral Guidance\n${blueprint.altar_call_sensitivity.guidance}\n` : '',
        blueprint.altar_call_sensitivity?.do?.length ? `Do\n- ${blueprint.altar_call_sensitivity.do.join('\n- ')}\n` : '',
        blueprint.altar_call_sensitivity?.dont?.length ? `Avoid\n- ${blueprint.altar_call_sensitivity.dont.join('\n- ')}\n` : '',
        stressReport?.vulnerability_report ? `Ministry Clarity Review\n${stressReport.vulnerability_report}\n` : '',
      ].filter(Boolean).join('\n');

      const closingThoughtNotes = [
        'CLOSING THOUGHT',
        blueprint.closing_prayer_option ? `Closing Prayer / Thought\n${blueprint.closing_prayer_option}\n` : '',
        blueprint.why_this_effect_serves_the_message?.should_not_imply?.length
          ? `Should Not Imply\n- ${blueprint.why_this_effect_serves_the_message.should_not_imply.join('\n- ')}\n`
          : '',
        blueprint.potential_misinterpretations?.length
          ? `Potential Misinterpretations\n- ${blueprint.potential_misinterpretations.join('\n- ')}\n`
          : '',
      ].filter(Boolean).join('\n');

      const verseReadingPlacementNotes = [
        'VERSE READING PLACEMENT',
        blueprint.scripture_focus ? `Primary Passage\n${blueprint.scripture_focus}\n` : '',
        blueprint.scripture_handling_notes ? `Handling Notes\n${blueprint.scripture_handling_notes}\n` : '',
        blueprint.why_this_effect_serves_the_message?.scripture_transition
          ? `Transition Line\n${blueprint.why_this_effect_serves_the_message.scripture_transition}\n`
          : '',
      ].filter(Boolean).join('\n');

      const prayerInvitationNotes = [
        'PRAYER / INVITATION CONSIDERATION',
        blueprint.ministry_use_case ? `Use Case\n${blueprint.ministry_use_case}\n` : '',
        blueprint.altar_call_sensitivity?.guidance ? `Sensitivity Guidance\n${blueprint.altar_call_sensitivity.guidance}\n` : '',
        ministrySensitivityMode ? `Ministry Sensitivity\n- Keep any invitation gentle, voluntary, and free from emotional pressure.\n` : '',
      ].filter(Boolean).join('\n');

      const tasks = [
        { title: 'Scripture framing', notes: scriptureFramingNotes, tags: ['ministry', 'gospel-magic', 'scripture'] },
        { title: 'Illustration setup', notes: illustrationSetupNotes, tags: ['ministry', 'gospel-magic', 'illustration'] },
        { title: 'Message transition', notes: messageTransitionNotes, tags: ['ministry', 'gospel-magic', 'transition'] },
        { title: 'Audience reflection moment', notes: reflectionMomentNotes, tags: ['ministry', 'gospel-magic', 'reflection'] },
        { title: 'Closing thought', notes: closingThoughtNotes, tags: ['ministry', 'gospel-magic', 'closing'] },
        { title: 'Verse reading placement', notes: verseReadingPlacementNotes, tags: ['ministry', 'gospel-magic', 'scripture'] },
        { title: 'Prayer or invitation consideration', notes: prayerInvitationNotes, tags: ['ministry', 'gospel-magic', 'pastoral'] },
      ];

      if (volunteerNotes) {
        tasks.splice(5, 0, {
          title: 'Volunteer guidance',
          notes: ['VOLUNTEER GUIDANCE', volunteerNotes, ministrySensitivityMode ? 'Keep volunteer handling gentle, clear, and never embarrassing.' : ''].filter(Boolean).join('\n\n'),
          tags: ['ministry', 'gospel-magic', 'volunteer'],
        });
      }

      await addTasksToShow(show.id, tasks);
      setSendPlannerSuccess(true);
      trackGospelEvent('gospel_magic_send_to_show_planner', { outcome: 'SUCCESS_NOT_CHARGED', units: tasks.length });
      onOpenShowPlanner?.(show.id, null);
    } catch (err: any) {
      trackGospelEvent('gospel_magic_send_to_show_planner_error', { outcome: 'ERROR_UPSTREAM', error_code: 'show_planner_error', retryable: true });
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
      if (blueprint.ministry_use_case) blocks.push(`Ministry Context\n${blueprint.ministry_use_case}`);
      if (blueprint.illustration_bridge) blocks.push(`Illustration Bridge\n${blueprint.illustration_bridge}`);
      if (blueprint.effect_fit_assessment) blocks.push(`Effect Fit Assessment\n${blueprint.effect_fit_assessment}`);
      if (blueprint.why_this_effect_serves_the_message?.humble_introduction) {
        blocks.push(`Humble Introduction\n${blueprint.why_this_effect_serves_the_message.humble_introduction}`);
      }
      if (blueprint.why_this_effect_serves_the_message?.scripture_transition) {
        blocks.push(`Return to Scripture\n${blueprint.why_this_effect_serves_the_message.scripture_transition}`);
      }
      if (Array.isArray(blueprint.routine_structure) && blueprint.routine_structure.length) {
        const beats = blueprint.routine_structure
          .map((s, i) => `${i + 1}. ${s.title}${s.teaching_point ? ` — ${s.teaching_point}` : ''}`)
          .join('\n');
        blocks.push(`Routine Beats\n${beats}`);
      }
      if (Array.isArray(blueprint.performer_humility_lines) && blueprint.performer_humility_lines.length) {
        blocks.push(`Humility Lines\n- ${blueprint.performer_humility_lines.join('\n- ')}`);
      }
      blocks.push(
        'Coaching Focus\n- clarity\n- humility\n- gentle tone\n- clean transitions\n- avoid overselling the effect\n- return clearly to Scripture'
      );
      if (Array.isArray(blueprint.emotional_arc) && blueprint.emotional_arc.length) {
        blocks.push(`Emotional Arc\n- ${blueprint.emotional_arc.join('\n- ')}`);
      }
      if (blueprint.pastoral_tone_guidance) blocks.push(`Pastoral Tone Guidance\n${blueprint.pastoral_tone_guidance}`);
      if (doctrinalMode) blocks.push(`Doctrinal Integrity\nKeep language careful, avoid performer-authority framing, and avoid emotional manipulation.`);
      if (ministrySensitivityMode) blocks.push(`Ministry Sensitivity\nAvoid miracle implication, spiritual overclaiming, and any volunteer handling that could feel embarrassing or manipulative.`);
      if (blueprint.altar_call_sensitivity?.guidance) blocks.push(`Altar Call Sensitivity\n${blueprint.altar_call_sensitivity.guidance}`);

      const notes = blocks.join('\n\n').trim();

      const PREFILL_KEY = 'maw_live_rehearsal_prefill_v1';
      localStorage.setItem(PREFILL_KEY, JSON.stringify({ version: 1, title, notes }));

      onOpenLiveRehearsal?.();
    } catch (err: any) {
      trackGospelEvent('gospel_magic_open_live_rehearsal_error', { outcome: 'ERROR_UPSTREAM', error_code: 'live_rehearsal_error', retryable: true });
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

    trackGospelEvent('gospel_magic_phrase_builder_start', { outcome: 'ALLOWED' });

    setIsPhrasesLoading(true);
    setPhrasesError(null);
    setPhrasesResult(null);

    try {
      const doctrinalGuardrails = doctrinalMode
        ? `\n\nDoctrinal integrity guardrails (mandatory):\n- Avoid theological overreach or denominationally controversial claims.\n- Avoid prosperity-style promises.\n- Do NOT imply the performer has spiritual authority or supernatural power.\n- Avoid emotional manipulation tactics.\n- Keep language pastoral, humble, and respectful.`
        : '';
      const ministrySensitivityGuardrails = ministrySensitivityMode
        ? `\n\nMinistry sensitivity guardrails (mandatory):\n- Avoid emotional pressure, miracle implication, manipulative framing, or embarrassing volunteer language.\n- Keep phrasing invitational, respectful, and pastoral.`
        : '';

      const prompt = `
Return STRICT JSON that matches the provided schema. No markdown. No extra keys.

Generate ministry-safe performance phrasing to support a Gospel magic illustration.

Context:
- Ministry Tone: ${ministryTone}
- Phrase Tone: ${phraseTone}
- Scripture (optional): ${passage?.trim() || '(none)'}
- Theme / Effect (optional): ${theme?.trim() || '(none)'}
- Selected categories: ${selected}
- Phrases per category: ${phrasesPerCategory}

Guidelines:
- Keep phrases respectful, non-manipulative, and appropriate for church/ministry settings.
- Match the requested phrase tone while remaining humble and speakable.
- Do NOT claim supernatural power or performer authority.
- Do NOT include exposure of magic methods.
- Keep phrases usable on stage (short, speakable).
- Scripture transition lines should help move naturally from illustration to Bible text.
- Humble closing lines should end with reverence, humility, and message-centered focus.
${doctrinalGuardrails}${ministrySensitivityGuardrails}

Populate arrays for categories the user selected; for unselected categories, return an empty array.
`;

      const response = await generateStructuredResponse(
        prompt,
        GOSPEL_MAGIC_SYSTEM_INSTRUCTION,
        ministryPhrasesSchema,
        currentUser || { email: '', membership: 'free', generationCount: 0, lastResetDate: '' }
      );

      const nextPhrases = response as MinistryPhrasesResult;
      setPhrasesResult(nextPhrases);
      const phraseUnits = [
        nextPhrases.bridge_phrases,
        nextPhrases.reflection_questions,
        nextPhrases.gentle_invitations,
        nextPhrases.clarity_disclaimers,
        nextPhrases.encouragement_lines,
        nextPhrases.scripture_transition_lines,
        nextPhrases.humble_closing_lines,
      ].reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
      trackGospelEvent('gospel_magic_phrase_builder_success', { outcome: 'SUCCESS_NOT_CHARGED', units: phraseUnits });
    } catch (err: any) {
      trackGospelEvent('gospel_magic_phrase_builder_error', { outcome: 'ERROR_UPSTREAM', error_code: 'phrase_builder_error', retryable: true });
      setPhrasesError(err instanceof Error ? err.message : 'Unable to generate phrases.');
    } finally {
      setIsPhrasesLoading(false);
    }
  };



  const renderBlueprint = () => {
    if (!blueprint) return null;

    return (
      <div className="space-y-3 p-4 pt-3 overflow-y-auto">
        <div className="rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-slate-900/70 to-emerald-500/10 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span className="px-2.5 py-1 rounded-full border border-amber-400/30 bg-amber-500/10 text-amber-100">Scripture-Centered Illustration Builder</span>
            <span className="px-2.5 py-1 rounded-full border border-slate-700 bg-slate-900/70">Ministry Context: {blueprint.ministry_use_case || ministryTone}</span>
            <span className="px-2.5 py-1 rounded-full border border-slate-700 bg-slate-900/70">Phrase Tone: {phraseTone}</span>
            <span className={`px-2.5 py-1 rounded-full border ${doctrinalMode ? 'border-amber-400/30 bg-amber-500/10 text-amber-100' : 'border-slate-700 bg-slate-900/70 text-slate-400'}`}>
              Doctrinal Integrity: {doctrinalMode ? 'On' : 'Off'}
            </span>
            <span className={`px-2.5 py-1 rounded-full border ${ministrySensitivityMode ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100' : 'border-slate-700 bg-slate-900/70 text-slate-400'}`}>
              Ministry Sensitivity: {ministrySensitivityMode ? 'On' : 'Off'}
            </span>
          </div>
        </div>

        <div className="mt-2">
          <MinistryLayerVisualizer />
        </div>

        <Card title="Effect Summary" defaultOpen>
          <div className="space-y-3">
            <div>
              <p className="text-slate-400 text-xs">Theological theme</p>
              <p className="whitespace-pre-wrap">{blueprint.theological_theme}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Effect fit assessment</p>
              <p className="whitespace-pre-wrap">{blueprint.effect_fit_assessment}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Ministry use case</p>
              <p className="whitespace-pre-wrap">{blueprint.ministry_use_case}</p>
            </div>
          </div>
        </Card>

        <Card title="Scripture Focus" defaultOpen>
          <p className="whitespace-pre-wrap">{blueprint.scripture_focus}</p>
        </Card>

        <Card title="Central Truth" defaultOpen>
          <p className="whitespace-pre-wrap">{blueprint.central_truth}</p>
        </Card>

        <Card title="Why This Effect Serves the Message" defaultOpen>
          <div className="space-y-3">
            <div>
              <p className="text-slate-400 text-xs">Why this illustration works</p>
              <p className="whitespace-pre-wrap">{blueprint.why_this_effect_serves_the_message?.why_this_illustration_works}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">What part of the message it supports</p>
              <p className="whitespace-pre-wrap">{blueprint.why_this_effect_serves_the_message?.message_support}</p>
            </div>
            {!!blueprint.why_this_effect_serves_the_message?.should_not_imply?.length && (
              <div>
                <p className="text-slate-400 text-xs">What it should not imply</p>
                <ul className="list-disc ml-5 mt-1 space-y-1">
                  {blueprint.why_this_effect_serves_the_message.should_not_imply.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="text-slate-400 text-xs">How to introduce it humbly</p>
              <p className="whitespace-pre-wrap">{blueprint.why_this_effect_serves_the_message?.humble_introduction}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">How to transition back to Scripture</p>
              <p className="whitespace-pre-wrap">{blueprint.why_this_effect_serves_the_message?.scripture_transition}</p>
            </div>
          </div>
        </Card>

        <Card title="Message Construction" defaultOpen>
          <div className="space-y-3">
            {(blueprint.routine_structure || []).map((p, idx) => (
              <div key={`${p.title}-${idx}`} className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                <p className="text-slate-200 font-semibold">
                  {idx + 1}. {p.title}
                </p>

                <div className="mt-2">
                  <p className="text-slate-400 text-xs">Stage action</p>
                  <p className="whitespace-pre-wrap">{p.stage_action}</p>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-slate-400 text-xs">Illustration</p>
                    <p className="whitespace-pre-wrap">{p.illustration}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Teaching point</p>
                    <p className="whitespace-pre-wrap">{p.teaching_point}</p>
                  </div>
                </div>

                {!!p.suggested_lines?.length && (
                  <div className="mt-3">
                    <p className="text-slate-400 text-xs">Suggested lines</p>
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

        <Card title="Ministry Use Case & Effect Fit">
          <div className="space-y-3">
            <div>
              <p className="text-slate-400 text-xs">Best ministry setting</p>
              <p className="whitespace-pre-wrap">{blueprint.ministry_use_case}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Why this effect fits</p>
              <p className="whitespace-pre-wrap">{blueprint.effect_fit_assessment}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Illustration bridge</p>
              <p className="whitespace-pre-wrap">{blueprint.illustration_bridge}</p>
            </div>
          </div>
        </Card>

        <Card title="Reverence Risk Notes">
          <ul className="list-disc ml-5 space-y-1">
            {(blueprint.reverence_risk_notes || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>

        <Card title="Performer Humility Lines">
          <ul className="list-disc ml-5 space-y-1">
            {(blueprint.performer_humility_lines || []).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </Card>

        <Card title="Scripture Handling Notes">
          <p className="whitespace-pre-wrap">{blueprint.scripture_handling_notes}</p>
        </Card>

        <Card title="Ministry Clarity Review">
          {!stressReport && (
            <p className="text-slate-400 text-sm">
              Run a ministry-aware review to identify where the message may feel unclear, overly showy, or pastorally risky, and how to make it gentler and clearer.
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
                  <p className="text-slate-400 text-xs">Where clarity may break down</p>
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
                  <p className="text-slate-400 text-xs">Perspective notes</p>
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

        <Card title="Phrase Builder Output">
          {renderPhraseResultSections(phrasesResult)}
        </Card>

        <Card title="Practical Ministry Guidance">
          <div className="space-y-4">
            <div>
              <p className="text-slate-400 text-xs">Pastoral tone guidance</p>
              <p className="whitespace-pre-wrap">{blueprint.pastoral_tone_guidance}</p>
            </div>

            <div>
              <p className="text-slate-400 text-xs">Emotional arc</p>
              <ul className="list-disc ml-5 space-y-1">
                {(blueprint.emotional_arc || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-slate-400 text-xs">Altar call sensitivity</p>
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
            </div>

            <div>
              <p className="text-slate-400 text-xs">Age adjustments</p>
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
            </div>

            <div>
              <p className="text-slate-400 text-xs">Potential misinterpretations</p>
              <ul className="list-disc ml-5 space-y-1">
                {(blueprint.potential_misinterpretations || []).map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-slate-400 text-xs">Closing prayer option</p>
              <p className="whitespace-pre-wrap">{blueprint.closing_prayer_option}</p>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className="flex-1 lg:grid lg:grid-cols-2 gap-6 overflow-y-auto p-4 pt-4 md:p-6 md:pt-6">
      {/* Control Panel */}
      <div className="flex flex-col">
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-slate-900/80 to-emerald-500/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-amber-200">Ministry Architecture Lab</h2>
            <span className="px-2.5 py-1 rounded-full border border-amber-400/30 bg-amber-500/10 text-[11px] font-semibold text-amber-100">
              Message-First Ministry Tool
            </span>
          </div>
          <p className="text-slate-300 mt-2">
            Scripture-Centered Illustration Builder
          </p>
          <p className="text-slate-400 mt-1 text-sm">
            Designed to support biblical communication with humility and clarity.
          </p>
        </div>

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

          <label className={`flex items-start gap-3 rounded-lg border bg-slate-900/40 p-3 transition-shadow ${doctrinalMode ? "border-amber-500/50 shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_0_20px_rgba(245,158,11,0.12)]" : "border-slate-700"}`}>
            <input
              type="checkbox"
              checked={doctrinalMode}
              onChange={(e) => setDoctrinalMode(e.target.checked)}
              className="mt-1 accent-amber-400"
            />
            <div>
              <p className="text-sm font-semibold text-slate-200">Respect Doctrinal Integrity</p>
              <p className="text-xs text-slate-400 mt-1">
                Avoid theological overreach, prosperity-style promises, implying performer authority, or emotionally manipulative language.
              </p>
            </div>
          </label>

          <label className={`flex items-start gap-3 rounded-lg border bg-slate-900/40 p-3 transition-shadow ${ministrySensitivityMode ? "border-emerald-500/50 shadow-[0_0_0_1px_rgba(16,185,129,0.22),0_0_20px_rgba(16,185,129,0.10)]" : "border-slate-700"}`}>
            <input
              type="checkbox"
              checked={ministrySensitivityMode}
              onChange={(e) => setMinistrySensitivityMode(e.target.checked)}
              className="mt-1 accent-emerald-400"
            />
            <div>
              <p className="text-sm font-semibold text-slate-200">Respect Ministry Sensitivity</p>
              <p className="text-xs text-slate-400 mt-1">
                Avoid emotional pressure, miracle implication, spiritual overclaiming, using tricks as proof, or embarrassing volunteers.
              </p>
            </div>
          </label>

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/20 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Ministry Phrase Builder</p>
              <p className="text-[10px] text-slate-500">mini-tool</p>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Generate respectful, message-safe lines for transitions, Scripture moments, reflection, and humble closings (no method exposure).
            </p>

            <div className="mt-3">
              <label htmlFor="phrase-tone" className="block text-xs font-medium text-slate-300 mb-1">
                Phrase Tone
              </label>
              <select
                id="phrase-tone"
                value={phraseTone}
                onChange={(e) => setPhraseTone(e.target.value as PhraseTone)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm focus:outline-none focus:border-purple-500 transition-colors"
              >
                {PHRASE_TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </div>

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
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.encouragement_lines}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, encouragement_lines: e.target.checked }))}
                  className="accent-purple-500"
                />
                Encouragement lines
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.scripture_transition_lines}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, scripture_transition_lines: e.target.checked }))}
                  className="accent-purple-500"
                />
                Scripture transition lines
              </label>
              <label className="flex items-center gap-2 col-span-2">
                <input
                  type="checkbox"
                  checked={phraseSelection.humble_closing_lines}
                  onChange={(e) => setPhraseSelection((p) => ({ ...p, humble_closing_lines: e.target.checked }))}
                  className="accent-purple-500"
                />
                Humble closing lines
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
                    ['Scripture transition lines', phrasesResult.scripture_transition_lines],
                    ['Humble closing lines', phrasesResult.humble_closing_lines],
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


          <button
            onClick={() => handleGenerate()}
            disabled={isLoading || !isFormValid}
            className="w-full py-3 mt-2 flex items-center justify-center gap-2 rounded-md font-bold transition-colors bg-gradient-to-r from-amber-700 to-amber-600 text-slate-950 shadow-[0_0_0_1px_rgba(245,158,11,0.28),0_10px_30px_rgba(245,158,11,0.10)] hover:from-amber-600 hover:to-amber-500 disabled:from-slate-600 disabled:to-slate-600 disabled:text-slate-300 disabled:shadow-none disabled:cursor-not-allowed"
          >
            <WandIcon className="w-5 h-5" />
            <span>Build Ministry Blueprint</span>
          </button>

          <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
            <p className="text-xs text-slate-300">
              Designed to support Scripture-centered presentation, not replace pastoral leadership.
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Use illustration carefully so the truth remains central.
            </p>
          </div>

          {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}

          <div className="pt-4">
            <h3 className="text-sm font-semibold text-slate-400 mb-2 text-center">Try a ministry-ready example...</h3>
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
            <div className="sticky bottom-0 right-0 mt-auto p-2 bg-slate-900/60 flex items-center justify-between gap-2 border-t border-slate-800">
              <p className="hidden md:block text-xs text-slate-400 pl-1">
                Next step: Move this into your working show.
              </p>

              <div className="flex items-center justify-end gap-2 flex-wrap">
                <CohesionActions
                  content={toMarkdownBlueprint(lastQuery, ministryTone, doctrinalMode, ministrySensitivityMode, blueprint)}
                  defaultTitle={`Gospel Blueprint — ${lastQuery || 'Untitled'}`}
                  defaultTags={["gospel", "ministry", "blueprint"]}
                  compact
                />
                <button
                  onClick={handleSendToShowPlanner}
                  disabled={isSendingToPlanner || !blueprint}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md font-semibold bg-gradient-to-r from-amber-700 to-amber-600 text-slate-950 shadow-[0_0_0_1px_rgba(245,158,11,0.28),0_10px_30px_rgba(245,158,11,0.10)] hover:from-amber-600 hover:to-amber-500 transition-all hover:shadow-[0_0_0_1px_rgba(245,158,11,0.35),0_14px_40px_rgba(245,158,11,0.16)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  title="Create a Show + tasks in Show Planner from this ministry blueprint"
                >
                  {isSendingToPlanner ? (
                    <>
                      <div className="w-4 h-4 border-t-2 border-slate-950/80 rounded-full animate-spin" />
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
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                  title="Jump into Live Rehearsal with this blueprint preloaded"
                >
                  {isPreparingRehearsal ? (
                    <>
                      <div className="w-4 h-4 border-t-2 border-white/80 rounded-full animate-spin" />
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
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  title="Review for clarity, sensitivity, and where confusion or skepticism may arise"
                >
                  <span className="text-base leading-none">🔍</span>
                  <span>{isStressLoading ? 'Reviewing…' : 'Run Clarity Review'}</span>
                </button>

                <div className="hidden sm:block w-px self-stretch bg-slate-800 mx-1" />

                <ShareButton
                  title={`Ministry Blueprint: ${lastQuery}`}
                  text={toMarkdownBlueprint(lastQuery, ministryTone, doctrinalMode, ministrySensitivityMode, blueprint)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-transparent border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white rounded-md transition-colors"
                >
                  <ShareIcon className="w-4 h-4" />
                  <span>Share</span>
                </ShareButton>

                <button
                  onClick={handleSave}
                  disabled={saveStatus === 'saved'}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-transparent border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white rounded-md transition-colors disabled:cursor-default disabled:opacity-80"
                  title="Save this blueprint to your idea library"
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
                <MinistryLayerVisualizer compact />
              </div>
              <p className="text-slate-300 font-semibold">Your ministry blueprint will appear here.</p>
              <p className="text-slate-500 text-sm mt-2">
                Build a ministry illustration that serves the message, supports Scripture, and remains pastorally sensitive.
              </p>
              <p className="text-slate-500 text-xs mt-2">
                Start with a Scripture reference or a message theme, then shape a message-first routine with humility and clarity.
              </p>
              <div className="mt-4 text-xs text-slate-500">
                <p className="italic opacity-60 tracking-wider text-amber-200/70">“Let all things be done decently and in order.”</p>
                <p className="mt-1 text-amber-200/40">(1 Corinthians 14:40)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GospelMagicAssistant;
