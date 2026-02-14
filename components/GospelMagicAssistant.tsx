import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { GOSPEL_MAGIC_SYSTEM_INSTRUCTION } from '../constants';
import { WandIcon, SaveIcon, CheckIcon, ShareIcon } from './icons';
import ShareButton from './ShareButton';
import { useAppState } from '../store';

interface GospelMagicAssistantProps {
  onIdeaSaved: () => void;
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
              <div className="mx-auto mb-4 w-14 h-14 rounded-2xl border border-slate-700 bg-slate-900/60 flex items-center justify-center">
                <WandIcon className="w-7 h-7 text-slate-300" />
              </div>
              <p className="text-slate-300 font-semibold">Your ministry blueprint will appear here.</p>
              <p className="text-slate-500 text-sm mt-2">
                Start with a Scripture reference or a message theme, choose the ministry tone, and generate a structured routine you can trust.
              </p>
              <div className="mt-4 text-xs text-slate-500">
                <p className="italic">“Let all things be done decently and in order.”</p>
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
