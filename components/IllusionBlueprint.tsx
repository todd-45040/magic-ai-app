import React, { useMemo, useState } from 'react';
import { generateImage, generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { ILLUSION_BLUEPRINT_SYSTEM_INSTRUCTION } from '../constants';
import type { IllusionBlueprintResponse, User } from '../types';
import { BlueprintIcon, WandIcon, SaveIcon, CheckIcon } from './icons';
import { Type } from '@google/genai';

interface IllusionBlueprintProps {
  user: User;
  onIdeaSaved: () => void;
}

/**
 * Build-ready blueprint pack (structured).
 * Notes:
 * - Measurements are "best-effort" from the model; still validate in real builds.
 * - We keep this local to avoid requiring changes to shared types right now.
 */
type BuildBlueprintPack = {
  title: string;
  overview: string;
  overall_dimensions: {
    width_in: number;
    depth_in: number;
    height_in: number;
    width_mm: number;
    depth_mm: number;
    height_mm: number;
    weight_estimate_lb?: number | null;
    weight_estimate_kg?: number | null;
  };
  modules: Array<{
    name: string;
    purpose: string;
    key_dimensions_in?: string | null;
    notes?: string | null;
  }>;
  materials: Array<{
    item: string;
    spec: string;
    qty?: string | null;
    notes?: string | null;
  }>;
  cut_list: Array<{
    part: string;
    material: string;
    qty: number;
    size_in: string;
    size_mm?: string | null;
    notes?: string | null;
  }>;
  hardware: Array<{
    item: string;
    qty: number;
    spec: string;
    where_used?: string | null;
  }>;
  assembly_steps: string[];
  safety_notes: string[];
  mechanism_options: Array<{
    level: 'Manual' | 'Assisted' | 'Motorized';
    description: string;
    complexity: 'Low' | 'Medium' | 'High';
    parts?: string[] | null;
  }>;
};

const BUILD_BLUEPRINT_SYSTEM_INSTRUCTION = `
You are a theatrical illusion prop fabricator and stage carpenter.
Your job is to translate the user's illusion concept into a BUILDABLE plan pack.

Rules:
- Output MUST follow the provided JSON schema exactly.
- Use practical materials (plywood, 2x lumber, hinges, fasteners, casters).
- Provide measurements in BOTH inches and millimeters.
- Keep plans stage-safe: include stability, pinch points, load-bearing, and transport notes.
- Avoid vague narrative. Be specific: sizes, quantities, parts, steps.
- Do not include anything illegal or unsafe. Keep mechanisms reasonable.
`.trim();

const LoadingIndicator: React.FC = () => (
  <div className="flex flex-col items-center justify-center text-center p-8 h-full">
    <div className="relative">
      <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
      <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
        <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
      </div>
    </div>
    <p className="text-slate-300 mt-4 text-lg">Generating Illusion Blueprint...</p>
    <p className="text-slate-400 text-sm">Concept art + staging notes + build plans may take a moment.</p>
  </div>
);

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
    <h4 className="font-semibold text-purple-300 mb-2">{title}</h4>
    {children}
  </div>
);

const IllusionBlueprint: React.FC<IllusionBlueprintProps> = ({ user, onIdeaSaved }) => {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conceptArt, setConceptArt] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<IllusionBlueprintResponse | null>(null);
  const [buildPack, setBuildPack] = useState<BuildBlueprintPack | null>(null);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Existing staging blueprint schema
  const blueprintSchema = useMemo(
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

  // NEW: Build-ready plans schema (structured JSON)
  const buildBlueprintSchema = useMemo(
    () => ({
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        overview: { type: Type.STRING },
        overall_dimensions: {
          type: Type.OBJECT,
          properties: {
            width_in: { type: Type.NUMBER },
            depth_in: { type: Type.NUMBER },
            height_in: { type: Type.NUMBER },
            width_mm: { type: Type.NUMBER },
            depth_mm: { type: Type.NUMBER },
            height_mm: { type: Type.NUMBER },
            weight_estimate_lb: { type: Type.NUMBER, nullable: true },
            weight_estimate_kg: { type: Type.NUMBER, nullable: true },
          },
          required: ['width_in', 'depth_in', 'height_in', 'width_mm', 'depth_mm', 'height_mm'],
        },
        modules: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              purpose: { type: Type.STRING },
              key_dimensions_in: { type: Type.STRING, nullable: true },
              notes: { type: Type.STRING, nullable: true },
            },
            required: ['name', 'purpose'],
          },
        },
        materials: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              spec: { type: Type.STRING },
              qty: { type: Type.STRING, nullable: true },
              notes: { type: Type.STRING, nullable: true },
            },
            required: ['item', 'spec'],
          },
        },
        cut_list: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              part: { type: Type.STRING },
              material: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              size_in: { type: Type.STRING },
              size_mm: { type: Type.STRING, nullable: true },
              notes: { type: Type.STRING, nullable: true },
            },
            required: ['part', 'material', 'qty', 'size_in'],
          },
        },
        hardware: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              item: { type: Type.STRING },
              qty: { type: Type.NUMBER },
              spec: { type: Type.STRING },
              where_used: { type: Type.STRING, nullable: true },
            },
            required: ['item', 'qty', 'spec'],
          },
        },
        assembly_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
        safety_notes: { type: Type.ARRAY, items: { type: Type.STRING } },
        mechanism_options: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              level: { type: Type.STRING }, // Manual | Assisted | Motorized
              description: { type: Type.STRING },
              complexity: { type: Type.STRING }, // Low | Medium | High
              parts: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
            },
            required: ['level', 'description', 'complexity'],
          },
        },
      },
      required: [
        'title',
        'overview',
        'overall_dimensions',
        'modules',
        'materials',
        'cut_list',
        'hardware',
        'assembly_steps',
        'safety_notes',
        'mechanism_options',
      ],
    }),
    []
  );

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe your illusion concept.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setConceptArt(null);
    setBlueprint(null);
    setBuildPack(null);
    setSaveStatus('idle');

    const artPrompt = `Dramatic, theatrical concept art for a grand illusion: ${prompt}. Focus on the magical moment from the audience's perspective. Cinematic lighting, professional digital painting style.`;

    // Existing text call (staging blueprint)
    const textPrompt = `Generate a staging blueprint for an illusion concept: "${prompt}". Include: (1) potential operating principles, (2) staging notes the performer can follow.`;

    // NEW: Build blueprint pack call (construction-ready)
    const buildPrompt =
      `Create a BUILD BLUEPRINT PACK for this stage illusion concept: "${prompt}". ` +
      `Assume it must be portable, fit through a standard 36-inch doorway, and be buildable with common shop tools. ` +
      `Include realistic dimensions, cut list, hardware list, assembly steps, safety/stability notes, and a few mechanism options (manual/assisted/motorized).`;

    try {
      const artPromise = generateImage(artPrompt, '16:9', user);
      const stagingPromise = generateStructuredResponse(
        textPrompt,
        ILLUSION_BLUEPRINT_SYSTEM_INSTRUCTION,
        blueprintSchema,
        user
      );
      const buildPromise = generateStructuredResponse(
        buildPrompt,
        BUILD_BLUEPRINT_SYSTEM_INSTRUCTION,
        buildBlueprintSchema,
        user
      );

      const [artResult, stagingResult, buildResult] = await Promise.all([
        artPromise,
        stagingPromise,
        buildPromise,
      ]);

      setConceptArt(artResult);
      setBlueprint(stagingResult as IllusionBlueprintResponse);
      setBuildPack(buildResult as BuildBlueprintPack);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (blueprint && conceptArt) {
      let fullContent = `## Illusion Blueprint: ${prompt}

`;
      fullContent += `![Concept Art](${conceptArt})

`;

      fullContent += `### Potential Principles

`;
      blueprint.potential_principles.forEach((p) => {
        fullContent += `**${p.name}:** ${p.description}

`;
      });

      fullContent += `### Staging Blueprint

${blueprint.blueprint_description}

`;

      if (buildPack) {
        fullContent += `---

### Build Blueprint Pack (Construction)

`;
        fullContent += `**Title:** ${buildPack.title}

`;
        fullContent += `${buildPack.overview}

`;

        const d = buildPack.overall_dimensions;
        fullContent += `**Overall Dimensions:** ${d.width_in}"W × ${d.depth_in}"D × ${d.height_in}"H (${d.width_mm}mm × ${d.depth_mm}mm × ${d.height_mm}mm)

`;

        fullContent += `#### Modules
`;
        buildPack.modules.forEach((m) => {
          fullContent += `- **${m.name}** (${m.key_dimensions_in ?? 'n/a'}): ${m.purpose}${m.notes ? ` — ${m.notes}` : ''}
`;
        });
        fullContent += `
#### Materials
`;
        buildPack.materials.forEach((m) => {
          fullContent += `- ${m.item} — ${m.spec}${m.qty ? ` (qty: ${m.qty})` : ''}${m.notes ? ` — ${m.notes}` : ''}
`;
        });

        fullContent += `
#### Cut List
`;
        buildPack.cut_list.forEach((c) => {
          fullContent += `- ${c.qty}× ${c.part} (${c.material}) — ${c.size_in}${c.size_mm ? ` / ${c.size_mm}` : ''}${c.notes ? ` — ${c.notes}` : ''}
`;
        });

        fullContent += `
#### Hardware
`;
        buildPack.hardware.forEach((h) => {
          fullContent += `- ${h.qty}× ${h.item} — ${h.spec}${h.where_used ? ` (used: ${h.where_used})` : ''}
`;
        });

        fullContent += `
#### Assembly Steps
`;
        buildPack.assembly_steps.forEach((s, idx) => {
          fullContent += `${idx + 1}. ${s}
`;
        });

        fullContent += `
#### Safety Notes
`;
        buildPack.safety_notes.forEach((s) => {
          fullContent += `- ${s}
`;
        });

        fullContent += `
#### Mechanism Options
`;
        buildPack.mechanism_options.forEach((o) => {
          fullContent += `- **${o.level} (${o.complexity})**: ${o.description}${o.parts?.length ? ` (parts: ${o.parts.join(', ')})` : ''}
`;
        });
      }

      saveIdea('text', fullContent, `Illusion Blueprint: ${prompt}`);
      onIdeaSaved();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }
  };

  const handleStartOver = () => {
    setPrompt('');
    setConceptArt(null);
    setBlueprint(null);
    setBuildPack(null);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
      <header className="mb-6">
        <div className="flex items-center gap-3">
          <BlueprintIcon className="w-8 h-8 text-purple-400" />
          <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Illusion Blueprint Generator</h2>
        </div>
        <p className="text-slate-400 mt-1">
          From a simple concept to a stage-ready blueprint. Now includes build-ready construction plans.
        </p>
      </header>

      {!blueprint ? (
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
              <span>{isLoading ? 'Generating...' : 'Generate Blueprint + Plans'}</span>
            </button>
            {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
            {isLoading && <LoadingIndicator />}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {conceptArt && (
            <div>
              <h3 className="text-lg font-bold text-white mb-2 font-cinzel">Concept Art</h3>
              <img
                src={conceptArt}
                alt="Generated concept art for the illusion"
                className="w-full rounded-lg border border-slate-700"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-2 font-cinzel">Potential Principles</h3>
              <div className="space-y-3">
                {blueprint.potential_principles.map((principle, i) => (
                  <div key={i} className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                    <h4 className="font-semibold text-purple-300">{principle.name}</h4>
                    <p className="text-sm text-slate-400">{principle.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white mb-2 font-cinzel">Staging Blueprint</h3>
              <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                <pre className="whitespace-pre-wrap break-words text-slate-300 font-sans text-sm">
                  {blueprint.blueprint_description}
                </pre>
              </div>
            </div>
          </div>

          {/* NEW: Build Blueprint Pack renderer */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-white font-cinzel">Build Blueprint Pack</h3>

            {!buildPack ? (
              <div className="bg-slate-800/50 p-3 rounded-md border border-slate-700/50">
                <p className="text-slate-300 text-sm">
                  Build plans were not returned this time. Try generating again with a slightly more detailed prompt (materials,
                  size limits, whether it breaks down into modules, etc.).
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SectionCard title="Overview">
                  <p className="text-slate-300 text-sm">
                    <span className="font-semibold text-slate-200">{buildPack.title}</span>
                  </p>
                  <p className="text-slate-400 text-sm mt-2">{buildPack.overview}</p>
                </SectionCard>

                <SectionCard title="Overall Dimensions">
                  <div className="text-slate-300 text-sm space-y-1">
                    <div>
                      <span className="text-slate-400">Inches: </span>
                      {buildPack.overall_dimensions.width_in}"W × {buildPack.overall_dimensions.depth_in}"D ×{' '}
                      {buildPack.overall_dimensions.height_in}"H
                    </div>
                    <div>
                      <span className="text-slate-400">Millimeters: </span>
                      {buildPack.overall_dimensions.width_mm}mm × {buildPack.overall_dimensions.depth_mm}mm ×{' '}
                      {buildPack.overall_dimensions.height_mm}mm
                    </div>
                    {(buildPack.overall_dimensions.weight_estimate_lb || buildPack.overall_dimensions.weight_estimate_kg) && (
                      <div>
                        <span className="text-slate-400">Weight (est.): </span>
                        {buildPack.overall_dimensions.weight_estimate_lb ?? '—'} lb /{' '}
                        {buildPack.overall_dimensions.weight_estimate_kg ?? '—'} kg
                      </div>
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Modules">
                  <div className="space-y-2">
                    {buildPack.modules.map((m, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="text-slate-200 font-semibold">
                          {m.name}{' '}
                          {m.key_dimensions_in ? (
                            <span className="text-slate-400 font-normal">({m.key_dimensions_in})</span>
                          ) : null}
                        </div>
                        <div className="text-slate-400">{m.purpose}</div>
                        {m.notes ? <div className="text-slate-500">{m.notes}</div> : null}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Mechanism Options">
                  <div className="space-y-2">
                    {buildPack.mechanism_options.map((o, idx) => (
                      <div key={idx} className="text-sm">
                        <div className="text-slate-200 font-semibold">
                          {o.level}{' '}
                          <span className="text-slate-400 font-normal">
                            ({o.complexity})
                          </span>
                        </div>
                        <div className="text-slate-400">{o.description}</div>
                        {o.parts?.length ? (
                          <div className="text-slate-500">Parts: {o.parts.join(', ')}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <SectionCard title="Materials">
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                      {buildPack.materials.map((m, idx) => (
                        <li key={idx}>
                          <span className="text-slate-200">{m.item}</span>{' '}
                          <span className="text-slate-400">— {m.spec}</span>
                          {m.qty ? <span className="text-slate-500"> (qty: {m.qty})</span> : null}
                          {m.notes ? <div className="text-slate-500">{m.notes}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </SectionCard>

                  <SectionCard title="Hardware">
                    <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                      {buildPack.hardware.map((h, idx) => (
                        <li key={idx}>
                          <span className="text-slate-200">
                            {h.qty}× {h.item}
                          </span>{' '}
                          <span className="text-slate-400">— {h.spec}</span>
                          {h.where_used ? <div className="text-slate-500">Used: {h.where_used}</div> : null}
                        </li>
                      ))}
                    </ul>
                  </SectionCard>
                </div>

                <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <SectionCard title="Cut List">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-slate-400">
                            <th className="py-1 pr-3">Qty</th>
                            <th className="py-1 pr-3">Part</th>
                            <th className="py-1 pr-3">Material</th>
                            <th className="py-1 pr-3">Size (in)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buildPack.cut_list.map((c, idx) => (
                            <tr key={idx} className="border-t border-slate-700/40">
                              <td className="py-1 pr-3 text-slate-300">{c.qty}</td>
                              <td className="py-1 pr-3 text-slate-200">{c.part}</td>
                              <td className="py-1 pr-3 text-slate-400">{c.material}</td>
                              <td className="py-1 pr-3 text-slate-300">{c.size_in}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Tip: Validate cut sizes against your actual stock and add kerf allowances.
                    </p>
                  </SectionCard>

                  <SectionCard title="Assembly + Safety">
                    <div className="space-y-3">
                      <div>
                        <div className="text-slate-200 font-semibold text-sm mb-1">Assembly Steps</div>
                        <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-300">
                          {buildPack.assembly_steps.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <div className="text-slate-200 font-semibold text-sm mb-1">Safety Notes</div>
                        <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                          {buildPack.safety_notes.map((s, idx) => (
                            <li key={idx}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <SectionCard title="Raw JSON (for reference)">
                  <pre className="whitespace-pre-wrap break-words text-slate-300 font-mono text-xs">
                    {JSON.stringify(buildPack, null, 2)}
                  </pre>
                </SectionCard>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 pt-4 border-t border-slate-700">
            <button
              onClick={handleStartOver}
              className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-md text-white font-bold"
            >
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
        </div>
      )}
    </div>
  );
};

export default IllusionBlueprint;
