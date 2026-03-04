
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { generateImages, editImageWithPrompt } from '../services/geminiService';
import BlockedPanel from './BlockedPanel';
import { normalizeBlockedUx } from '../services/blockedUx';
import { saveIdea } from '../services/ideasService';
import * as showsService from '../services/showsService';
import { useAppDispatch, useAppState, refreshShows, refreshIdeas } from '../store';
import SaveActionBar from './shared/SaveActionBar';
import { BackIcon, ImageIcon, WandIcon, TrashIcon, CameraIcon } from './icons';
import type { User } from '../types';
import { canConsume, consume } from '../services/usageTracker';
import { trackClientEvent } from "../services/telemetryClient";

interface VisualBrainstormProps {
    onIdeaSaved: () => void;
    user: User;
    onRequestUpgrade?: () => void;
}

const ImageLoadingIndicator: React.FC<{ label?: string }> = ({ label }) => {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    // Lightweight “perceived progress” indicator.
    // We cap at 92% until completion so it never looks stuck at 100%.
    setProgress(8);
    const interval = window.setInterval(() => {
      setProgress((p) => {
        const next = p + Math.max(1, Math.round((92 - p) * 0.08));
        return Math.min(92, next);
      });
    }, 650);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 w-full max-w-md">
      <div className="relative">
        <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
          <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin" />
        </div>
      </div>

      <p className="text-slate-200 mt-5 text-lg font-semibold">{label || 'Generating concept art…'}</p>
      <p className="text-slate-400 text-sm mt-1">Hang tight — this can take a moment.</p>

      <div className="w-full mt-5">
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div className="h-full bg-purple-500/80 transition-all" style={{ width: `${progress}%` }} aria-hidden="true" />
        </div>
        <div className="mt-2 text-xs text-slate-500">{progress}%</div>
      </div>
    </div>
  );
};


const VisualBrainstorm: React.FC<VisualBrainstormProps> = ({ onIdeaSaved, user, onRequestUpgrade }) => {
  const { shows } = useAppState();
  const dispatch = useAppDispatch();

  const [editPrompt, setEditPrompt] = useState('');
  // Phase 1: Structured inputs for text-to-image
  const [objectProp, setObjectProp] = useState('');
  const [sceneSetting, setSceneSetting] = useState('');
  const [style, setStyle] = useState('');
  const [context, setContext] = useState('');
  const [advancedPrompt, setAdvancedPrompt] = useState(false);
  const [promptOverride, setPromptOverride] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '16:9' | '9:16'>('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string>('Generating concept art…');
  const [loadingKind, setLoadingKind] = useState<'generate' | 'edit' | 'refine' | 'none'>('none');
  const [lastGeneratePrompt, setLastGeneratePrompt] = useState<string>('');
  const [lastGenerateAspect, setLastGenerateAspect] = useState<'1:1' | '16:9' | '9:16'>('1:1');
  const [error, setError] = useState<string | null>(null);
  const [blockedUi, setBlockedUi] = useState<ReturnType<typeof normalizeBlockedUx> | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  // Phase 5: Multi-image generation (variations)
  const [variationImages, setVariationImages] = useState<string[]>([]);
  const [variationHistoryIds, setVariationHistoryIds] = useState<string[]>([]);
  const [conceptTitle, setConceptTitle] = useState<string>('');
  const [saveImageStatus, setSaveImageStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedIdeaId, setSavedIdeaId] = useState<string | null>(null);
  const [isStrong, setIsStrong] = useState(false);

  // Phase 4: Image refinement pipeline + history
  type VisualHistoryItem = {
    id: string;
    imageUrl: string;
    promptUsed: string;
    title: string;
    createdAt: number;
    kind: 'generate' | 'edit' | 'refine';
    sessionId: string;
    parentHistoryId?: string;
    refineLabel?: string;
  };
  const [history, setHistory] = useState<VisualHistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [promptUsed, setPromptUsed] = useState<string>('');

// Phase 10: Creative Session History Panel (persistent, grouped by session prompt)
type VisualSession = {
  id: string;
  basePrompt: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  coverImageUrl?: string;
  lastBatchImages?: string[];
  history: VisualHistoryItem[];
};

const STORAGE_KEY = useMemo(() => `maw_visual_sessions_v1:${user?.id || 'anon'}`, [user?.id]);

  // Phase 12: Booth Demo Optimization
  const DEMO_MODE_KEY = useMemo(() => `maw_visual_demo_mode_v1:${user?.id || 'anon'}`, [user?.id]);
  const [demoMode, setDemoMode] = useState<boolean>(false);
  const [demoDrawerOpen, setDemoDrawerOpen] = useState<boolean>(false);

const [sessions, setSessions] = useState<VisualSession[]>([]);
const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const [savedByHistory, setSavedByHistory] = useState<Record<string, string>>({});
  const [strongByHistory, setStrongByHistory] = useState<Record<string, boolean>>({});

  const [showModalOpen, setShowModalOpen] = useState(false);
  const [showModalMode, setShowModalMode] = useState<'add' | 'task'>('add');
  const [showId, setShowId] = useState<string>('');
  const [createNewShowTitle, setCreateNewShowTitle] = useState('');

  // Phase 8 — Performance Improvements (Retry UX)
  type LastVisualAction =
    | { kind: 'generate'; prompt: string; aspectRatio: typeof aspectRatio; units: number }
    | { kind: 'edit'; prompt: string; base64: string; mimeType: string; units: number }
    | { kind: 'refine'; prompt: string; aspectRatio: typeof aspectRatio; label: string; instruction: string; units: number };
  const [lastFailedAction, setLastFailedAction] = useState<LastVisualAction | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  const [shareFile, setShareFile] = useState<File | null>(null);

  // Phase 6: Image detail panel
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailHistoryId, setDetailHistoryId] = useState<string | null>(null);
  const [customRefine, setCustomRefine] = useState('');

  // New state for input image
  const [inputImageFile, setInputImageFile] = useState<File | null>(null);
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (generatedImage) {
        const convertDataUrlToFile = async () => {
            const res = await fetch(generatedImage);
            const blob = await res.blob();
            const file = new File([blob], `magic-visual-idea-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setShareFile(file);
        };
        convertDataUrlToFile();
    } else {
        setShareFile(null);
    }
  }, [generatedImage]);


// Phase 10: Load persisted sessions on mount
useEffect(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as VisualSession[];
    if (Array.isArray(parsed)) {
      // Defensive: ensure required fields exist.
      const cleaned = parsed
        .filter((s) => s && typeof s.id === 'string')
        .map((s) => ({
          id: s.id,
          basePrompt: String((s as any).basePrompt || ''),
          createdAt: Number((s as any).createdAt || Date.now()),
          updatedAt: Number((s as any).updatedAt || Date.now()),
          pinned: Boolean((s as any).pinned),
          coverImageUrl: (s as any).coverImageUrl ? String((s as any).coverImageUrl) : undefined,
          lastBatchImages: Array.isArray((s as any).lastBatchImages) ? (s as any).lastBatchImages.map(String) : undefined,
          history: Array.isArray((s as any).history) ? (s as any).history : [],
        })) as VisualSession[];

      setSessions(cleaned.slice(0, 12));
      // Re-open most recent session automatically.
      if (cleaned[0]?.id) setActiveSessionId(cleaned[0].id);
    }
  } catch {
    // ignore
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // Phase 12: Load Demo Mode flag
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DEMO_MODE_KEY);
      if (raw === '1') setDemoMode(true);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DEMO_MODE_KEY, demoMode ? '1' : '0');
    } catch {
      // ignore
    }
  }, [demoMode, DEMO_MODE_KEY]);

  // Phase 12: Booth Demo Optimization (compact rotating presets)
  const PRESETS_PER_PAGE = 2;
  const [demoPresetPage, setDemoPresetPage] = useState(0);


  const demoPresets: Array<{ title: string; objectProp: string; sceneSetting: string; style: string; context?: string }> = [
    {
      title: 'The Phantom Rope Illusion',
      objectProp: 'rope and brass rings',
      sceneSetting: 'Victorian theater stage illusion',
      style: 'steampunk, mysterious',
      context: 'dramatic lighting, subtle fog, magical particles',
    },
    {
      title: 'The Floating Deck Spectacle',
      objectProp: 'deck of cards',
      sceneSetting: 'parlor show with audience close to the stage',
      style: 'cinematic, elegant, high contrast',
      context: 'strong spotlight, audience reactions visible',
    },
    {
      title: 'Street Sorcery Coin Miracle',
      objectProp: 'coin',
      sceneSetting: 'street magic circle at night',
      style: 'bold, energetic, vibrant',
      context: 'neon highlights, handheld camera vibe, smiling spectators',
    },
    {
      title: 'Mind Reading Envelope Reveal',
      objectProp: 'sealed envelope and marker',
      sceneSetting: 'minimalist close-up table',
      style: 'minimalist, modern, clean',
      context: 'soft lighting, crisp composition, mystery tension',
    },
    {
      title: 'Poster Prop Concept: Mystic Top Hat',
      objectProp: 'magician top hat and wand',
      sceneSetting: 'clean studio product shot on velvet',
      style: 'luxury, dramatic, photoreal',
      context: 'rim lighting, deep shadows, premium feel, high detail',
    },
    {
      title: 'Stage Set Mood Board: Galaxy Backdrop',
      objectProp: 'starry backdrop and floating props',
      sceneSetting: 'large theater stage with galaxy gradient lighting',
      style: 'dreamy, cosmic, vibrant',
      context: 'purple/blue galaxy haze, soft volumetric beams, magical sparkles',
    },
  ];

  const demoPresetPages = Math.max(1, Math.ceil(demoPresets.length / PRESETS_PER_PAGE));
  const safePresetPage = ((demoPresetPage % demoPresetPages) + demoPresetPages) % demoPresetPages;
  const visibleDemoPresets = demoPresets.slice(safePresetPage * PRESETS_PER_PAGE, safePresetPage * PRESETS_PER_PAGE + PRESETS_PER_PAGE);

  const goPrevPresetPage = () => setDemoPresetPage(p => (p - 1 + demoPresetPages) % demoPresetPages);
  const goNextPresetPage = () => setDemoPresetPage(p => (p + 1) % demoPresetPages);

  const applyPreset = (p: (typeof demoPresets)[number]) => {
    setObjectProp(p.objectProp);
    setSceneSetting(p.sceneSetting);
    setStyle(p.style);
    setContext(p.context || '');
    setAdvancedPrompt(false);
    setPromptOverride('');
    setConceptTitle(p.title);
    // Clear any edit image state (demo presets are text-to-image)
    setInputImageFile(null);
    setInputImagePreview(null);
    setEditPrompt('');
  };

  const runPreset = async (p: (typeof demoPresets)[number]) => {
    applyPreset(p);
    const prompt = buildPromptFrom({
      style: p.style,
      sceneSetting: p.sceneSetting,
      objectProp: p.objectProp,
      context: p.context,
    }).trim();
    if (!prompt) return;
    await runAction({ kind: 'generate', prompt, aspectRatio, units: 4 } as any);
  };

  const resetDemoSession = () => {
    // Clears local history + selections (booth reset)
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSessions([]);
    setActiveSessionId(null);
    setHistory([]);
    setActiveHistoryId(null);
    setGeneratedImage(null);
    setVariationImages([]);
    setVariationHistoryIds([]);
    setPromptUsed('');
    setConceptTitle('');
    setSaveImageStatus('idle');
    setSavedIdeaId(null);
    setIsStrong(false);
    setError(null);
    setLastFailedAction(null);
    setLastFailedMessage(null);
    // Also clear edit image state
    setInputImageFile(null);
    setInputImagePreview(null);
    setEditPrompt('');
    // Telemetry (best-effort)
    try {
      trackClientEvent({
        tool: 'visual_brainstorm',
        action: 'visual_demo_reset',
        outcome: 'ALLOWED',
      });
    } catch {
      // ignore
    }
  };

  const makeDemoSvgDataUrl = (label: string, subtitle: string) => {
    const safeLabel = label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeSub = subtitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220"/>
      <stop offset="45%" stop-color="#2b1157"/>
      <stop offset="100%" stop-color="#0b1220"/>
    </linearGradient>
    <radialGradient id="r" cx="65%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.65"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  <rect width="1024" height="1024" fill="url(#r)"/>
  <g fill="#e2e8f0" font-family="ui-sans-serif, system-ui, -apple-system" text-anchor="middle">
    <text x="512" y="470" font-size="44" font-weight="700">${safeLabel}</text>
    <text x="512" y="535" font-size="22" fill="#cbd5e1">${safeSub}</text>
    <text x="512" y="610" font-size="16" fill="#94a3b8">Demo Mode • Curated Sample Output</text>
  </g>
  <g opacity="0.22">
    <circle cx="180" cy="180" r="110" fill="#a78bfa"/>
    <circle cx="820" cy="260" r="140" fill="#f59e0b"/>
    <circle cx="720" cy="820" r="180" fill="#38bdf8"/>
  </g>
</svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const generateDemoImages = (baseTitle: string, prompt: string, count: number) => {
    const shortPrompt = prompt.length > 70 ? `${prompt.slice(0, 70)}…` : prompt;
    const imgs: string[] = [];
    for (let i = 0; i < count; i++) {
      imgs.push(makeDemoSvgDataUrl(baseTitle || 'Magic Visual Concept', `Variation ${i + 1} • ${shortPrompt}`));
    }
    return imgs;
  };

// Phase 10: Persist sessions (cap size to avoid localStorage overflow)
useEffect(() => {
  try {
    // Keep pinned sessions first, then newest.
    const sorted = [...sessions].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });

    const capped = sorted.slice(0, 12).map((s) => ({
      ...s,
      history: (s.history || []).slice(0, 24), // cap per-session history
      lastBatchImages: (s.lastBatchImages || []).slice(0, 4),
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // ignore quota errors
  }
}, [sessions, STORAGE_KEY]);

  const showsSorted = useMemo(() => {
    const arr = Array.isArray(shows) ? [...shows] : [];
    return arr.sort((a: any, b: any) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0));
  }, [shows]);

  // Default show selection for “Add to Show” flows.
  useEffect(() => {
    const firstId = showsSorted?.[0]?.id ? String((showsSorted as any)[0].id) : '';
    if (!showId && firstId) setShowId(firstId);
  }, [showsSorted, showId]);

  const toTitleCase = (s: string) =>
    s
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  const buildConceptTitle = () => {
    if (isEditing) return 'Edited Visual Concept';
    const obj = objectProp.trim();
    const st = style.trim();
    if (obj && st) return `The ${toTitleCase(st)} ${toTitleCase(obj)} Concept`;
    if (obj) return `Visual Concept: ${toTitleCase(obj)}`;
    if (sceneSetting.trim()) return `Visual Concept: ${toTitleCase(sceneSetting.trim())}`;
    return 'Visual Concept';
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Invalid file type. Please upload a JPG, PNG, or WEBP image.');
        return;
      }
      setInputImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setInputImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setError(null);
    }
  };

  const handleRemoveImage = () => {
    setInputImageFile(null);
    setInputImagePreview(null);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  

  const buildPrompt = () => {
    const parts: string[] = [];

    // Order matters: style + setting first tends to steer composition.
    if (style.trim()) parts.push(style.trim());
    if (sceneSetting.trim()) parts.push(sceneSetting.trim());
    if (objectProp.trim()) parts.push(`magic concept using ${objectProp.trim()}`);
    if (context.trim()) parts.push(context.trim());

    // A gentle anchor so outputs stay “magic concept art” rather than generic product shots.
    parts.push('professional magic performance concept art');

    return parts.join(', ');
  };

  const buildPromptFrom = (vals: { style?: string; sceneSetting?: string; objectProp?: string; context?: string }) => {
    const parts: string[] = [];
    const s = (vals.style ?? '').trim();
    const sc = (vals.sceneSetting ?? '').trim();
    const o = (vals.objectProp ?? '').trim();
    const c = (vals.context ?? '').trim();
    if (s) parts.push(s);
    if (sc) parts.push(sc);
    if (o) parts.push(`magic concept using ${o}`);
    if (c) parts.push(c);
    parts.push('professional magic performance concept art');
    return parts.join(', ');
  };

  const isEditing = Boolean(inputImagePreview);
  const finalPrompt = isEditing
    ? editPrompt.trim()
    : (advancedPrompt && promptOverride.trim() ? promptOverride.trim() : buildPrompt());

  const activeItem = useMemo(() => {
    if (!activeHistoryId) return null;
    return history.find((h) => h.id === activeHistoryId) ?? null;
  }, [history, activeHistoryId]);

  const openDetail = (opts?: { historyId?: string }) => {
    if (opts?.historyId) setDetailHistoryId(opts.historyId);
    else setDetailHistoryId(activeHistoryId);
    setCustomRefine('');
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
  };

  const detailItem = useMemo(() => {
    const hid = detailHistoryId || activeHistoryId;
    if (!hid) return null;
    return history.find((h) => h.id === hid) ?? null;
  }, [detailHistoryId, activeHistoryId, history]);

  // Keep the render states in sync with active history (switching thumbnails).
  useEffect(() => {
    if (!activeItem) return;
    setGeneratedImage(activeItem.imageUrl);
    setPromptUsed(activeItem.promptUsed);
    setConceptTitle(activeItem.title);
    setSavedIdeaId(savedByHistory[activeItem.id] ?? null);
    setIsStrong(Boolean(strongByHistory[activeItem.id]));
  }, [activeItem, savedByHistory, strongByHistory]);


const newId = () => `vb_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const ensureSession = (basePrompt: string, coverImageUrl?: string, batchImages?: string[]) => {
  const sid = newId();
  const now = Date.now();
  const session: VisualSession = {
    id: sid,
    basePrompt: basePrompt.trim(),
    createdAt: now,
    updatedAt: now,
    pinned: false,
    coverImageUrl,
    lastBatchImages: batchImages?.slice(0, 4),
    history: [],
  };
  setSessions((prev) => [session, ...prev]);
  setActiveSessionId(sid);
  return sid;
};

  const openSession = (sid: string) => {
    const session = sessions.find((s) => s.id === sid);
    if (!session) return;

    setActiveSessionId(sid);

    const sessionHistory = Array.isArray(session.history) ? session.history : [];
    setHistory(sessionHistory);

    const top = sessionHistory[0];
    if (top?.id) setActiveHistoryId(top.id);

    const genItems = sessionHistory.filter((h) => h.kind === 'generate').slice(0, 4);
    const batch = (session.lastBatchImages?.length ? session.lastBatchImages : genItems.map((g) => g.imageUrl)) || [];
    setVariationImages(batch.slice(0, 4));
    setVariationHistoryIds(genItems.map((g) => g.id));

    // Sync top-of-card values
    if (top) {
      setGeneratedImage(top.imageUrl);
      setPromptUsed(top.promptUsed);
      setConceptTitle(top.title);
    }
  };

const togglePinSession = (sid: string) => {
  setSessions((prev) =>
    prev.map((s) => (s.id === sid ? { ...s, pinned: !s.pinned, updatedAt: Date.now() } : s))
  );
};

const addToHistory = (
  item: Omit<VisualHistoryItem, 'id' | 'createdAt' | 'sessionId'>,
  opts?: { setActive?: boolean; sessionId?: string; coverImageUrl?: string; batchImages?: string[]; createNewSession?: boolean }
) => {
  const id = newId();
  const now = Date.now();

  const sessionId =
    opts?.sessionId ||
    (opts?.createNewSession ? ensureSession(item.promptUsed, opts?.coverImageUrl, opts?.batchImages) : activeSessionId) ||
    ensureSession(item.promptUsed, opts?.coverImageUrl, opts?.batchImages);

  const entry: VisualHistoryItem = { ...item, id, createdAt: now, sessionId };

  // Update in-memory current session history view
  setHistory((prev) => [entry, ...prev].slice(0, 24));
  if (opts?.setActive !== false) setActiveHistoryId(id);

  // Update persistent sessions store
  setSessions((prev) => {
    const next = [...prev];
    const idx = next.findIndex((s) => s.id === sessionId);
    if (idx >= 0) {
      const s = next[idx];
      const updated: VisualSession = {
        ...s,
        updatedAt: now,
        coverImageUrl: s.coverImageUrl || opts?.coverImageUrl || entry.imageUrl,
        lastBatchImages: opts?.batchImages?.slice(0, 4) || s.lastBatchImages,
        history: [entry, ...(s.history || [])].slice(0, 24),
      };
      next[idx] = updated;
    }
    return next;
  });

  return id;
};

  // Phase 8 — Centralized request runner (supports retry UX)
  const runAction = async (action: LastVisualAction, opts?: { skipConsume?: boolean; isRetry?: boolean }) => {
    const skipConsume = Boolean(opts?.skipConsume) || demoMode;
    const units = action.units;

    if (opts?.isRetry) {
      // Best-effort retry telemetry (parity with Identify)
      try {
        trackClientEvent({
          tool: 'visual_brainstorm',
          action: 'visual_retry_click',
          metadata: { kind: action.kind, aspectRatio: (action as any).aspectRatio ?? aspectRatio },
          outcome: 'ALLOWED',
        });
      } catch {
        // ignore
      }
    }

    if (!skipConsume) {
      const chk = canConsume(user, 'image', units);
      if (!chk.ok) {
        setError(`Daily image limit reached (${chk.used}/${chk.limit}). Upgrade to continue.`);
        return;
      }
      consume(user, 'image', units);
    }

    // Telemetry (Phase 7)
    trackClientEvent({
      tool: 'visual_brainstorm',
      action: 'visual_request_start',
      metadata: {
        mode: action.kind,
        aspectRatio: (action as any).aspectRatio ?? aspectRatio,
        variations: action.kind === 'generate' ? 4 : 1,
        label: (action as any).label,
      },
      units,
    });

    setLoadingLabel(
      action.kind === 'edit'
        ? 'Applying your edit…'
        : action.kind === 'refine'
          ? `Refining: ${(action as any).label || 'Update'}…`
          : 'Generating concept art…'
    );
    setLoadingKind(action.kind as any);
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    setVariationImages([]);
    setVariationHistoryIds([]);
    setSaveImageStatus('idle');
    setSavedIdeaId(null);
    setIsStrong(false);

    try {
      let imageUrl: string;
      let batchImages: string[] | null = null;

      // Phase 12: Optional Demo Mode (curated sample outputs, no upstream dependency)
      if (demoMode) {
        // Small delay so it still feels like “generation” at the booth.
        await new Promise((r) => setTimeout(r, 350));
        const baseTitle = (conceptTitle?.trim() ? conceptTitle.trim() : buildConceptTitle());
        const count = action.kind === 'generate' ? 4 : 1;
        const imgs = generateDemoImages(baseTitle, action.prompt, count);
        batchImages = imgs;
        if (action.kind === 'generate') {
          setVariationImages(imgs);
          setLastGeneratePrompt(action.prompt);
          setLastGenerateAspect((action as any).aspectRatio ?? aspectRatio);
        }
        imageUrl = imgs[0];
      } else {
        if (action.kind === 'edit') {
          imageUrl = await editImageWithPrompt(action.base64, action.mimeType, action.prompt, user);
        } else if (action.kind === 'generate') {
          const imgs = await generateImages(action.prompt, action.aspectRatio, 4, user);
          batchImages = imgs;
          setVariationImages(imgs);
          setLastGeneratePrompt(action.prompt);
          setLastGenerateAspect(action.aspectRatio ?? aspectRatio);
          imageUrl = imgs[0];
        } else {
          const imgs = await generateImages(action.prompt, action.aspectRatio, 1, user);
          batchImages = imgs;
          imageUrl = imgs[0];
        }
      }

      setGeneratedImage(imageUrl);
      setPromptUsed(action.prompt);

      const resolvedTitle = (conceptTitle?.trim() ? conceptTitle.trim() : buildConceptTitle());
      setConceptTitle(resolvedTitle);

      if (action.kind === 'edit') {
        // New session for each edit workflow
        addToHistory({ imageUrl, promptUsed: action.prompt, title: resolvedTitle, kind: 'edit', refineLabel: undefined }, { createNewSession: true, coverImageUrl: imageUrl, batchImages: [imageUrl] });
      } else if (action.kind === 'generate') {
        const imgs = (batchImages?.length ? batchImages : [imageUrl]).slice(0, 4);

        // Phase 10: start a new session for each fresh generation request (groups variations)
        const sid = ensureSession(action.prompt, imgs[0], imgs);
        setHistory([]); // reset current session view
        const ids: string[] = [];

        // Add variations to history without stealing focus each time.
        for (let i = imgs.length - 1; i >= 0; i--) {
          const url = imgs[i];
          const id = addToHistory(
            { imageUrl: url, promptUsed: action.prompt, title: resolvedTitle, kind: 'generate' },
            { setActive: false, sessionId: sid, coverImageUrl: imgs[0], batchImages: imgs }
          );
          ids.unshift(id);
        }
        setVariationHistoryIds(ids);
        if (ids[0]) setActiveHistoryId(ids[0]);
      } else {
        addToHistory(
          {
            imageUrl,
            promptUsed: action.prompt,
            title: resolvedTitle,
            kind: 'refine',
            refineLabel: action.label,
            parentHistoryId: activeHistoryId || undefined,
          },
          { sessionId: activeSessionId || undefined }
        );
      }

      setLastFailedAction(null);
      setLastFailedMessage(null);

      // Telemetry success
      trackClientEvent({
        tool: 'visual_brainstorm',
        action: 'visual_request_success',
        metadata: {
          mode: action.kind,
          aspectRatio: (action as any).aspectRatio ?? aspectRatio,
          imagesGenerated: action.kind === 'generate' ? 4 : 1,
          variations: action.kind === 'generate' ? 4 : 1,
          label: (action as any).label,
          retry: Boolean(opts?.isRetry),
          demoMode: demoMode,
        },
        outcome: skipConsume ? 'SUCCESS_NOT_CHARGED' : 'SUCCESS_CHARGED',
        units,
      });
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'An unknown error occurred.';
      const isTimeout = /timed out/i.test(raw);
      const is503 = /\b503\b/.test(raw);
      const friendly = isTimeout
        ? 'Request timed out (90s). The image generator can be slow sometimes — please try again.'
        : is503
          ? 'The image generator is temporarily overloaded (503). Please try again.'
          : raw;

      setLastFailedAction(action);
      setLastFailedMessage(friendly);

      // Telemetry error
      trackClientEvent({
        tool: 'visual_brainstorm',
        action: 'visual_request_error',
        metadata: {
          mode: action.kind,
          aspectRatio: (action as any).aspectRatio ?? aspectRatio,
          variations: action.kind === 'generate' ? 4 : 1,
          label: (action as any).label,
          message: raw,
          timeout: isTimeout,
          status503: is503,
          retry: Boolean(opts?.isRetry),
        },
        outcome: 'ERROR_UPSTREAM',
        units,
      });

      setError(friendly);
    } finally {
      setIsLoading(false);
      setLoadingKind('none');
    }
  };

  const handleSubmit = async () => {
    if (!finalPrompt.trim()) {
      setError(isEditing ? 'Please enter editing instructions.' : 'Please provide at least an Object/Prop, Scene/Setting, or Style.');
      return;
    }

    const promptToUse = finalPrompt.trim();
    if (inputImageFile && inputImagePreview) {
      const base64Data = inputImagePreview.split(',')[1];
      const action: LastVisualAction = {
        kind: 'edit',
        prompt: promptToUse,
        base64: base64Data,
        mimeType: inputImageFile.type,
        units: 1,
      };
      await runAction(action);
    } else {
      const action: LastVisualAction = {
        kind: 'generate',
        prompt: promptToUse,
        aspectRatio,
        units: 4,
      };
      await runAction(action);
    }
  };

  
  const handleGenerateVariations = async () => {
    if (isLoading) return;
    if (isEditing) return;
    const p = (lastGeneratePrompt || finalPrompt || '').trim();
    if (!p) return;
    const action: LastVisualAction = {
      kind: 'generate',
      prompt: p,
      aspectRatio: lastGenerateAspect || aspectRatio,
      units: 4,
    };
    await runAction(action);
  };

const refinementPresets: Array<{ label: string; instruction: string }> = [
    { label: 'More Dramatic', instruction: 'make it more dramatic, cinematic lighting, high contrast' },
    { label: 'More Minimalist', instruction: 'make it more minimalist, clean composition, fewer elements' },
    { label: 'More Comedy', instruction: 'make it more playful and comedic, whimsical visual details' },
    { label: 'More Stage Lighting', instruction: 'add strong stage lighting, spotlights, theatrical atmosphere' },
    { label: 'More Audience Interaction', instruction: 'show audience interaction, spectators reacting, participatory feel' },
    { label: 'More Mysterious', instruction: 'make it more mysterious, subtle fog, magical glow, intrigue' },
    { label: 'Add Fog & Atmosphere', instruction: 'add fog, haze, and atmospheric depth with magical particles' },
    { label: 'Audience Perspective', instruction: 'shift to an audience perspective viewpoint, stage in the distance' },
  ];

  const handleRefine = async (presetLabel: string, instruction: string, baseOverride?: string) => {
    // Must have an existing prompt to refine.
    const base = (baseOverride ?? (promptUsed || finalPrompt || '')).trim();
    if (!base) {
      setError('Generate an image first, then refine it.');
      return;
    }

    const refinedPrompt = `${base}, ${instruction}`;

    // Telemetry (Phase 7)
    trackClientEvent({
      tool: 'visual_brainstorm',
      action: 'visual_refine_click',
      metadata: { label: presetLabel },
      outcome: "ALLOWED",
    });

    const action: LastVisualAction = {
      kind: 'refine',
      prompt: refinedPrompt,
      aspectRatio,
      label: presetLabel,
      instruction,
      units: 1,
    };
    await runAction(action);
  };

  const promptSummary = useMemo(() => {
    const p = String(promptUsed || finalPrompt || '').trim();
    if (!p) return '';
    return p.length > 220 ? `${p.slice(0, 220)}…` : p;
  }, [promptUsed, finalPrompt]);


const sessionsSorted = useMemo(() => {
  const arr = Array.isArray(sessions) ? [...sessions] : [];
  return arr.sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
  });
}, [sessions]);

const activeSession = useMemo(() => {
  if (!activeSessionId) return null;
  return sessions.find((s) => s.id === activeSessionId) ?? null;
}, [sessions, activeSessionId]);

  const safeCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const handleCopyPrompt = async () => {
    const ok = await safeCopy(String(promptUsed || finalPrompt || ''));
    if (!ok) setError('Copy failed. Your browser blocked clipboard access.');
  };

  const handleShare = async () => {
    try {
      const title = conceptTitle?.trim() || 'Magic Visual Idea';
      const text = String(promptUsed || finalPrompt || '').trim();

      // Prefer native share if available (best on mobile for ADMC booth).
      if ((navigator as any).share) {
        const payload: any = { title, text };
        if (shareFile) payload.files = [shareFile];
        else if (generatedImage) payload.url = generatedImage;
        await (navigator as any).share(payload);
        return;
      }

      // Fallback: copy a clean share snippet.
      const snippet = `${title}\n\nPrompt:\n${text}${generatedImage ? `\n\nImage:\n${generatedImage}` : ''}`;
      const ok = await safeCopy(snippet);
      if (!ok) setError('Share not supported. Copy failed due to browser clipboard restrictions.');
    } catch (e: any) {
      // User canceled share — no need to show an error.
      const msg = String(e?.message ?? '');
      if (!/abort|cancel/i.test(msg)) setError('Share failed.');
    }
  };

  const handleSaveImage = async () => {
    if (!generatedImage) return;
    if (!activeHistoryId) return;
    if (saveImageStatus === 'saving') return;
    setSaveImageStatus('saving');
    setError(null);

    // Telemetry (Phase 7)
    trackClientEvent({
      tool: 'visual_brainstorm',
      action: 'visual_save_click',
      metadata: { historyId: activeHistoryId, aspectRatio, title: conceptTitle?.trim() || '' },
      outcome: 'ALLOWED',
    });

    try {
      const now = Date.now();
      const activeItem = history.find((h) => h.id === activeHistoryId) || null;
      const mode = (activeItem?.kind || (loadingKind !== 'none' ? loadingKind : 'generate')) as any;
      const variations = Array.isArray(variationImages) && variationImages.length ? variationImages.length : 1;

      // Phase 11 — Save to Idea Vault Enhancement:
      // Store a rich, v2-ish payload inside `content` (still saved as type='image')
      // so the Idea Vault can render beautifully later.
      const richPayload = {
        format: 'maw.idea.visual.v1',
        tool: 'visual_brainstorm',
        timestamp: now,
        title: conceptTitle?.trim() || buildConceptTitle(),
        // Keep a short human-friendly display (useful for exports / clipboard views)
        display: `Prompt:\n${String(promptUsed || finalPrompt || '').trim()}`,
        structured: {
          imageUrl: generatedImage,
          promptUsed: String(promptUsed || finalPrompt || '').trim(),
          inputs: {
            objectProp: objectProp?.trim() || '',
            sceneSetting: sceneSetting?.trim() || '',
            style: style?.trim() || '',
            context: context?.trim() || '',
          },
          settings: {
            aspectRatio,
            mode,
            variations,
          },
          lineage: {
            historyId: activeHistoryId,
            parentHistoryId: activeItem?.parentHistoryId || null,
            sessionId: activeItem?.sessionId || activeSessionId || null,
          },
        },
        meta: {
          imageUrl: generatedImage,
          promptUsed: String(promptUsed || finalPrompt || '').trim(),
          aspectRatio,
          mode,
          variations,
          historyId: activeHistoryId,
          parentHistoryId: activeItem?.parentHistoryId || null,
          sessionId: activeItem?.sessionId || activeSessionId || null,
          createdAt: now,
        },
      };

      const saved = await saveIdea({
        type: 'image',
        content: JSON.stringify(richPayload),
        title: conceptTitle?.trim() || buildConceptTitle(),
        tags: ['visual', 'concept'],
      });
      setSavedIdeaId(saved.id);
      setSavedByHistory((prev) => ({ ...prev, [activeHistoryId]: saved.id }));

      // Telemetry (Phase 7)
      trackClientEvent({
        tool: 'visual_brainstorm',
        action: 'visual_save_success',
        metadata: { historyId: activeHistoryId, ideaId: saved.id, aspectRatio },
        outcome: 'SUCCESS_NOT_CHARGED',
      });

      setSaveImageStatus('saved');
      onIdeaSaved();
      await refreshIdeas(dispatch);
      window.setTimeout(() => setSaveImageStatus('idle'), 2000);
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to save idea.';
      // Telemetry (Phase 7)
      trackClientEvent({
        tool: 'visual_brainstorm',
        action: 'visual_request_error',
        metadata: { mode: 'save', historyId: activeHistoryId, aspectRatio, message: msg },
        outcome: 'ERROR_UPSTREAM',
      });
      setError(msg);
      setSaveImageStatus('idle');
    }
  };

  const openShowModal = (mode: 'add' | 'task') => {
    setShowModalMode(mode);
    setCreateNewShowTitle('');
    setShowModalOpen(true);
  };

  const ensureShowId = async (): Promise<string> => {
    if (createNewShowTitle.trim()) {
      const created = await showsService.createShow(createNewShowTitle.trim(), null as any, null as any);
      await refreshShows(dispatch);
      return String((created as any).id);
    }
    if (!showId) throw new Error('Please select a Show (or create a new one).');
    return String(showId);
  };

  const addToShowOrTask = async () => {
    if (!generatedImage) return;
    setError(null);
    try {
      const sid = await ensureShowId();
      const titleBase = conceptTitle?.trim() || buildConceptTitle();
      const title = showModalMode === 'task' ? `Build: ${titleBase}` : titleBase;
      const notes = `Prompt:\n${String(finalPrompt ?? '').trim()}\n\nImage:\n${generatedImage}`;

      await showsService.addTaskToShow(sid, {
        title,
        notes,
        priority: 'Medium',
        status: 'To-Do',
        createdAt: Date.now(),
        tags: ['visual', 'concept'],
      } as any);
      await refreshShows(dispatch);
      setShowModalOpen(false);
      try {
        localStorage.setItem('maw_showplanner_focus', JSON.stringify({ showId: sid, taskTitle: title, ts: Date.now() }));
      } catch {}
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add to Show.');
    }
  };
  
  const placeholderText = inputImagePreview
    ? "e.g., Add a wizard hat to the person in the image. Make the background a mystical forest."
    : "e.g., A sleek, futuristic magician's top hat made of chrome, with a holographic band.";

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Control Panel */}
        <div className="flex flex-col">
            <h2 className="text-xl font-bold text-slate-300 mb-2">Describe Your Vision</h2>
            <p className="text-slate-400 mb-4">
              {inputImagePreview
                ? "Describe the changes you want to make to the uploaded image."
                : "Generate concept art for props, costumes, or posters from scratch."
              }
            </p>

            {/* Phase 12: Booth Demo Optimization (collapsible) */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/25 p-4 mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setDemoDrawerOpen(v=>!v)}
                  >
                    <div className="text-base font-semibold text-slate-100">Booth Demo Tools</div>
                    <div className="text-xs text-slate-400">{demoDrawerOpen ? "▲" : "▼"}</div>
                  </div>
                  {demoDrawerOpen && (

                  <div className="text-sm text-slate-400 mt-0.5">
                    Fast demos with rotating presets + instant reset.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={resetDemoSession}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
                    title="Clear local session history + selections"
                  >
                    Reset Session
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoMode(v => !v)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      demoMode
                        ? "bg-amber-500/20 border-amber-400/40 text-amber-100 hover:bg-amber-500/25"
                        : "bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700"
                    }`}
                    title="Use curated sample outputs (no upstream dependency)"
                  >
                    {demoMode ? "Demo Mode: ON" : "Demo Mode: OFF"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-slate-500">Presets · Showing {safePresetPage * PRESETS_PER_PAGE + 1}–{Math.min((safePresetPage + 1) * PRESETS_PER_PAGE, demoPresets.length)} of {demoPresets.length}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goPrevPresetPage}
                    className="px-2 py-1 rounded-md text-xs font-semibold bg-slate-900/50 hover:bg-slate-900/70 text-slate-200 border border-slate-800"
                    title="Previous presets"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={goNextPresetPage}
                    className="px-2 py-1 rounded-md text-xs font-semibold bg-slate-900/50 hover:bg-slate-900/70 text-slate-200 border border-slate-800"
                    title="Next presets"
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {visibleDemoPresets.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-xl border border-slate-800 bg-slate-900/25 px-3 py-2 hover:bg-slate-900/35 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-100 leading-snug truncate">{p.title}</div>
                        <div className="mt-0.5 text-xs text-slate-400 truncate">
                          <span className="text-slate-300">{p.objectProp}</span>
                          <span className="mx-2 text-slate-600">•</span>
                          <span>{p.sceneSetting}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => applyPreset(p)}
                          className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-slate-900/60 hover:bg-slate-900/80 text-slate-100 border border-slate-800"
                        >
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => void runPreset(p)}
                          disabled={isLoading}
                          className="px-2.5 py-1.5 rounded-md text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white disabled:bg-slate-600 disabled:cursor-not-allowed"
                        >
                          Generate
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {demoMode && (
                <div className="mt-4 text-sm text-amber-100 flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full border border-amber-400/40 bg-amber-500/15">
                    Demo Mode Active
                  )
                  </span>
                  <span className="text-amber-200/80">
                    Curated sample images are used so your booth demo never times out.
                  </span>
                </div>
              )}
            </div>
<div className="space-y-4">
                <div>
                    <div className="flex justify-between items-baseline mb-1">
                        <label className="block text-sm font-medium text-slate-300">
                          {isEditing ? 'Editing Instructions' : 'Visual Prompt Builder'}
                        </label>
                        {(isEditing ? editPrompt : (objectProp || sceneSetting || style || context || promptOverride)) && (
                             <button
                                type="button"
                                onClick={() => (isEditing ? setEditPrompt('') : (setObjectProp(''), setSceneSetting(''), setStyle(''), setContext(''), setPromptOverride(''), setAdvancedPrompt(false)))}
                                className="px-2 py-0.5 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {isEditing ? (
                      <textarea
                        id="image-prompt"
                        rows={6}
                        value={editPrompt}
                        onChange={(e) => { setEditPrompt(e.target.value); setError(null); }}
                        placeholder={placeholderText}
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    ) : (
                      <div className="space-y-3">
                        {/* Object / Prop */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Object / Prop</label>
                          <input
                            value={objectProp}
                            onChange={(e) => { setObjectProp(e.target.value); setError(null); }}
                            placeholder="coin, rope, deck of cards..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Scene / Setting */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Scene / Setting</label>
                          <input
                            value={sceneSetting}
                            onChange={(e) => { setSceneSetting(e.target.value); setError(null); }}
                            placeholder="close-up table, stage illusion, street magic..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Style */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Style</label>
                          <input
                            value={style}
                            onChange={(e) => { setStyle(e.target.value); setError(null); }}
                            placeholder="mysterious, steampunk, dark magic, comedy..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Optional Context */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-400 mb-1">Optional Context</label>
                          <textarea
                            rows={3}
                            value={context}
                            onChange={(e) => { setContext(e.target.value); setError(null); }}
                            placeholder="Audience size, lighting conditions, show theme..."
                            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>

                        {/* Prompt preview + advanced override */}
                        <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-slate-400">Assembled Prompt</span>
                            <button
                              type="button"
                              onClick={() => setAdvancedPrompt(v => !v)}
                              className="text-xs font-semibold text-slate-300 hover:text-white"
                            >
                              {advancedPrompt ? 'Hide Advanced' : 'Advanced'}
                            </button>
                          </div>

                          {!advancedPrompt ? (
                            <p className="text-sm text-slate-200 break-words">{buildPrompt()}</p>
                          ) : (
                            <textarea
                              rows={4}
                              value={promptOverride}
                              onChange={(e) => { setPromptOverride(e.target.value); setError(null); }}
                              placeholder="Optional: override the full prompt (advanced)"
                              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                          )}
                        </div>
                      </div>
                    )}
                </div>
                 <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                    className="hidden"
                />
                {inputImagePreview ? (
                    <div className="relative w-full h-40 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden">
                        <img src={inputImagePreview} alt="Input preview" className="max-w-full max-h-full object-contain" />
                        <button onClick={handleRemoveImage} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white hover:bg-red-600 transition-colors" title="Remove image">
                            <TrashIcon className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                    <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-600 rounded-lg hover:bg-slate-800/50 hover:border-purple-500 transition-colors">
                        <CameraIcon className="w-10 h-10 text-slate-500 mb-2"/>
                        <span className="font-semibold text-slate-300">Upload an Image to Edit (Optional)</span>
                        <span className="text-sm text-slate-400">JPG, PNG, WEBP</span>
                    </button>
                )}
                {!inputImagePreview && (
                    <div>
                         <label className="block text-sm font-medium text-slate-300 mb-2">Aspect Ratio</label>
                         <div className="grid grid-cols-3 gap-2">
                            {(['1:1', '16:9', '9:16'] as const).map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => setAspectRatio(ratio)}
                                    className={`py-2 px-3 rounded-md transition-colors text-sm font-semibold ${
                                        aspectRatio === ratio
                                            ? 'bg-purple-600 text-white'
                                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                                    }`}
                                >
                                    {ratio}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="mt-4 flex flex-col gap-2">
                <button
                    onClick={handleSubmit}
                    disabled={isLoading || !finalPrompt.trim()}
                    className="w-full py-3 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed"
                >
                    {isLoading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>{loadingKind === 'edit' ? 'Applying your edit…' : loadingKind === 'refine' ? 'Refining…' : 'Generating concept art…'}</span>
                      </>
                    ) : (
                      <>
                        <WandIcon className="w-5 h-5" />
                        <span>Generate Image</span>
                      </>
                    )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleGenerateVariations()}
                  disabled={isLoading || isEditing || !(lastGeneratePrompt || '').trim()}
                  className="w-full py-2.5 flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/40 hover:bg-slate-900/70 text-slate-100 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Re-run the last prompt to generate a fresh set of variations"
                >
                  <span>Generate Variations</span>
                </button>
              </div>
                {error && (
                  <div className="mt-2 text-center">
                    <p className="text-red-400 text-sm">{lastFailedMessage || error}</p>
                    {lastFailedAction && !isLoading && (
                      <button
                        type="button"
                        onClick={() => runAction(lastFailedAction, { skipConsume: true, isRetry: true })}
                        className="mt-2 inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm font-semibold border border-slate-700"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                )}

                {/* Phase 10: Creative Session History Panel */}
<div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/35 p-4">
  <div className="flex items-center justify-between gap-3">
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400">Creative Sessions</div>
      <div className="text-sm text-slate-200 font-semibold mt-0.5">Re-open past brainstorms</div>
    </div>
    <button
      type="button"
      onClick={() => {
        setHistory([]);
        setActiveHistoryId(null);
        setGeneratedImage(null);
        setVariationImages([]);
        setVariationHistoryIds([]);
        setPromptUsed('');
        setConceptTitle('');
        setActiveSessionId(null);
      }}
      className="text-xs font-semibold px-2 py-1 rounded-md border border-slate-700 bg-slate-900/40 hover:bg-slate-900/70 text-slate-200"
      title="Start fresh (does not delete saved sessions)"
    >
      New
    </button>
  </div>

  {sessionsSorted.length === 0 ? (
    <div className="mt-3 text-sm text-slate-400">
      Your brainstorm sessions will appear here after you generate images.
    </div>
  ) : (
    <div className="mt-3 space-y-2 max-h-[320px] overflow-y-auto pr-1">
      {sessionsSorted.map((s) => {
        const isActive = s.id === activeSessionId;
        const prompt = (s.basePrompt || '').trim();
        const promptShort = prompt.length > 90 ? `${prompt.slice(0, 90)}…` : prompt;
        return (
          <div
            key={s.id}
            className={
              "flex items-start gap-3 rounded-lg border p-2 transition-colors " +
              (isActive ? "border-purple-500/60 bg-purple-900/10" : "border-slate-800 bg-slate-900/20 hover:bg-slate-900/35")
            }
          >
            <button
              type="button"
              onClick={() => openSession(s.id)}
              className="shrink-0 rounded-md overflow-hidden border border-slate-800 hover:border-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              title="Open session"
            >
              {s.coverImageUrl ? (
                <img src={s.coverImageUrl} alt="Session cover" className="h-12 w-16 object-cover" />
              ) : (
                <div className="h-12 w-16 bg-slate-800/50 flex items-center justify-center text-slate-500 text-xs">—</div>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-slate-100 truncate">
                  {promptShort || "Untitled session"}
                </div>
                {s.pinned && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-200 bg-amber-900/10">
                    Pinned
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {(s.history?.length ?? 0)} image{(s.history?.length ?? 0) === 1 ? "" : "s"} •{" "}
                {new Date(s.updatedAt || s.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => togglePinSession(s.id)}
                className="text-xs font-semibold px-2 py-1 rounded-md border border-slate-700 bg-slate-900/40 hover:bg-slate-900/70 text-slate-200"
                title={s.pinned ? "Unpin" : "Pin (favorite)"}
              >
                {s.pinned ? "★" : "☆"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  )}
</div>
            </div>
        </div>

        {/* Result Card Area */}
        <div className="flex items-start justify-center bg-slate-900/50 rounded-lg border border-slate-800 p-4 min-h-[300px]">
          {isLoading ? (
            <div className="w-full max-w-2xl">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 shadow-[0_18px_70px_-40px_rgba(0,0,0,0.9)] overflow-hidden">
                <div className="p-4 border-b border-slate-800/80">
                  <ImageLoadingIndicator label={loadingLabel} />
                </div>

                <div className="p-4">
                  {/* Phase 9: Skeleton placeholders for the 2×2 variations grid while generating. */}
                  {loadingKind === 'generate' ? (
                    <div className="grid grid-cols-2 gap-3">
                      {[0,1,2,3].map((i) => (
                        <div
                          key={`sk_${i}`}
                          className="rounded-xl overflow-hidden border border-slate-800/70 bg-slate-900/30 animate-pulse"
                        >
                          <div className="w-full h-[250px] bg-slate-800/40" />
                          <div className="p-2">
                            <div className="h-3 w-16 bg-slate-800/40 rounded" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden border border-slate-800/70 bg-slate-900/30 animate-pulse">
                      <div className="w-full h-[380px] bg-slate-800/40" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : generatedImage ? (
            <div className="w-full max-w-2xl">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 shadow-[0_18px_70px_-40px_rgba(0,0,0,0.9)] overflow-hidden">
                <div className="p-4 border-b border-slate-800/80">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wider text-slate-400">Concept Title</div>
                      <input
                        value={conceptTitle}
                        onChange={(e) => setConceptTitle(e.target.value)}
                        className="mt-1 w-full bg-transparent text-slate-100 text-lg font-semibold outline-none border-b border-transparent focus:border-purple-500/50"
                        placeholder={buildConceptTitle()}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] px-2 py-1 rounded-md border border-slate-700/60 bg-slate-900/40 text-slate-300">
                        {isEditing ? 'Edit' : 'Generate'}
                      </span>
                      <span className="text-[11px] px-2 py-1 rounded-md border border-slate-700/60 bg-slate-900/40 text-slate-300">
                        {aspectRatio}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs uppercase tracking-wider text-slate-400">Prompt Summary</div>
                    <div className="mt-1 text-sm text-slate-200 break-words">
                      {promptSummary || '—'}
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {/* Phase 5: Multi-image variations grid (2x2). */}
                  {(!isEditing && variationImages.length > 1) ? (
                    <div className="grid grid-cols-2 gap-3">
                      {variationImages.slice(0, 4).map((url, idx) => {
                        const isSel = url === generatedImage;
                        return (
                          <button
                            key={`${url.slice(0, 24)}_${idx}`}
                            type="button"
                            onClick={() => {
                              const hid = variationHistoryIds[idx];
                              if (hid) {
                                setActiveHistoryId(hid);
                                openDetail({ historyId: hid });
                              } else {
                                setGeneratedImage(url);
                                openDetail();
                              }
                            }}
                            className={
                              `relative rounded-xl overflow-hidden border shadow-lg transition-all duration-200 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-purple-500/40 ` +
                              (isSel ? 'border-purple-500/80' : 'border-slate-800/70 hover:border-slate-700')
                            }
                            title={`Variation ${idx + 1}`}
                          >
                            <img
                              src={url}
                              alt={`Generated concept art variation ${idx + 1}`}
                              className="w-full h-[250px] object-cover"
                            />
                            <div className="absolute top-2 left-2 text-[11px] px-2 py-1 rounded-md bg-black/55 text-slate-100 border border-white/10">
                              V{idx + 1}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="w-full flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => openDetail()}
                        className="rounded-xl overflow-hidden border border-slate-800/70 shadow-lg hover:border-slate-700 transition-all duration-200 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                        title="View details"
                      >
                        <img
                          src={generatedImage}
                          alt="Generated concept art"
                          className="max-w-full max-h-[520px] object-contain"
                        />
                      </button>
                    </div>
                  )}

                  {/* Phase 4: Refinement pipeline */}
                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Refine</div>
                    <div className="flex flex-wrap gap-2">
                      {refinementPresets.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => void handleRefine(p.label, p.instruction)}
                          disabled={isLoading || !generatedImage}
                          className="px-3 py-1.5 rounded-full text-sm font-semibold border border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 hover:border-purple-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {history.length > 1 && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between">
                          <div className="text-xs uppercase tracking-wider text-slate-400">History</div>
                          <div className="text-xs text-slate-500">Click a thumbnail to revisit</div>
                        </div>
                        <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                          {history.map((h) => {
                            const isActive = h.id === activeHistoryId;
                            const label = h.kind === 'refine' ? `Refine: ${h.refineLabel ?? ''}` : (h.kind === 'edit' ? 'Edit' : 'Generate');
                            return (
                              <button
                                key={h.id}
                                type="button"
                                onClick={() => setActiveHistoryId(h.id)}
                                title={label}
                                className={
                                  `relative shrink-0 rounded-lg overflow-hidden border transition-colors ` +
                                  (isActive ? 'border-purple-500/70' : 'border-slate-800 hover:border-slate-700')
                                }
                              >
                                <img
                                  src={h.imageUrl}
                                  alt={label}
                                  className="h-16 w-20 object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/55 text-[10px] text-slate-100 px-1 py-0.5 truncate">
                                  {h.kind === 'refine' ? (h.refineLabel ?? 'Refine') : (h.kind === 'edit' ? 'Edit' : 'Gen')}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-800/70">
                    <SaveActionBar
                      title="Next step:"
                      subtitle="Save this visual, then move it into a Show or Task."
                      saved={!!savedIdeaId}
                      savingLabel="Saving…"
                      savedLabel="Saved"
                      primary={{
                        label: 'Save Idea',
                        onClick: () => void handleSaveImage(),
                        disabled: !generatedImage || saveImageStatus === 'saving',
                        loading: saveImageStatus === 'saving',
                        tone: 'primary',
                      }}
                      secondaryLeft={{
                        label: 'Add to Show',
                        onClick: () => openShowModal('add'),
                        disabled: !savedIdeaId,
                        tone: 'secondary',
                      }}
                      secondaryRight={{
                        label: 'Convert to Task',
                        onClick: () => openShowModal('task'),
                        disabled: !savedIdeaId,
                        tone: 'secondary',
                      }}
                      utilities={[
                        {
                          label: isStrong ? 'Strong' : 'Mark Strong',
                          onClick: () => {
                            if (!activeHistoryId) return;
                            setStrongByHistory((prev) => ({ ...prev, [activeHistoryId]: !Boolean(prev[activeHistoryId]) }));
                            setIsStrong((v) => !v);
                          },
                          active: isStrong,
                          disabled: !savedIdeaId,
                        },
                        {
                          label: 'Copy Prompt',
                          onClick: () => void handleCopyPrompt(),
                          disabled: !finalPrompt?.trim(),
                        },
                        {
                          label: 'Share',
                          onClick: () => void handleShare(),
                          disabled: !generatedImage,
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500">
              <ImageIcon className="w-24 h-24 mx-auto mb-4" />
              <p>Your generated image will appear here.</p>
            </div>
          )}
        </div>

        {/* Phase 6: Image detail panel (click image to open) */}
        {detailOpen && detailItem ? (
          <div
            // Align to top (not vertically centered) so the Image Detail GUI appears toward the top of the page.
            // Allow scrolling if modal content exceeds the viewport height.
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-10 overflow-y-auto"
            onMouseDown={(e) => {
              // Close when clicking the backdrop.
              if (e.target === e.currentTarget) closeDetail();
            }}
          >
            <div className="w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-950/90 shadow-2xl overflow-hidden">
              <div className="flex items-start justify-between gap-4 p-4 border-b border-slate-800/80">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-slate-400">Image Detail</div>
                  <div className="mt-1 text-lg font-bold text-white truncate">
                    {detailItem.title || 'Visual Concept'}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                    <span className="px-2 py-1 rounded-md border border-slate-700/60 bg-slate-900/40">
                      {detailItem.kind === 'refine' ? `Refine${detailItem.refineLabel ? `: ${detailItem.refineLabel}` : ''}` : (detailItem.kind === 'edit' ? 'Edit' : 'Generate')}
                    </span>
                    <span className="px-2 py-1 rounded-md border border-slate-700/60 bg-slate-900/40">{aspectRatio}</span>
                    <span className="px-2 py-1 rounded-md border border-slate-700/60 bg-slate-900/40">
                      {new Date(detailItem.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="text-slate-300 hover:text-white px-2 py-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="p-4 border-b lg:border-b-0 lg:border-r border-slate-800/80">
                  <div className="rounded-xl border border-slate-800/70 bg-black/20 overflow-hidden">
                    <img
                      src={detailItem.imageUrl}
                      alt="Visual concept art full"
                      className="w-full max-h-[70vh] object-contain"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={detailItem.imageUrl}
                      download={`visual-brainstorm-${detailItem.id}.png`}
                      className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await safeCopy(String(detailItem.promptUsed || ''));
                        if (!ok) setError('Copy failed. Your browser blocked clipboard access.');
                      }}
                      className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold"
                    >
                      Copy Prompt
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  <div className="maw-card-flat">
                    <div className="text-sm font-semibold text-slate-200 mb-2">Prompt</div>
                    <div className="text-sm text-slate-200 whitespace-pre-wrap break-words">
                      {detailItem.promptUsed || '—'}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="maw-card-flat">
                      <div className="text-sm font-semibold text-slate-200 mb-2">Style</div>
                      <div className="text-sm text-slate-300 break-words">{style?.trim() || '—'}</div>
                    </div>
                    <div className="maw-card-flat">
                      <div className="text-sm font-semibold text-slate-200 mb-2">Generation Settings</div>
                      <div className="text-sm text-slate-300">
                        <div>Aspect: <span className="text-slate-100">{aspectRatio}</span></div>
                        <div>Mode: <span className="text-slate-100">{isEditing ? 'Edit' : 'Generate'}</span></div>
                        {!isEditing && variationImages.length > 1 ? (
                          <div>Variations: <span className="text-slate-100">{Math.min(4, variationImages.length)}</span></div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">Refine Again</div>
                    <div className="flex flex-wrap gap-2">
                      {refinementPresets.map((p) => (
                        <button
                          key={`detail_${p.label}`}
                          type="button"
                          onClick={() => {
                            closeDetail();
                            void handleRefine(p.label, p.instruction, detailItem.promptUsed);
                          }}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-full text-sm font-semibold border border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 hover:border-purple-500/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-3 maw-card-flat">
                      <div className="text-sm font-semibold text-slate-200 mb-2">Custom refine</div>
                      <textarea
                        value={customRefine}
                        onChange={(e) => setCustomRefine(e.target.value)}
                        placeholder="e.g., add golden rim lighting, keep background dark, include subtle magical particles"
                        className="w-full min-h-[90px] px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                      />
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            const instr = customRefine.trim();
                            if (!instr) return;
                            closeDetail();
                            void handleRefine('Custom', instr, detailItem.promptUsed);
                          }}
                          disabled={isLoading || !customRefine.trim()}
                          className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:bg-slate-700 disabled:cursor-not-allowed"
                        >
                          Refine
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Add to Show / Convert modal */}
        {showModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="maw-card w-full max-w-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {showModalMode === 'task' ? 'Convert to Task' : 'Add to Show'}
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">
                    Choose a Show, then we’ll add this visual as a planning task with the prompt + image link.
                  </p>
                </div>
                <button
                  onClick={() => setShowModalOpen(false)}
                  className="text-slate-300 hover:text-white px-2 py-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="maw-card-flat">
                  <div className="text-sm font-semibold text-slate-200 mb-2">Choose a Show</div>

                  <label className="block text-xs text-slate-400 mb-1">Existing show</label>
                  <select
                    value={showId}
                    onChange={(e) => setShowId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                  >
                    <option value="">Select…</option>
                    {showsSorted.map((s: any) => (
                      <option key={String(s.id)} value={String(s.id)}>
                        {s.title}
                      </option>
                    ))}
                  </select>

                  <div className="mt-3">
                    <label className="block text-xs text-slate-400 mb-1">Or create new show</label>
                    <input
                      value={createNewShowTitle}
                      onChange={(e) => setCreateNewShowTitle(e.target.value)}
                      placeholder="e.g., ADMC Visual Concepts"
                      className="w-full px-3 py-2 bg-slate-900 border border-white/10 rounded-md text-white"
                    />
                  </div>
                </div>

                <div className="maw-card-flat">
                  <div className="text-sm font-semibold text-slate-200 mb-2">Task Preview</div>
                  <div className="text-xs text-slate-400">Title</div>
                  <div className="mt-1 text-sm text-white break-words">
                    {showModalMode === 'task'
                      ? `Build: ${conceptTitle?.trim() || buildConceptTitle()}`
                      : conceptTitle?.trim() || buildConceptTitle()}
                  </div>

                  <div className="mt-3 text-xs text-slate-400">Notes</div>
                  <div className="mt-1 text-sm text-slate-200 whitespace-pre-wrap break-words max-h-[160px] overflow-auto rounded-md border border-slate-800/60 bg-slate-950/40 p-2">
                    {`Prompt:\n${String(finalPrompt ?? '').trim()}\n\nImage:\n${generatedImage}`}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModalOpen(false)}
                  className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void addToShowOrTask()}
                  className="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                >
                  {showModalMode === 'task' ? 'Create Task' : 'Add to Show'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </div>
  );
};

export default VisualBrainstorm;