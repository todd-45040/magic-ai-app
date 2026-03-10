import React, { useEffect, useMemo, useState } from "react";
import type { PropBuildInstructions, PropConcept, Task, User } from "../types";
import { saveIdea } from "../services/ideasService";
import { createShow, addTasksToShow } from "../services/showsService";
import { useAppDispatch, refreshIdeas, refreshShows } from "../store";
import ShareButton from "./ShareButton";
import { trackClientEvent } from "../services/telemetryClient";

type Props = {
  user?: User;
  onIdeaSaved?: () => void;
  onNavigateShowPlanner?: () => void;
  onNavigateDirectorMode?: () => void;
};

type SectionKey = "concept" | "use" | "construction" | "materials" | "cost" | "transport" | "safety" | "build";

type ResultSection = {
  key: SectionKey;
  title: string;
  content: React.ReactNode;
};

const defaultOpen = new Set<SectionKey>(["concept"]);

const demoInputs = {
  propType: "Prediction Chest",
  materials: "Wood + brass",
  skillLevel: "Intermediate",
  audience: "Corporate banquet",
  venue: "Hotel ballroom stage",
  budget: "$150",
  transport: "Carry-on suitcase",
  reset: "Instant",
};

const demoResult: PropConcept = {
  propName: "Locked Prediction Chest",
  conceptSummary: "A polished wooden prediction chest with engraved brass plates and a velvet-lined interior, designed to deliver a premium corporate reveal on stage.",
  performanceUse: "Used as a centerpiece prediction prop for a corporate banquet finale, allowing a visible sealed prediction to be opened in a dramatic, elegant moment.",
  constructionIdea: "Build a compact hardwood chest with decorative brass hardware, a hidden interior load chamber, and a soft velvet insert that frames the final reveal.",
  materials: ["Hardwood box blank", "Brass corner hardware", "Decorative brass name plate", "Velvet lining", "Small lock and key", "Interior divider stock"],
  estimatedCost: "Approximately $120–$150 depending on hardware finish and custom engraving.",
  transportNotes: "Sized to travel inside a padded carry-on case with the prediction load secured separately until setup.",
  resetSpeed: "Fast reset between sets once the interior load is prepped.",
  safetyNotes: ["Round over exposed brass edges to avoid snags.", "Use secure interior fittings so nothing shifts during transport."],
  angleNotes: ["Best presented front-facing on a banquet platform or stage.", "Keep interior handling shielded from extreme side seating during the reveal phase."],
  buildInstructions: null,
};

function parseJsonFromText<T>(text: string): T {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {}
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (match?.[1]) return JSON.parse(match[1]) as T;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
  throw new Error('Could not parse JSON response.');
}

function sanitizeConcept(raw: any): PropConcept {
  const list = (value: any) => Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  const build = raw?.buildInstructions && typeof raw.buildInstructions === 'object' ? {
    toolsRequired: list(raw.buildInstructions.toolsRequired),
    constructionSteps: list(raw.buildInstructions.constructionSteps),
    estimatedBuildTime: String(raw.buildInstructions.estimatedBuildTime ?? '').trim(),
    difficultyRating: String(raw.buildInstructions.difficultyRating ?? '').trim(),
  } satisfies PropBuildInstructions : null;

  return {
    propName: String(raw?.propName ?? 'Untitled Prop Concept').trim() || 'Untitled Prop Concept',
    conceptSummary: String(raw?.conceptSummary ?? '').trim(),
    performanceUse: String(raw?.performanceUse ?? '').trim(),
    constructionIdea: String(raw?.constructionIdea ?? '').trim(),
    materials: list(raw?.materials),
    estimatedCost: String(raw?.estimatedCost ?? '').trim(),
    transportNotes: String(raw?.transportNotes ?? '').trim(),
    resetSpeed: String(raw?.resetSpeed ?? '').trim(),
    safetyNotes: list(raw?.safetyNotes),
    angleNotes: list(raw?.angleNotes),
    buildInstructions: build,
  };
}

function listNode(items: string[], empty = 'Not provided yet.') {
  if (!items.length) return <p className="text-slate-400">{empty}</p>;
  return <ul className="list-disc pl-5 space-y-1 text-slate-200">{items.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}</ul>;
}

function CollapsibleCard({ title, isOpen, onToggle, children }: { title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/30 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/40 transition-colors"
      >
        <span className="font-semibold text-slate-100">{title}</span>
        <span className="text-slate-400 text-sm">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="px-4 pb-4 text-sm leading-6">{children}</div>}
    </div>
  );
}

export default function PropGenerator({ onIdeaSaved, onNavigateShowPlanner, onNavigateDirectorMode }: Props) {
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [buildLoading, setBuildLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PropConcept | null>(null);
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(defaultOpen));

  const [inputs, setInputs] = useState({
    propType: "",
    materials: "",
    skillLevel: "",
    audience: "",
    venue: "",
    budget: "",
    transport: "",
    reset: ""
  });

  function updateInput<K extends keyof typeof inputs>(key: K, value: (typeof inputs)[K]) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }


  const telemetryMetadata = useMemo(() => ({
    prop_type: inputs.propType || 'unspecified',
    skill_level: inputs.skillLevel || 'unspecified',
    budget: inputs.budget || 'unspecified',
    audience_type: inputs.audience || 'unspecified',
    venue_type: inputs.venue || 'unspecified',
    transportable: Boolean(String(inputs.transport || '').trim()),
  }), [inputs]);

  useEffect(() => {
    void trackClientEvent({
      tool: 'prop_generator',
      action: 'prop_generator_opened',
      metadata: telemetryMetadata,
      outcome: 'ALLOWED',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  function resetPage() {
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Reset the Prop Generator and clear the current concept?');
    if (!confirmed) return;
    setInputs({
      propType: "",
      materials: "",
      skillLevel: "",
      audience: "",
      venue: "",
      budget: "",
      transport: "",
      reset: "",
    });
    setResult(null);
    setError(null);
    setOpenSections(new Set(defaultOpen));
    void trackClientEvent({
      tool: 'prop_generator',
      action: 'prop_generator_reset',
      metadata: telemetryMetadata,
      outcome: 'ALLOWED',
    });
  }

  function loadDemoProp() {
    setInputs(demoInputs);
    setResult(demoResult);
    setError(null);
    setOpenSections(new Set(defaultOpen));
    void trackClientEvent({
      tool: 'prop_generator',
      action: 'demo_prop_loaded',
      metadata: {
        prop_type: demoInputs.propType,
        skill_level: demoInputs.skillLevel,
        budget: demoInputs.budget,
        audience_type: demoInputs.audience,
        venue_type: demoInputs.venue,
        transportable: true,
        prop_name: demoResult.propName,
      },
      outcome: 'ALLOWED',
    });
  }

  async function callGenerate(prompt: string) {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const text = await r.text();
    if (!r.ok) throw new Error(text || 'Generation failed');
    return text;
  }

  async function generate(mode: 'base' | 'alternate' = 'base') {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const prompt = `Design a magic performance prop.

Return JSON ONLY using this schema:
{
  "propName":"",
  "conceptSummary":"",
  "performanceUse":"",
  "constructionIdea":"",
  "materials":[],
  "estimatedCost":"",
  "transportNotes":"",
  "resetSpeed":"",
  "safetyNotes":[],
  "angleNotes":[]
}

Keep it practical, non-exposure, and suitable for a magician building or commissioning a prop.
${mode === 'alternate' && result ? `Generate a distinctly different alternate design from this existing concept, while keeping it appropriate for the same performance context:
${JSON.stringify(result, null, 2)}
` : ''}
Inputs:
Prop Type: ${inputs.propType}
Materials: ${inputs.materials}
Skill Level: ${inputs.skillLevel}
Audience: ${inputs.audience}
Venue: ${inputs.venue}
Budget: ${inputs.budget}
Transport: ${inputs.transport}
Reset: ${inputs.reset}`;

      const text = await callGenerate(prompt);
      const json = parseJsonFromText<any>(text);
      const concept = sanitizeConcept(json);
      setResult(concept);
      setOpenSections(new Set(defaultOpen));
      await trackClientEvent({
        tool: 'prop_generator',
        action: mode === 'alternate' ? 'prop_alternate_generated' : 'prop_generated',
        metadata: { ...telemetryMetadata, prop_name: concept.propName },
        outcome: 'SUCCESS_NOT_CHARGED',
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function generateBuildInstructions() {
    if (!result || buildLoading) return;
    setBuildLoading(true);
    setError(null);
    try {
      const prompt = `You are helping a magician plan safe, practical build instructions for a custom performance prop.

Return JSON ONLY using this schema:
{
  "toolsRequired": [],
  "constructionSteps": [],
  "estimatedBuildTime": "",
  "difficultyRating": ""
}

Base prop concept:
${JSON.stringify(result, null, 2)}

Original constraints:
${JSON.stringify(inputs, null, 2)}

Requirements:
- Keep the advice high-level and non-exposure.
- Focus on materials prep, fabrication sequence, assembly order, finishing, transport readiness, and rehearsal readiness.
- Do not include dangerous or illegal instructions.
`;
      const text = await callGenerate(prompt);
      const build = parseJsonFromText<PropBuildInstructions>(text);
      setResult((prev) => prev ? ({ ...prev, buildInstructions: {
        toolsRequired: Array.isArray(build.toolsRequired) ? build.toolsRequired.map(String) : [],
        constructionSteps: Array.isArray(build.constructionSteps) ? build.constructionSteps.map(String) : [],
        estimatedBuildTime: String(build.estimatedBuildTime ?? '').trim(),
        difficultyRating: String(build.difficultyRating ?? '').trim(),
      } }) : prev);
      setOpenSections((prev) => new Set([...Array.from(prev), 'build']));
      await trackClientEvent({
        tool: 'prop_generator',
        action: 'prop_build_instructions_generated',
        metadata: { ...telemetryMetadata, prop_name: result.propName },
        outcome: 'SUCCESS_NOT_CHARGED',
      });
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Build instruction generation failed');
    } finally {
      setBuildLoading(false);
    }
  }

  async function saveToIdeas() {
    if (!result) return;
    try {
      await saveIdea({
        type: 'text',
        title: `Prop Concept: ${result.propName}`,
        content: JSON.stringify(result, null, 2),
        tags: ['prop-generator', 'prop-concept'],
        category: 'blueprint',
      });
      await refreshIdeas(dispatch);
      await trackClientEvent({
        tool: 'prop_generator',
        action: 'prop_saved_to_ideas',
        metadata: { ...telemetryMetadata, prop_name: result.propName },
        outcome: 'SUCCESS_NOT_CHARGED',
      });
      onIdeaSaved?.();
    } catch (e: any) {
      setError(e?.message || 'Could not save concept.');
    }
  }

  async function sendToShowPlanner() {
    if (!result) return;
    try {
      const show = await createShow(result.propName, 'Auto-created from Prop Generator');
      const tasks: Partial<Task>[] = [
        { title: 'Review prop concept', notes: result.conceptSummary, status: 'To-Do', priority: 'Medium', tags: ['prop-generator'] },
        { title: 'Source materials', notes: result.materials.join('\n'), status: 'To-Do', priority: 'Medium', tags: ['prop-generator'] },
        { title: 'Build / commission prop', notes: result.constructionIdea, status: 'To-Do', priority: 'High', tags: ['prop-generator'] },
        { title: 'Rehearse reset and transport', notes: `${result.transportNotes}\n\nReset: ${result.resetSpeed}`, status: 'To-Do', priority: 'Medium', tags: ['prop-generator'] },
      ];
      if (result.buildInstructions?.constructionSteps?.length) {
        tasks.push({ title: 'Follow build steps', notes: result.buildInstructions.constructionSteps.join('\n'), status: 'To-Do', priority: 'High', tags: ['prop-generator', 'build-instructions'] });
      }
      await addTasksToShow(show.id, tasks);
      await refreshShows(dispatch);
      await trackClientEvent({
        tool: 'prop_generator',
        action: 'prop_added_to_show',
        metadata: { ...telemetryMetadata, prop_name: result.propName, show_id: show.id },
        outcome: 'SUCCESS_NOT_CHARGED',
      });
      onNavigateShowPlanner?.();
    } catch (e: any) {
      setError(e?.message || 'Could not send to Show Planner.');
    }
  }


  async function sendToDirectorMode() {
    if (!result) return;
    try {
      await saveIdea({
        type: 'text',
        title: `Director Seed: ${result.propName}`,
        content: JSON.stringify({ inputs, result }, null, 2),
        tags: ['prop-generator', 'director-mode', 'prop-concept'],
        category: 'blueprint',
      });
      await refreshIdeas(dispatch);
      await trackClientEvent({
        tool: 'prop_generator',
        action: 'prop_sent_to_director',
        metadata: { ...telemetryMetadata, prop_name: result.propName },
        outcome: 'SUCCESS_NOT_CHARGED',
      });
      onNavigateDirectorMode?.();
    } catch (e: any) {
      setError(e?.message || 'Could not send to Director Mode.');
    }
  }

  const sections = useMemo<ResultSection[]>(() => {
    if (!result) return [];
    return [
      { key: 'concept', title: 'Prop Concept', content: <div><h2 className="text-xl font-semibold text-slate-100 mb-2">{result.propName}</h2><p className="text-slate-200">{result.conceptSummary || 'No summary generated yet.'}</p></div> },
      { key: 'use', title: 'Performance Use', content: <p className="text-slate-200">{result.performanceUse || 'No performance use generated yet.'}</p> },
      { key: 'construction', title: 'Construction Plan', content: <p className="text-slate-200">{result.constructionIdea || 'No construction plan generated yet.'}</p> },
      { key: 'materials', title: 'Materials List', content: listNode(result.materials, 'No materials listed yet.') },
      { key: 'cost', title: 'Cost Estimate', content: <p className="text-slate-200">{result.estimatedCost || 'No cost estimate generated yet.'}</p> },
      { key: 'transport', title: 'Transport & Reset', content: <div className="space-y-3 text-slate-200"><div><div className="font-semibold text-slate-100 mb-1">Transport Notes</div><p>{result.transportNotes || 'No transport notes generated yet.'}</p></div><div><div className="font-semibold text-slate-100 mb-1">Reset Speed</div><p>{result.resetSpeed || 'No reset notes generated yet.'}</p></div></div> },
      { key: 'safety', title: 'Safety & Angles', content: <div className="space-y-3"><div><div className="font-semibold text-slate-100 mb-1">Safety Notes</div>{listNode(result.safetyNotes, 'No safety notes generated yet.')}</div><div><div className="font-semibold text-slate-100 mb-1">Angle Notes</div>{listNode(result.angleNotes, 'No angle notes generated yet.')}</div></div> },
      { key: 'build', title: 'Build Instructions', content: result.buildInstructions ? <div className="space-y-3"><div><div className="font-semibold text-slate-100 mb-1">Tools Required</div>{listNode(result.buildInstructions.toolsRequired, 'No tools listed yet.')}</div><div><div className="font-semibold text-slate-100 mb-1">Construction Steps</div>{listNode(result.buildInstructions.constructionSteps, 'No build steps generated yet.')}</div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div className="text-xs uppercase tracking-wide text-slate-400">Estimated Build Time</div><div className="text-slate-100 font-semibold mt-1">{result.buildInstructions.estimatedBuildTime || 'Not provided'}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950/30 p-3"><div className="text-xs uppercase tracking-wide text-slate-400">Difficulty Rating</div><div className="text-slate-100 font-semibold mt-1">{result.buildInstructions.difficultyRating || 'Not provided'}</div></div></div></div> : <p className="text-slate-400">Click Generate Build Instructions to add a practical build plan.</p> },
    ];
  }, [result]);

  const hasResult = Boolean(result);

  return (
    <div className="w-full h-full p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-100">Prop Generator</h1>
          <p className="text-slate-400 mt-2 max-w-3xl">Design practical performance props with a structured AI workspace, then expand the concept into build-ready instructions.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadDemoProp}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 transition"
          >
            🎭 Load Demo Prop
          </button>
          <button
            type="button"
            onClick={resetPage}
            className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition"
          >
            Reset Page
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-5 md:p-6 space-y-4">
          <div>
            <div className="text-lg font-semibold text-slate-100">Prop Design Inputs</div>
            <div className="text-sm text-slate-400 mt-1">Define the practical constraints so the concept fits your performance world.</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              ['propType','Prop Type'],
              ['materials','Materials / constraints'],
              ['skillLevel','Skill Level'],
              ['audience','Audience Type'],
              ['venue','Performance Setting'],
              ['budget','Budget Range'],
              ['transport','Transportability'],
              ['reset','Reset Speed'],
            ].map(([key,label]) => (
              <label key={key} className={key === 'materials' ? 'md:col-span-2' : ''}>
                <div className="text-sm font-medium text-slate-300 mb-1">{label}</div>
                <input
                  value={inputs[key as keyof typeof inputs]}
                  onChange={e => updateInput(key as keyof typeof inputs, e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  placeholder={label}
                />
              </label>
            ))}
          </div>

          {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

          <button
            onClick={generate}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-xl w-full font-semibold transition disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Prop"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/20 p-5 md:p-6 flex flex-col min-h-[560px]">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <div className="text-lg font-semibold text-slate-100">Generated Prop Concept</div>
              <div className="text-sm text-slate-400 mt-1">Collapsible result cards keep the workspace compact and easy to scan.</div>
            </div>
            {hasResult && (
              <button
                type="button"
                onClick={generateBuildInstructions}
                disabled={buildLoading}
                className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition disabled:opacity-50"
              >
                {buildLoading ? 'Generating...' : 'Generate Build Instructions'}
              </button>
            )}
          </div>

          {!hasResult ? (
            <div className="flex-1 rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/20 flex items-center justify-center text-center text-slate-500 p-8">
              Generated prop concept will appear here.
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {sections.map((section) => (
                  <CollapsibleCard
                    key={section.key}
                    title={section.title}
                    isOpen={openSections.has(section.key)}
                    onToggle={() => setOpenSections((prev) => { const next = new Set(prev); next.has(section.key) ? next.delete(section.key) : next.add(section.key); return next; })}
                  >
                    {section.content}
                  </CollapsibleCard>
                ))}
              </div>

              <div className="border-t border-slate-800 mt-4 pt-4 flex flex-wrap gap-3">
                <button type="button" onClick={saveToIdeas} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition">Save to Idea Vault</button>
                <button type="button" onClick={sendToDirectorMode} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition">Send to Director Mode</button>
                <button type="button" onClick={sendToShowPlanner} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition">Add to Show Planner</button>
                <button type="button" onClick={() => generate('alternate')} disabled={loading} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition disabled:opacity-50">Generate Alternate Design</button>
                <ShareButton title={result?.propName || 'Prop Concept'} text={JSON.stringify(result, null, 2)} className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-800/50 transition">Share</ShareButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
