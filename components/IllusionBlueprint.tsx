import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Type } from '@google/genai';

import { generateImage, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import type { User } from '../types';
import { BlueprintIcon, WandIcon, SaveIcon, CheckIcon } from './icons';

interface IllusionBlueprintProps {
  user: User;
  onIdeaSaved: () => void;
}

type SaveStatus = 'idle' | 'saved';

type StagingBlueprint = {
  potential_principles: { name: string; description: string }[];
  blueprint_description: string;
};

type BuildBlueprintPack = {
  title: string;
  intended_effect: string;
  overall_dimensions: {
    width_in: number;
    depth_in: number;
    height_in: number;
    width_mm: number;
    depth_mm: number;
    height_mm: number;
    target_weight_lb?: number;
    target_weight_kg?: number;
    tolerance_in?: number;
    tolerance_mm?: number;
  };
  breakdown_modules: { id: string; name: string; notes: string; approx_weight_lb?: number; applies_to?: string[] }[];
  mechanism_options: {
    id: string;
    name: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    description: string;
    key_components: string[];
    pros: string[];
    cons: string[];
  }[];
  materials: { item: string; spec: string; qty: number; notes?: string; applies_to?: string[] }[];
  hardware: { item: string; spec: string; qty: number; notes?: string; applies_to?: string[] }[];
  cut_list: { part: string; material: string; thickness: string; qty: number; size_in: string; size_mm: string; notes?: string; applies_to?: string[] }[];
  assembly_steps: { step: number; text: string; applies_to?: string[] }[];
  safety_notes: string[];
  build_notes: string[];
};

// NOTE: Keep this in sync with your benchmark tag.
// If you prefer env-driven versioning, set VITE_APP_VERSION in Vercel/Env.
const APP_VERSION = 'v0.91 Beta';

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8 h-full">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Generating Illusion Blueprint…</p>
    <p className="text-slate-400 text-sm">This involves multiple AI steps and may take a moment.</p>
  </div>
);

const SECTION_IDS = [
  { id: 'concept', label: 'Concept Art' },
  { id: 'principles', label: 'Principles' },
  { id: 'staging', label: 'Staging' },
  { id: 'buildpack', label: 'Build Pack' },
  { id: 'cutlist', label: 'Cut List' },
  { id: 'assembly', label: 'Assembly' },
  { id: 'safety', label: 'Safety' },
  { id: 'json', label: 'Raw JSON' },
] as const;

type SectionId = (typeof SECTION_IDS)[number]['id'];

const CollapsibleSection: React.FC<{
  id: SectionId;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, title, isOpen, onToggle, children }) => (
  <section id={id} className="scroll-mt-24">
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 text-left cursor-pointer select-none"
        aria-expanded={isOpen}
        aria-controls={`${id}-panel`}
      >
        <h3 className="text-lg font-bold text-white font-cinzel">{title}</h3>
        <span className={`text-slate-400 text-sm transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>
    </div>
    {isOpen ? (
      <div id={`${id}-panel`} className="mt-3">
        {children}
      </div>
    ) : null}
  </section>
);

const BUILD_BLUEPRINT_SYSTEM_INSTRUCTION = `You are a theatrical illusion prop fabricator and technical designer.

Your job: output a construction-ready blueprint pack for a stage illusion prop based on the user's concept.

STRICT OUTPUT RULES:
- Output ONLY valid JSON. No markdown. No backticks.
- Use BOTH inches and millimeters for key dimensions.
- Keep measurements realistic and buildable with common materials (plywood, 2x lumber, hinges, screws, casters).
- The blueprint should be portable for stage use when possible (modules/breakdown).
- Include multiple mechanism options and tag parts/steps by mechanism option id.

MECHANISM TAGGING (critical):
- For each of these arrays: breakdown_modules, materials, hardware, cut_list, assembly_steps, include optional applies_to:["<mechanism_id>"] when something is specific to a mechanism.
- If an item applies to ALL mechanisms, omit applies_to.

SAFETY:
- Include stability and pinch-point notes. Avoid dangerous instructions (no weapons, no explosives).

Return JSON matching the provided schema exactly.`;

const IllusionBlueprint: React.FC<IllusionBlueprintProps> = ({ user, onIdeaSaved }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conceptArt, setConceptArt] = useState<string | null>(null);
  const [stagingBlueprint, setStagingBlueprint] = useState<StagingBlueprint | null>(null);
  const [buildPack, setBuildPack] = useState<BuildBlueprintPack | null>(null);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const [activeSection, setActiveSection] = useState<string>('concept');
  const [selectedMechanismId, setSelectedMechanismId] = useState<string>('all');

  const [openSections, setOpenSections] = useState<Record<SectionId, boolean>>({
    concept: true,
    principles: true,
    staging: true,
    buildpack: true,
    cutlist: true,
    assembly: true,
    safety: true,
    json: false,
  });

  const [jsonCopyStatus, setJsonCopyStatus] = useState<'idle' | 'copied'>('idle');

  const containerRef = useRef<HTMLDivElement | null>(null);

  const stagingSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        potential_principles: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ['name', 'description'],
          },
        },
        blueprint_description: { type: Type.STRING },
      },
      required: ['potential_principles', 'blueprint_description'],
    }),
    []
  );

  const buildPackSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        intended_effect: { type: Type.STRING },
        overall_dimensions: {
          type: Type.OBJECT,
          properties: {
            width_in: { type: Type.NUMBER },
            depth_in: { type: Type.NUMBER },
            height_in: { type: Type.NUMBER },
            width_mm: { type: Type.NUMBER },
            depth_mm: { type: Type.NUMBER },
            height_mm: { type: Type.NUMBER },
            target_weight_lb: { type: Type.NUMBER },
            target_weight_kg: { type: Type.NUMBER },
            tolerance_in: { type: Type.NUMBER },
            tolerance_mm: { type: Type.NUMBER },
          },
          required: ['width_in', 'depth_in', 'height_in', 'width_mm', 'depth_mm', 'height_mm'],
        },
        breakdown_modules: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              notes: { type: Type.STRING },
              approx_weight_lb: { type: Type.NUMBER },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['id', 'name', 'notes'],
          },
        },
        mechanism_options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              name: { type: Type.STRING },
              difficulty: { type: Type.STRING },
              description: { type: Type.STRING },
              key_components: { type: Type.ARRAY, items: { type: Type.STRING } },
              pros: { type: Type.ARRAY, items: { type: Type.STRING } },
              cons: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['id', 'name', 'difficulty', 'description', 'key_components', 'pros', 'cons'],
          },
        },
        materials: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              spec: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              notes: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['item', 'spec', 'qty'],
          },
        },
        hardware: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              spec: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              notes: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['item', 'spec', 'qty'],
          },
        },
        cut_list: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              part: { type: Type.STRING },
              material: { type: Type.STRING },
              thickness: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              size_in: { type: Type.STRING },
              size_mm: { type: Type.STRING },
              notes: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['part', 'material', 'thickness', 'qty', 'size_in', 'size_mm'],
          },
        },
        assembly_steps: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              step: { type: Type.NUMBER },
              text: { type: Type.STRING },
              applies_to: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['step', 'text'],
          },
        },
        safety_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
        build_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        'title',
        'intended_effect',
        'overall_dimensions',
        'breakdown_modules',
        'mechanism_options',
        'materials',
        'hardware',
        'cut_list',
        'assembly_steps',
        'safety_notes',
        'build_notes',
      ],
    }),
    []
  );

  // Sticky mini-nav: update active section using IntersectionObserver
  useEffect(() => {
    if (!conceptArt && !stagingBlueprint && !buildPack) return;

    const root = containerRef.current;
    const targets = SECTION_IDS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];

    if (!targets.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id);
      },
      {
        root,
        threshold: [0.2, 0.35, 0.5, 0.65],
        rootMargin: '-96px 0px -60% 0px',
      }
    );

    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [conceptArt, stagingBlueprint, buildPack]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe your illusion concept.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setConceptArt(null);
    setStagingBlueprint(null);
    setBuildPack(null);
    setSelectedMechanismId('all');
    setActiveSection('concept');
    setOpenSections((prev) => ({
      ...prev,
      concept: true,
      principles: true,
      staging: true,
      buildpack: true,
      cutlist: true,
      assembly: true,
      safety: true,
      json: false,
    }));
    setJsonCopyStatus('idle');
    setSaveStatus('idle');

    const artPrompt = `Dramatic, theatrical concept art for a grand illusion: ${prompt}. Focus on the magical moment from the audience's perspective. Cinematic lighting, professional digital painting style.`;

    const stagingPrompt = `Generate a STAGING blueprint for an illusion concept: "${prompt}". Provide performance-facing principles and a clear staging description.`;

    const buildPrompt = `Create a BUILD BLUEPRINT PACK for this illusion concept: "${prompt}". Provide realistic dimensions and a cut list. Include 3 mechanism options (manual, assisted, motorized) with mechanism ids and tag parts/steps that differ by option.`;

    try {
      const artPromise = generateImage(artPrompt, '16:9', user);
      const stagingPromise = generateStructuredResponse(stagingPrompt, 'You are an expert stage illusion designer.', stagingSchema, user);
      const buildPromise = generateStructuredResponse(buildPrompt, BUILD_BLUEPRINT_SYSTEM_INSTRUCTION, buildPackSchema, user);

      const [artResult, stagingResult, buildResult] = await Promise.all([artPromise, stagingPromise, buildPromise]);

      setConceptArt(artResult);
      setStagingBlueprint(stagingResult as StagingBlueprint);
      setBuildPack(buildResult as BuildBlueprintPack);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const toFiltered = <T extends { applies_to?: string[] }>(arr: T[]): T[] => {
    if (selectedMechanismId === 'all') return arr;
    return arr.filter((x) => !x.applies_to || x.applies_to.includes(selectedMechanismId));
  };

  const filteredModules = useMemo(() => (buildPack ? toFiltered(buildPack.breakdown_modules) : []), [buildPack, selectedMechanismId]);
  const filteredMaterials = useMemo(() => (buildPack ? toFiltered(buildPack.materials) : []), [buildPack, selectedMechanismId]);
  const filteredHardware = useMemo(() => (buildPack ? toFiltered(buildPack.hardware) : []), [buildPack, selectedMechanismId]);
  const filteredCutList = useMemo(() => (buildPack ? toFiltered(buildPack.cut_list) : []), [buildPack, selectedMechanismId]);
  const filteredSteps = useMemo(() => (buildPack ? toFiltered(buildPack.assembly_steps) : []), [buildPack, selectedMechanismId]);

  const handleSave = () => {
    if (!stagingBlueprint || !buildPack) return;

    let fullContent = `## Illusion Blueprint: ${prompt}\n\n`;

    if (conceptArt) {
      fullContent += `![Concept Art](${conceptArt})\n\n`;
    }

    fullContent += `### Potential Principles\n\n`;
    stagingBlueprint.potential_principles.forEach((p) => {
      fullContent += `**${p.name}:** ${p.description}\n\n`;
    });

    fullContent += `### Staging Blueprint\n\n${stagingBlueprint.blueprint_description}\n\n`;

    fullContent += `### Build Blueprint Pack (JSON)\n\n`;
    fullContent += JSON.stringify(buildPack, null, 2);

    saveIdea('text', fullContent, `Illusion Blueprint: ${prompt}`);
    onIdeaSaved();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleStartOver = () => {
    setPrompt('');
    setConceptArt(null);
    setStagingBlueprint(null);
    setBuildPack(null);
    setError(null);
    setSelectedMechanismId('all');
    setActiveSection('concept');
    setOpenSections({
      concept: true,
      principles: true,
      staging: true,
      buildpack: true,
      cutlist: true,
      assembly: true,
      safety: true,
      json: false,
    });
    setJsonCopyStatus('idle');
    setSaveStatus('idle');
  };

  const rawJson = useMemo(() => (buildPack ? JSON.stringify(buildPack, null, 2) : ''), [buildPack]);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(rawJson);
      setJsonCopyStatus('copied');
      setTimeout(() => setJsonCopyStatus('idle'), 1500);
    } catch {
      // fallback: nothing (clipboard may be blocked); user can select/copy manually
    }
  };

  const handleDownloadJson = () => {
    if (!rawJson) return;
    const safeName = (prompt || buildPack?.title || 'illusion-blueprint')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 64);

    const blob = new Blob([rawJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName || 'illusion-blueprint'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const toggleSection = (id: SectionId) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setAllSections = (open: boolean) => {
    setOpenSections({
      concept: open,
      principles: open,
      staging: open,
      buildpack: open,
      cutlist: open,
      assembly: open,
      safety: open,
      // Keep Raw JSON closed by default unless explicitly opened.
      json: open ? openSections.json : false,
    });
  };

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <BlueprintIcon className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Illusion Blueprint Generator</h2>
        </div>
        <p className="text-slate-400 mt-1">From a simple concept to stage-ready plans. Generate concept art, staging, and build-ready construction plans.</p>
      </header>

      {!stagingBlueprint || !buildPack ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-xl">
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setError(null);
              }}
              placeholder="e.g., I want to make a motorcycle appear from a cloud of smoke on an empty stage."
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            <button
              onClick={handleGenerate}
              disabled={isLoading || !prompt.trim()}
              className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
            >
              <WandIcon className="w-5 h-5" />
              <span>{isLoading ? 'Generating…' : 'Generate Blueprint'}</span>
            </button>
            {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
            {isLoading && <LoadingIndicator />}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sticky Mini-Nav */}
          <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-3 bg-slate-950/80 backdrop-blur border-b border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {SECTION_IDS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                    activeSection === s.id
                      ? 'bg-purple-600/30 border-purple-500 text-purple-200'
                      : 'bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {s.label}
                </button>
              ))}

              {/* Mechanism selector (always accessible) */}
              <div className="flex items-center gap-2 ml-1">
                <span className="text-[11px] text-slate-400">Mechanism:</span>
                <select
                  value={selectedMechanismId}
                  onChange={(e) => setSelectedMechanismId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-[11px] rounded-md px-2 py-1 focus:outline-none focus:border-purple-500"
                >
                  <option value="all">All</option>
                  {buildPack.mechanism_options.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expand/collapse controls */}
              <button
                type="button"
                onClick={() => setAllSections(true)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setAllSections(false)}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border bg-slate-900/40 border-slate-700 text-slate-300 hover:border-slate-500"
              >
                Collapse all
              </button>

              <div className="ml-auto text-[11px] text-slate-400">{APP_VERSION}</div>
            </div>
          </div>

          {/* Concept Art */}
          {conceptArt ? (
            <CollapsibleSection
              id="concept"
              title="Concept Art"
              isOpen={openSections.concept}
              onToggle={() => toggleSection('concept')}
            >
              <img
                src={conceptArt}
                alt="Generated concept art for the illusion"
                className="w-full rounded-lg border border-slate-700"
              />
            </CollapsibleSection>
          ) : null}

          {/* Principles */}
          <CollapsibleSection
            id="principles"
            title="Potential Principles"
            isOpen={openSections.principles}
            onToggle={() => toggleSection('principles')}
          >
            <div className="space-y-3">
                {stagingBlueprint.potential_principles.map((principle, i) => (
                  <div key={i} className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                    <h4 className="font-semibold text-purple-300">{principle.name}</h4>
                    <p className="text-sm text-slate-400">{principle.description}</p>
                  </div>
                ))}
            </div>
          </CollapsibleSection>

          {/* Staging */}
          <CollapsibleSection id="staging" title="Staging Blueprint" isOpen={openSections.staging} onToggle={() => toggleSection('staging')}>
            <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
              <pre className="whitespace-pre-wrap break-words text-slate-300 font-sans text-sm">{stagingBlueprint.blueprint_description}</pre>
            </div>
          </CollapsibleSection>

          {/* Build Pack */}
          <CollapsibleSection id="buildpack" title="Build Blueprint Pack" isOpen={openSections.buildpack} onToggle={() => toggleSection('buildpack')}>
            <div className="space-y-4">
                <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <h4 className="text-white font-semibold">{buildPack.title}</h4>
                      <p className="text-slate-300 text-sm mt-1">{buildPack.intended_effect}</p>
                    </div>
                  </div>

                  {/* Dimensions callout */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Width</div>
                      <div className="text-slate-200 font-semibold">{buildPack.overall_dimensions.width_in}"</div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.width_mm} mm</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Depth</div>
                      <div className="text-slate-200 font-semibold">{buildPack.overall_dimensions.depth_in}"</div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.depth_mm} mm</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Height</div>
                      <div className="text-slate-200 font-semibold">{buildPack.overall_dimensions.height_in}"</div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.height_mm} mm</div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-700/50 rounded-md p-3">
                      <div className="text-xs text-slate-400">Tolerance</div>
                      <div className="text-slate-200 font-semibold">
                        {(buildPack.overall_dimensions.tolerance_in ?? 0.125).toFixed(3)}"
                      </div>
                      <div className="text-xs text-slate-400">{buildPack.overall_dimensions.tolerance_mm ?? 3} mm</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                    {buildPack.mechanism_options.map((m) => {
                      const isActive = selectedMechanismId === m.id;
                      return (
                        <div
                          key={m.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedMechanismId((prev) => (prev === m.id ? 'all' : m.id))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedMechanismId((prev) => (prev === m.id ? 'all' : m.id));
                            }
                          }}
                          className={`rounded-md border p-3 bg-slate-900/30 ${
                            isActive ? 'border-purple-500/70' : 'border-slate-700/50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h5 className="text-slate-200 font-semibold text-sm">{m.name}</h5>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                              {m.difficulty}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1">{m.description}</p>
                          <div className="mt-2">
                            <div className="text-[11px] text-slate-400">Key components</div>
                            <ul className="list-disc list-inside text-xs text-slate-300 mt-1 space-y-1">
                              {m.key_components.slice(0, 4).map((k, idx) => (
                                <li key={idx}>{k}</li>
                              ))}
                            </ul>
                          </div>
                          {isActive ? (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <div className="text-[11px] text-slate-400">Pros</div>
                                <ul className="list-disc list-inside text-xs text-slate-300 mt-1 space-y-1">
                                  {m.pros.slice(0, 4).map((p, idx) => (
                                    <li key={idx}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400">Cons</div>
                                <ul className="list-disc list-inside text-xs text-slate-300 mt-1 space-y-1">
                                  {m.cons.slice(0, 4).map((c, idx) => (
                                    <li key={idx}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Modules / Materials / Hardware */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                    <h4 className="text-white font-semibold">Modules</h4>
                    <ul className="mt-2 space-y-2">
                      {filteredModules.map((m) => (
                        <li key={m.id} className="text-sm text-slate-300">
                          <span className="text-purple-300 font-semibold">{m.name}:</span> {m.notes}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                    <h4 className="text-white font-semibold">Materials</h4>
                    <ul className="mt-2 space-y-2">
                      {filteredMaterials.map((m, idx) => (
                        <li key={`${m.item}-${idx}`} className="text-sm text-slate-300">
                          <span className="text-purple-300 font-semibold">{m.qty}×</span> {m.item} —{' '}
                          <span className="text-slate-200">{m.spec}</span>
                          {m.notes ? <div className="text-xs text-slate-400 mt-0.5">{m.notes}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                    <h4 className="text-white font-semibold">Hardware</h4>
                    <ul className="mt-2 space-y-2">
                      {filteredHardware.map((h, idx) => (
                        <li key={`${h.item}-${idx}`} className="text-sm text-slate-300">
                          <span className="text-purple-300 font-semibold">{h.qty}×</span> {h.item} —{' '}
                          <span className="text-slate-200">{h.spec}</span>
                          {h.notes ? <div className="text-xs text-slate-400 mt-0.5">{h.notes}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
            </div>
          </CollapsibleSection>

          {/* Cut list */}
          <CollapsibleSection id="cutlist" title="Cut List" isOpen={openSections.cutlist} onToggle={() => toggleSection('cutlist')}>
            <div className="overflow-x-auto bg-slate-800/40 border border-slate-700/50 rounded-md">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-900/60 text-slate-200">
                    <tr>
                      <th className="px-3 py-2">Part</th>
                      <th className="px-3 py-2">Material</th>
                      <th className="px-3 py-2">Thk</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Size (in)</th>
                      <th className="px-3 py-2">Size (mm)</th>
                      <th className="px-3 py-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {filteredCutList.map((c, idx) => (
                      <tr key={`${c.part}-${idx}`} className="border-t border-slate-700/40">
                        <td className="px-3 py-2 font-semibold text-slate-200">{c.part}</td>
                        <td className="px-3 py-2">{c.material}</td>
                        <td className="px-3 py-2">{c.thickness}</td>
                        <td className="px-3 py-2">{c.qty}</td>
                        <td className="px-3 py-2">{c.size_in}</td>
                        <td className="px-3 py-2">{c.size_mm}</td>
                        <td className="px-3 py-2 text-xs text-slate-400">{c.notes ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-slate-400 mt-2">
                Tip: Verify stock thickness, kerf, and square before final assembly. Treat dimensions as nominal and test-fit critical parts.
              </div>
          </CollapsibleSection>

          {/* Assembly */}
          <CollapsibleSection id="assembly" title="Assembly Steps" isOpen={openSections.assembly} onToggle={() => toggleSection('assembly')}>
            <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                <ol className="list-decimal list-inside space-y-2 text-slate-300">
                  {filteredSteps
                    .slice()
                    .sort((a, b) => a.step - b.step)
                    .map((s) => (
                      <li key={s.step} className="text-sm">
                        {s.text}
                      </li>
                    ))}
                </ol>

                {buildPack.build_notes?.length ? (
                  <div className="mt-4">
                    <h4 className="text-white font-semibold">Build Notes</h4>
                    <ul className="mt-2 list-disc list-inside text-sm text-slate-300 space-y-1">
                      {buildPack.build_notes.map((n, idx) => (
                        <li key={idx}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
            </div>
          </CollapsibleSection>

          {/* Safety */}
          <CollapsibleSection id="safety" title="Safety & Stability" isOpen={openSections.safety} onToggle={() => toggleSection('safety')}>
            <div className="bg-slate-800/50 p-4 rounded-md border border-slate-700/50">
                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                  {buildPack.safety_notes.map((n, idx) => (
                    <li key={idx}>{n}</li>
                  ))}
                </ul>
            </div>
          </CollapsibleSection>

          {/* Blueprint Data Info Box */}
<div className="mb-4 rounded-md border border-slate-700/60 bg-slate-800/40 p-4 text-sm text-slate-300">
  <div className="mb-1 font-semibold text-slate-200">Blueprint Data (Advanced)</div>
  <p className="mb-1">
    This JSON contains the complete technical blueprint for this illusion — including dimensions, cut list, materials, and assembly steps.
  </p>
  <p>Use it to export plans, share with builders, or feed into other design tools.</p>
</div>

{/* Raw JSON */}
          <CollapsibleSection id="json" title="Raw JSON" isOpen={openSections.json} onToggle={() => toggleSection('json')}>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={handleCopyJson}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 rounded-md text-white"
                    type="button"
                  >
                    {jsonCopyStatus === 'copied' ? 'Copied!' : 'Copy JSON'}
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 text-xs font-semibold bg-slate-700 hover:bg-slate-600 rounded-md text-white"
                    type="button"
                  >
                    Download .json
                  </button>
                  <div className="ml-auto text-[11px] text-slate-500">Tip: use this for exporting or future PDF generation.</div>
                </div>

                <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-xs bg-slate-900/60 p-3 rounded-md border border-slate-700/50">
                  {rawJson}
                </pre>
          </CollapsibleSection>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-700">
            <button onClick={handleStartOver} className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-bold">
              Start Over
            </button>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saved'}
              className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold"
            >
              {saveStatus === 'saved' ? (
                <>
                  <CheckIcon className="w-5 h-5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <SaveIcon className="w-5 h-5" />
                  <span>Save Blueprint</span>
                </>
              )}
            </button>
          </div>

          <div className="text-center text-xs text-slate-500 pt-2">Version: {APP_VERSION}</div>
        </div>
      )}
    </div>
  );
};

export default IllusionBlueprint;