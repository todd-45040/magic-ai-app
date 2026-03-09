import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Client, AiSparkAction, Feedback, Show } from '../types';
import { getClients, addClient, updateClient, deleteClient } from '../services/clientsService';
import { createShow, addTaskToShow } from '../services/showsService';
import { listAllContractsForUser, type ContractRow } from '../services/contractsService';
import { useAppState } from '../store';
import { trackClientEvent } from '../services/telemetryClient';
import { generateResponse } from '../services/geminiService';
import {
  UsersCogIcon,
  TrashIcon,
  PencilIcon,
  WandIcon,
  MailIcon,
  SearchIcon,
  CalendarIcon,
  CopyIcon,
  NewspaperIcon,
  ChecklistIcon,
  StarIcon,
  EyeIcon,
  DollarSignIcon,
  FileTextIcon,
  LightbulbIcon,
  MegaphoneIcon,
  SendIcon,
} from './icons';

type ClientX = Client & {
  tags?: string[];
  last_contacted?: string;
  last_show_title?: string;
  last_show_date?: string;
  related_shows?: { title: string; date?: string }[];
};

type NoteEntry = { at: string; text: string };

type ClientActivityItem = {
  at: number | string;
  title: string;
  detail: string;
  kind: 'note' | 'show' | 'contract';
};

type ClientMetrics = {
  showCount: number;
  contractCount: number;
  avgRating: number | null;
  revenue: number;
  averageFee: number;
  lastShowLabel: string;
  lastShowTitle: string;
  lastShowTs: number | null;
  clientSinceLabel: string;
  latestNote: string | null;
  primaryVenue: string | null;
  relatedShows: Show[];
  relatedContracts: ContractRow[];
  feedbackCount: number;
  topReaction: string | null;
  topComment: string | null;
  activityTimeline: ClientActivityItem[];
  daysSinceLastShow: number | null;
};

function parseNotesTimeline(raw?: string): NoteEntry[] {
  const r = (raw || '').trim();
  if (!r) return [];
  try {
    const parsed = JSON.parse(r);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((x) => x && typeof x.text === 'string')
        .map((x) => ({ at: typeof x.at === 'string' ? x.at : '', text: String(x.text) }));
    }
  } catch {
    // ignore legacy plain text notes
  }
  return [{ at: '', text: r }];
}

function formatShortDate(value?: string | number | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
}

function getShowSortTs(show: Show): number {
  return show.performanceDate || show.updatedAt || show.createdAt || 0;
}

function getContractSortTs(contract: ContractRow): number {
  return new Date(contract.updated_at || contract.created_at || 0).getTime() || 0;
}

function formatContractStatus(status?: string | null) {
  const normalized = String(status || 'draft').toLowerCase();
  if (normalized === 'signed') return 'Signed';
  if (normalized === 'sent') return 'Sent';
  return 'Draft';
}

function getFeedbackReactionLabel(reaction?: string | null) {
  if (!reaction) return null;
  const raw = String(reaction).trim();
  const map: Record<string, string> = {
    '🎉': 'Celebration',
    '😲': 'Amazed',
    '😂': 'Laughing',
    '🤔': 'Curious',
    '❤️': 'Loved It',
    '👏': 'Applause',
    '😴': 'Low Energy',
  };
  return map[raw] || raw;
}

function getClientMetrics(client: ClientX, shows: Show[], feedback: Feedback[], contracts: ContractRow[]): ClientMetrics {
  const relatedShows = shows
    .filter((show) => show.clientId === client.id)
    .sort((a, b) => getShowSortTs(b) - getShowSortTs(a));

  const showIds = new Set(relatedShows.map((show) => show.id));
  const relatedContracts = contracts
    .filter((row) => showIds.has(row.show_id))
    .sort((a, b) => getContractSortTs(b) - getContractSortTs(a));
  const relatedFeedback = feedback.filter((item) => item.showId && showIds.has(item.showId));
  const ratings = relatedFeedback.map((item) => Number(item.rating)).filter((value) => Number.isFinite(value) && value > 0);
  const avgRating = ratings.length ? Number((ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toFixed(1)) : null;
  const revenue = relatedShows.reduce((sum, show) => sum + Number(show.finances?.performanceFee || 0), 0);
  const averageFee = relatedShows.length ? Math.round(revenue / relatedShows.length) : 0;
  const lastShow = relatedShows[0];
  const notes = parseNotesTimeline(client.notes);
  const latestNote = notes[0]?.text || null;
  const reactionCounts = new Map<string, number>();
  relatedFeedback.forEach((item) => {
    const label = getFeedbackReactionLabel(item.reaction);
    if (!label) return;
    reactionCounts.set(label, (reactionCounts.get(label) || 0) + 1);
  });
  const topReaction = Array.from(reactionCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topComment = relatedFeedback
    .filter((item) => String(item.comment || '').trim())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0]?.comment || null;

  const activityTimeline: ClientActivityItem[] = [
    ...notes.map((note) => ({
      at: note.at || client.createdAt,
      title: 'Client note added',
      detail: note.text,
      kind: 'note' as const,
    })),
    ...relatedShows.slice(0, 8).map((show) => ({
      at: show.performanceDate || show.updatedAt || show.createdAt,
      title: show.status === 'Completed' ? 'Show completed' : 'Show linked',
      detail: `${show.title}${show.venue ? ` • ${show.venue}` : ''}`,
      kind: 'show' as const,
    })),
    ...relatedContracts.slice(0, 8).map((contract) => {
      const linkedShow = relatedShows.find((show) => show.id === contract.show_id);
      return {
        at: contract.updated_at || contract.created_at || client.createdAt,
        title: `Contract ${formatContractStatus(contract.status).toLowerCase()}`,
        detail: `${linkedShow?.title || 'Linked performance'} • ${formatMoney(Number(linkedShow?.finances?.performanceFee || 0))}`,
        kind: 'contract' as const,
      };
    }),
  ]
    .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
    .slice(0, 8);

  const lastShowTs = lastShow ? getShowSortTs(lastShow) : (client.last_show_date ? new Date(client.last_show_date).getTime() : null);
  const daysSinceLastShow = lastShowTs ? Math.max(0, Math.floor((Date.now() - lastShowTs) / 86400000)) : null;

  return {
    showCount: relatedShows.length,
    contractCount: relatedContracts.length,
    avgRating,
    revenue,
    averageFee,
    lastShowLabel: lastShow ? formatShortDate(lastShow.performanceDate || lastShow.updatedAt || lastShow.createdAt) : (client.last_show_date ? formatShortDate(client.last_show_date) : 'No shows yet'),
    lastShowTitle: lastShow?.title || client.last_show_title || 'No shows linked yet',
    lastShowTs,
    clientSinceLabel: formatShortDate(client.createdAt),
    latestNote,
    primaryVenue: lastShow?.venue || null,
    relatedShows,
    relatedContracts,
    feedbackCount: relatedFeedback.length,
    topReaction,
    topComment,
    activityTimeline,
    daysSinceLastShow,
  };
}

interface ClientManagementProps {
  onClientsUpdate: (clients: Client[]) => void;
  onAiSpark: (action: AiSparkAction) => void;
  onOpenShowPlanner?: (showId: string | null, taskId?: string | null) => void;
  onNavigateToContracts?: () => void;
  onNavigateToMarketing?: () => void;
  onNavigateToFeedback?: () => void;
}

const ClientModal: React.FC<{
  onClose: () => void;
  onSave: (clientData: Omit<ClientX, 'id' | 'createdAt'>) => void;
  clientToEdit?: ClientX | null;
}> = ({ onClose, onSave, clientToEdit }) => {
  const [name, setName] = useState(clientToEdit?.name || '');
  const [company, setCompany] = useState(clientToEdit?.company || '');
  const [email, setEmail] = useState(clientToEdit?.email || '');
  const [phone, setPhone] = useState(clientToEdit?.phone || '');
  const [notesTimeline, setNotesTimeline] = useState<NoteEntry[]>(parseNotesTimeline(clientToEdit?.notes));
  const [newNote, setNewNote] = useState('');
  const [tagsText, setTagsText] = useState((clientToEdit?.tags || []).join(', '));
  const [lastContacted, setLastContacted] = useState(clientToEdit?.last_contacted || '');
  const [lastShowTitle, setLastShowTitle] = useState(clientToEdit?.last_show_title || '');
  const [lastShowDate, setLastShowDate] = useState(clientToEdit?.last_show_date || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      company: company.trim(),
      email: email.trim(),
      phone: phone.trim(),
      notes: JSON.stringify(notesTimeline),
      tags: tagsText.split(',').map((tag) => tag.trim()).filter(Boolean),
      last_contacted: lastContacted || undefined,
      last_show_title: lastShowTitle || undefined,
      last_show_date: lastShowDate || undefined,
    } as any);
  };

  const addNote = () => {
    const text = newNote.trim();
    if (!text) return;
    setNotesTimeline((prev) => [{ at: new Date().toISOString().slice(0, 10), text }, ...prev]);
    setNewNote('');
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <form id="client-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{clientToEdit ? 'Edit Client' : 'Add New Client'}</h2>
              <p className="mt-1 text-sm text-slate-400">Capture client details, recent notes, and follow-up context.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5">Close</button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-300">Name*</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            </div>
            <div>
              <label htmlFor="company" className="mb-1 block text-sm font-medium text-slate-300">Company</label>
              <input id="company" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            </div>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-300">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-300">Phone</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Last Contacted</label>
              <input type="date" value={lastContacted} onChange={(e) => setLastContacted(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Last Show Date</label>
              <input type="date" value={lastShowDate} onChange={(e) => setLastShowDate(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-300">Last Show Title</label>
            <input value={lastShowTitle} onChange={(e) => setLastShowTitle(e.target.value)} placeholder="e.g., Corporate Holiday Gala" className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-300">Tags</label>
            <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Corporate, Repeat, Holiday" className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
            {tagsText.trim() ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {tagsText.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 8).map((tag) => (
                  <span key={tag} className="rounded-full border border-purple-400/20 bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-100">{tag}</span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-200">Notes Timeline</div>
                <div className="text-xs text-slate-400">Keep a running log of contact history and client preferences.</div>
              </div>
            </div>

            <div className="mb-3 flex gap-2">
              <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note, follow-up reminder, or show preference…" className="flex-1 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40" />
              <button type="button" onClick={addNote} className="rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500">Add Note</button>
            </div>

            {notesTimeline.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">No notes yet. Add your first note above.</div>
            ) : (
              <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                {notesTimeline.map((note, idx) => (
                  <div key={`${note.at}-${idx}`} className="rounded-xl border border-white/8 bg-slate-950/60 p-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{note.at ? formatShortDate(note.at) : 'Note'}</div>
                    <div className="text-sm text-slate-200">{note.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-slate-950/90 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5">Cancel</button>
          <button type="submit" form="client-form" className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500">{clientToEdit ? 'Save Changes' : 'Add Client'}</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

const MetricTile: React.FC<{ label: string; value: string; accent?: 'purple' | 'amber' | 'cyan' | 'emerald' }> = ({ label, value, accent = 'purple' }) => {
  const accentClasses: Record<string, string> = {
    purple: 'from-purple-500/18 to-indigo-500/8 border-purple-400/20 text-purple-100',
    amber: 'from-amber-500/18 to-orange-500/8 border-amber-400/20 text-amber-100',
    cyan: 'from-cyan-500/18 to-sky-500/8 border-cyan-400/20 text-cyan-100',
    emerald: 'from-emerald-500/18 to-green-500/8 border-emerald-400/20 text-emerald-100',
  };
  return (
    <div className={`rounded-2xl border bg-gradient-to-br px-4 py-3 ${accentClasses[accent]}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">{label}</div>
      <div className="mt-1 text-xl font-bold text-white">{value}</div>
    </div>
  );
};

const ClientManagement: React.FC<ClientManagementProps> = ({
  onClientsUpdate,
  onAiSpark,
  onOpenShowPlanner,
  onNavigateToContracts,
  onNavigateToMarketing,
  onNavigateToFeedback,
}) => {
  const { shows, feedback } = useAppState();
  const [clients, setClients] = useState<ClientX[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientToEdit, setClientToEdit] = useState<ClientX | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [aiLoading, setAiLoading] = useState<'followup' | 'marketing' | 'pitch' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [followupEmail, setFollowupEmail] = useState('');
  const [marketingSuggestions, setMarketingSuggestions] = useState('');
  const [bookingPitch, setBookingPitch] = useState('');
  const hasTrackedOpenRef = useRef(false);
  const trackedClientIdRef = useRef<string | null>(null);

  useEffect(() => {
    setClients(getClients() as ClientX[]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const rows = await listAllContractsForUser();
        if (!cancelled) setContracts(rows);
      } catch {
        if (!cancelled) setContracts([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hasTrackedOpenRef.current) return;
    hasTrackedOpenRef.current = true;
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_management_open',
      metadata: {
        client_count: clients.length,
      },
    });
  }, [clients.length]);

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return clients;
    return clients.filter((client) => [client.name, client.company, client.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
  }, [clients, searchQuery]);

  useEffect(() => {
    if (!filteredClients.length) {
      setSelectedClientId(null);
      return;
    }
    if (!selectedClientId || !filteredClients.some((client) => client.id === selectedClientId)) {
      setSelectedClientId(filteredClients[0].id);
    }
  }, [filteredClients, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId || trackedClientIdRef.current === selectedClientId) return;
    trackedClientIdRef.current = selectedClientId;
    const client = clients.find((item) => item.id === selectedClientId);
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_selected',
      metadata: {
        client_id: selectedClientId,
        client_name: client?.name ?? null,
      },
    });
  }, [selectedClientId, clients]);

  const metricsByClient = useMemo(() => {
    const map = new Map<string, ClientMetrics>();
    clients.forEach((client) => {
      map.set(client.id, getClientMetrics(client, shows, feedback, contracts));
    });
    return map;
  }, [clients, shows, feedback, contracts]);

  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedClientId) || null, [clients, selectedClientId]);
  const selectedMetrics = selectedClient ? metricsByClient.get(selectedClient.id) : null;

  useEffect(() => {
    setAiError(null);
    setFollowupEmail('');
    setMarketingSuggestions('');
    setBookingPitch('');
    setAiLoading(null);
  }, [selectedClientId]);

  const refreshClients = () => {
    const next = getClients() as ClientX[];
    setClients(next);
    onClientsUpdate(next);
  };

  const openAddModal = () => {
    setClientToEdit(null);
    setIsModalOpen(true);
  };

  const openEditModal = (client: ClientX) => {
    setClientToEdit(client);
    setIsModalOpen(true);
  };

  const handleSaveClient = (clientData: Omit<ClientX, 'id' | 'createdAt'>) => {
    let nextClients: Client[];
    if (clientToEdit) {
      nextClients = updateClient(clientToEdit.id, clientData as any);
      setSelectedClientId(clientToEdit.id);
    } else {
      nextClients = addClient(clientData as any);
      const newest = nextClients[0] as ClientX | undefined;
      if (newest) setSelectedClientId(newest.id);
      void trackClientEvent({
        tool: 'client_management',
        action: 'client_created',
        metadata: {
          client_name: clientData.name,
          has_company: Boolean(clientData.company),
          has_email: Boolean(clientData.email),
        },
      });
    }
    setClients(nextClients as ClientX[]);
    onClientsUpdate(nextClients);
    setIsModalOpen(false);
    setClientToEdit(null);
  };

  const handleDeleteClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (!window.confirm(`Delete ${client?.name || 'this client'}? This cannot be undone.`)) return;
    const nextClients = deleteClient(clientId);
    setClients(nextClients as ClientX[]);
    onClientsUpdate(nextClients);
    if (selectedClientId === clientId) {
      setSelectedClientId(nextClients[0]?.id || null);
    }
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_deleted',
      metadata: {
        client_id: clientId,
        client_name: client?.name ?? null,
      },
    });
  };

  const handleCreateBooking = async (client: ClientX) => {
    try {
      const title = `${client.company || client.name} Booking`;
      const created = await createShow(title, `Show created from Client Management for ${client.name}.`, client.id);
      await addTaskToShow(created.id, { title: 'Confirm event details', priority: 'High', status: 'To-Do' } as any);
      onOpenShowPlanner?.(created.id);
    } catch (error) {
      console.error(error);
      window.alert('Unable to create booking right now.');
    }
  };

  const handleDraftEmail = (client: ClientX) => {
    const today = new Date().toISOString().slice(0, 10);
    updateClient(client.id, { last_contacted: today } as any);
    refreshClients();
    onAiSpark({ type: 'draft-email', payload: { client: { ...client, last_contacted: today } } });
  };

  const handleCopyContact = async (client: ClientX) => {
    const text = `${client.name}${client.company ? `\n${client.company}` : ''}${client.email ? `\nEmail: ${client.email}` : ''}${client.phone ? `\nPhone: ${client.phone}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // noop
    }
  };


  const handleOpenShow = (show: Show) => {
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_show_viewed',
      metadata: {
        client_id: selectedClient?.id ?? null,
        show_id: show.id,
        show_title: show.title,
      },
    });
    onOpenShowPlanner?.(show.id);
  };

  const handleViewContract = (contract: ContractRow) => {
    const linkedShow = selectedMetrics?.relatedShows.find((show) => show.id === contract.show_id);
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_contract_viewed',
      metadata: {
        client_id: selectedClient?.id ?? null,
        contract_id: contract.id,
        show_id: contract.show_id,
        show_title: linkedShow?.title ?? null,
        status: contract.status,
      },
    });
    onNavigateToContracts?.();
  };

  const handleViewFeedback = () => {
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_feedback_viewed',
      metadata: {
        client_id: selectedClient?.id ?? null,
        feedback_count: selectedMetrics?.feedbackCount ?? 0,
        average_rating: selectedMetrics?.avgRating ?? null,
      },
    });
    onNavigateToFeedback?.();
  };

  const handleAddQuickNote = () => {
    if (!selectedClient) return;
    const text = quickNote.trim();
    if (!text) return;
    const existing = parseNotesTimeline(selectedClient.notes);
    const nextNotes = [{ at: new Date().toISOString().slice(0, 10), text }, ...existing];
    updateClient(selectedClient.id, { notes: JSON.stringify(nextNotes) } as any);
    refreshClients();
    setQuickNote('');
    void trackClientEvent({
      tool: 'client_management',
      action: 'client_notes_added',
      metadata: {
        client_id: selectedClient.id,
        note_length: text.length,
      },
    });
  };

  const repeatBookingInsight = useMemo(() => {
    if (!selectedClient || !selectedMetrics) return '';
    if (selectedMetrics.showCount <= 0 || !selectedMetrics.lastShowTs) {
      return 'Book the first client event to start building repeat-booking predictions and retention prompts.';
    }
    const days = selectedMetrics.daysSinceLastShow ?? 0;
    const cadenceWindow = selectedMetrics.showCount >= 3 ? '6–9 months' : '8–12 months';
    let targetMonth = 'the next planning window';
    if (selectedMetrics.lastShowTs) {
      const d = new Date(selectedMetrics.lastShowTs);
      d.setMonth(d.getMonth() + (selectedMetrics.showCount >= 3 ? 7 : 9));
      targetMonth = d.toLocaleDateString(undefined, { month: 'long' });
    }
    if (days < 45) {
      return `This account is still warm. Recommended rebook window: ${targetMonth}, with a typical cadence of ${cadenceWindow}.`;
    }
    if (days < 150) {
      return `This client is entering a strong follow-up window. Suggested rebook timing: ${targetMonth}, based on a ${cadenceWindow} cadence.`;
    }
    return `This client may be ready for a win-back pitch now. Suggested rebook timing: ${targetMonth}, based on a ${cadenceWindow} cadence.`;
  }, [selectedClient, selectedMetrics]);

  const buildClientAiContext = () => {
    if (!selectedClient || !selectedMetrics) return '';
    const showsSummary = selectedMetrics.relatedShows.slice(0, 4).map((show) => `- ${show.title} | ${formatShortDate(show.performanceDate || show.updatedAt || show.createdAt)} | Fee ${formatMoney(Number(show.finances?.performanceFee || 0))}${show.venue ? ` | Venue ${show.venue}` : ''}`).join('\n') || '- No linked shows yet';
    const contractsSummary = selectedMetrics.relatedContracts.slice(0, 3).map((contract) => `- ${formatContractStatus(contract.status)} contract | Updated ${formatShortDate(contract.updated_at || contract.created_at)}`).join('\n') || '- No contracts linked yet';
    return [
      `Client name: ${selectedClient.name}`,
      `Company: ${selectedClient.company || 'n/a'}`,
      `Email: ${selectedClient.email || 'n/a'}`,
      `Phone: ${selectedClient.phone || 'n/a'}`,
      `Client since: ${selectedMetrics.clientSinceLabel}`,
      `Show count: ${selectedMetrics.showCount}`,
      `Contract count: ${selectedMetrics.contractCount}`,
      `Audience rating: ${selectedMetrics.avgRating ?? 'n/a'}`,
      `Top reaction: ${selectedMetrics.topReaction || 'n/a'}`,
      `Top comment: ${selectedMetrics.topComment || 'n/a'}`,
      `Total revenue: ${formatMoney(selectedMetrics.revenue)}`,
      `Average fee: ${formatMoney(selectedMetrics.averageFee)}`,
      `Last show: ${selectedMetrics.lastShowTitle} on ${selectedMetrics.lastShowLabel}`,
      `Latest note: ${selectedMetrics.latestNote || 'n/a'}`,
      `Repeat booking insight: ${repeatBookingInsight}`,
      'Recent shows:',
      showsSummary,
      'Recent contract signals:',
      contractsSummary,
    ].join('\n');
  };

  const runClientAiTask = async (kind: 'followup' | 'marketing' | 'pitch') => {
    if (!selectedClient || !selectedMetrics || aiLoading) return;
    setAiError(null);
    setAiLoading(kind);
    const systemInstruction = `You are Magic AI Wizard's client-retention assistant for professional magicians. Write concise, polished business copy that helps a magician retain clients, encourage repeat bookings, and pitch future events. Keep the tone professional, warm, persuasive, and specific. Avoid fluff. Format output in readable markdown with short sections or bullets when useful.`;
    const context = buildClientAiContext();
    const promptByKind = {
      followup: `Using the client context below, write a professional follow-up email thanking the client for the recent performance and suggesting a future booking opportunity. Include a strong subject line and a short CTA.\n\n${context}`,
      marketing: `Using the client context below, generate a short "Suggested Opportunities" list for this client. Give 4-6 specific event or campaign ideas a magician could pitch next. After the bullet list, add a 2-sentence recommendation on which opportunity to prioritize first and why.\n\n${context}`,
      pitch: `Using the client context below, write a short booking pitch/proposal for this client's next corporate event. Include a headline, a short positioning paragraph, 3 bullet benefits, and a closing CTA.\n\n${context}`,
    } as const;

    try {
      const result = await generateResponse(promptByKind[kind], systemInstruction);
      if (String(result || '').startsWith('Error:')) throw new Error(String(result).replace(/^Error:\s*/, ''));
      if (kind === 'followup') {
        setFollowupEmail(result);
        void trackClientEvent({ tool: 'client_management', action: 'client_ai_followup_generated', outcome: 'SUCCESS_NOT_CHARGED', metadata: { client_id: selectedClient.id, show_count: selectedMetrics.showCount, revenue: selectedMetrics.revenue } });
      } else if (kind === 'marketing') {
        setMarketingSuggestions(result);
        void trackClientEvent({ tool: 'client_management', action: 'client_ai_marketing_generated', outcome: 'SUCCESS_NOT_CHARGED', metadata: { client_id: selectedClient.id, show_count: selectedMetrics.showCount, avg_rating: selectedMetrics.avgRating } });
      } else {
        setBookingPitch(result);
        void trackClientEvent({ tool: 'client_management', action: 'client_ai_pitch_generated', outcome: 'SUCCESS_NOT_CHARGED', metadata: { client_id: selectedClient.id, contract_count: selectedMetrics.contractCount, average_fee: selectedMetrics.averageFee } });
      }
    } catch (error: any) {
      setAiError(error?.message || 'Unable to generate AI client intelligence right now.');
    } finally {
      setAiLoading(null);
    }
  };

  return (
    <div className="relative min-h-[70vh] rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.10),transparent_24%),rgba(2,6,23,0.88)] p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 rounded-3xl border border-white/5" />

      {isModalOpen && <ClientModal onClose={() => setIsModalOpen(false)} onSave={handleSaveClient} clientToEdit={clientToEdit} />}

      <header className="relative mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-purple-400/20 bg-purple-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-100">
            <UsersCogIcon className="h-4 w-4" />
            Manage • Client Intelligence
          </div>
          <h2 className="font-cinzel text-3xl font-bold text-white sm:text-4xl">Client Management</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-300 sm:text-base">
            Turn contacts into a usable business dashboard. Search clients, review value at a glance, and jump directly into booking, contracts, and follow-up workflows.
          </p>
        </div>
        <button onClick={openAddModal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(168,85,247,0.28)] transition hover:from-purple-500 hover:to-fuchsia-400">
          <WandIcon className="h-4 w-4" />
          <span>Add New Client</span>
        </button>
      </header>

      <div className="relative grid grid-cols-1 gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-4 shadow-[0_0_32px_rgba(15,23,42,0.35)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-white">Client List</div>
              <div className="text-xs text-slate-400">Search and scan your highest-value accounts.</div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{filteredClients.length} shown</div>
          </div>

          <div className="relative mb-4">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients, companies, or email…"
              className="w-full rounded-2xl border border-white/10 bg-slate-900/80 py-3 pl-10 pr-3 text-sm text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
            />
          </div>

          <div className="max-h-[860px] space-y-3 overflow-y-auto pr-1">
            {filteredClients.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-8 text-center">
                <UsersCogIcon className="mx-auto mb-3 h-10 w-10 text-slate-500" />
                <div className="text-sm font-semibold text-slate-300">No matching clients</div>
                <div className="mt-1 text-xs text-slate-500">Try a different search or add a new client.</div>
              </div>
            ) : (
              filteredClients.map((client) => {
                const metrics = metricsByClient.get(client.id)!;
                const isActive = client.id === selectedClientId;
                return (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? 'border-purple-400/40 bg-gradient-to-br from-purple-500/16 to-indigo-500/8 shadow-[0_0_22px_rgba(168,85,247,0.22)]'
                        : 'border-white/8 bg-slate-900/70 hover:border-white/15 hover:bg-slate-900/90'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">{client.name}</div>
                        <div className="truncate text-sm text-slate-400">{client.company || 'Independent / direct booking'}</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                        {metrics.showCount} show{metrics.showCount === 1 ? '' : 's'}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-white/8 bg-slate-950/55 px-3 py-2">
                        <div className="text-slate-400">Rating</div>
                        <div className="mt-1 font-semibold text-white">{metrics.avgRating ? `⭐ ${metrics.avgRating}` : 'No data'}</div>
                      </div>
                      <div className="rounded-xl border border-white/8 bg-slate-950/55 px-3 py-2">
                        <div className="text-slate-400">Revenue</div>
                        <div className="mt-1 font-semibold text-white">{formatMoney(metrics.revenue)}</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Last show</span>
                      <span className="font-medium text-slate-300">{metrics.lastShowLabel}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section className="rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-[0_0_32px_rgba(15,23,42,0.35)] sm:p-5">
          {!selectedClient || !selectedMetrics ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 bg-slate-950/45 px-6 text-center">
              <UsersCogIcon className="mb-4 h-16 w-16 text-slate-500" />
              <div className="text-xl font-semibold text-slate-200">Your Client Dashboard is Ready</div>
              <p className="mt-2 max-w-md text-sm text-slate-400">Add a client to begin building a professional CRM workflow inside Magic AI Wizard.</p>
              <button onClick={openAddModal} className="mt-5 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-500">Add Your First Client</button>
            </div>
          ) : (
            <>
              <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(30,41,59,0.92),rgba(15,23,42,0.9))] p-5 sm:p-6">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100">
                      <StarIcon className="h-3.5 w-3.5" />
                      Client Profile Header
                    </div>
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/25 to-indigo-500/15 text-xl font-bold text-white shadow-[0_0_22px_rgba(168,85,247,0.22)]">
                        {selectedClient.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-2xl font-bold text-white sm:text-3xl">{selectedClient.name}</h3>
                        <p className="mt-1 truncate text-sm text-slate-300 sm:text-base">{selectedClient.company || 'Independent client relationship'}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                          {selectedClient.email ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{selectedClient.email}</span> : null}
                          {selectedClient.phone ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{selectedClient.phone}</span> : null}
                          {selectedMetrics.primaryVenue ? <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Primary venue: {selectedMetrics.primaryVenue}</span> : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => openEditModal(selectedClient)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10">
                      <span className="inline-flex items-center gap-2"><PencilIcon className="h-4 w-4" />Edit</span>
                    </button>
                    <button onClick={() => handleDeleteClient(selectedClient.id)} className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/15">
                      <span className="inline-flex items-center gap-2"><TrashIcon className="h-4 w-4" />Delete</span>
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <MetricTile label="Shows" value={String(selectedMetrics.showCount)} accent="purple" />
                  <MetricTile label="Contracts" value={String(selectedMetrics.contractCount)} accent="cyan" />
                  <MetricTile label="Audience Rating" value={selectedMetrics.avgRating ? `⭐ ${selectedMetrics.avgRating}` : 'No data'} accent="amber" />
                  <MetricTile label="Revenue" value={formatMoney(selectedMetrics.revenue)} accent="emerald" />
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 text-sm text-slate-300 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Client Since</div>
                    <div className="mt-1 font-semibold text-white">{selectedMetrics.clientSinceLabel}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Last Show</div>
                    <div className="mt-1 font-semibold text-white">{selectedMetrics.lastShowTitle}</div>
                    <div className="text-xs text-slate-400">{selectedMetrics.lastShowLabel}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Audience Responses</div>
                    <div className="mt-1 font-semibold text-white">{selectedMetrics.feedbackCount}</div>
                    <div className="text-xs text-slate-400">Linked to this client’s shows</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                <div className="mb-3">
                  <div className="text-sm font-semibold text-white">Workflow Actions</div>
                  <div className="text-xs text-slate-400">Jump into the tools you use most often from this client record.</div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <button onClick={() => handleCreateBooking(selectedClient)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-purple-400/25 bg-gradient-to-br from-purple-500/18 to-indigo-500/8 px-4 py-3 text-sm font-semibold text-white transition hover:from-purple-500/24 hover:to-indigo-500/14">
                    <CalendarIcon className="h-4 w-4" />
                    Book Show
                  </button>
                  <button onClick={() => onNavigateToContracts?.()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/12 to-sky-500/6 px-4 py-3 text-sm font-semibold text-white transition hover:from-cyan-500/18 hover:to-sky-500/10">
                    <ChecklistIcon className="h-4 w-4" />
                    Generate Contract
                  </button>
                  <button onClick={() => handleDraftEmail(selectedClient)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                    <MailIcon className="h-4 w-4" />
                    Send Email
                  </button>
                  <button onClick={() => onNavigateToMarketing?.()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-amber-500/12 to-orange-500/6 px-4 py-3 text-sm font-semibold text-white transition hover:from-amber-500/18 hover:to-orange-500/10">
                    <NewspaperIcon className="h-4 w-4" />
                    Marketing Campaign
                  </button>
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(91,33,182,0.22),rgba(15,23,42,0.92))] p-4 sm:p-5 shadow-[0_0_28px_rgba(139,92,246,0.12)]">
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-100">
                      <LightbulbIcon className="h-4 w-4" />
                      AI Client Intelligence
                    </div>
                    <div className="mt-3 text-lg font-semibold text-white">Retention + booking assistant</div>
                    <div className="mt-1 max-w-3xl text-sm text-slate-300">Generate polished follow-up copy, smarter event ideas, and a ready-to-send booking pitch based on this client’s show history, contracts, and audience response.</div>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 xl:max-w-xs">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/90">Repeat Booking Predictor</div>
                    <div className="mt-2 leading-6">{repeatBookingInsight}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                  <button onClick={() => void runClientAiTask('followup')} disabled={!!aiLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-60">
                    <SendIcon className="h-4 w-4" />
                    {aiLoading === 'followup' ? 'Generating Follow-Up…' : 'Generate Follow-Up Email'}
                  </button>
                  <button onClick={() => void runClientAiTask('marketing')} disabled={!!aiLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-60">
                    <LightbulbIcon className="h-4 w-4" />
                    {aiLoading === 'marketing' ? 'Generating Ideas…' : 'AI Marketing Suggestions'}
                  </button>
                  <button onClick={() => void runClientAiTask('pitch')} disabled={!!aiLoading} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3 text-sm font-semibold text-fuchsia-100 transition hover:bg-fuchsia-500/15 disabled:cursor-not-allowed disabled:opacity-60">
                    <MegaphoneIcon className="h-4 w-4" />
                    {aiLoading === 'pitch' ? 'Creating Pitch…' : 'Create Booking Pitch'}
                  </button>
                </div>

                {aiError ? (
                  <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{aiError}</div>
                ) : null}

                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><SendIcon className="h-4 w-4 text-cyan-300" /> Follow-Up Email</div>
                    <div className="min-h-[180px] whitespace-pre-wrap text-sm leading-6 text-slate-200">{followupEmail || 'Generate a tailored thank-you email with a rebooking CTA for this client.'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><LightbulbIcon className="h-4 w-4 text-amber-300" /> Suggested Opportunities</div>
                    <div className="min-h-[180px] whitespace-pre-wrap text-sm leading-6 text-slate-200">{marketingSuggestions || 'Generate AI marketing suggestions to surface likely repeat-booking angles for this account.'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><MegaphoneIcon className="h-4 w-4 text-fuchsia-300" /> Booking Pitch</div>
                    <div className="min-h-[180px] whitespace-pre-wrap text-sm leading-6 text-slate-200">{bookingPitch || 'Create a concise proposal you can adapt for the client’s next corporate or seasonal event.'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
                <div className="space-y-5">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Performance History</div>
                        <div className="text-xs text-slate-400">Linked shows for this client with direct Show Planner access.</div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{selectedMetrics.relatedShows.length} linked</div>
                    </div>

                    {selectedMetrics.relatedShows.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-8 text-center text-sm text-slate-400">
                        No shows linked to this client yet. Use <span className="font-semibold text-slate-200">Book Show</span> to create the first one.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-white/8">
                        <div className="grid grid-cols-[120px_minmax(0,1fr)_110px_120px] gap-3 bg-white/5 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                          <div>Date</div>
                          <div>Event</div>
                          <div>Fee</div>
                          <div>Audience Score</div>
                        </div>
                        <div className="divide-y divide-white/6">
                          {selectedMetrics.relatedShows.map((show) => {
                            const showFeedback = feedback.filter((item) => item.showId === show.id && Number(item.rating) > 0);
                            const showAvg = showFeedback.length
                              ? (showFeedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / showFeedback.length).toFixed(1)
                              : null;
                            return (
                              <button
                                key={show.id}
                                type="button"
                                onClick={() => handleOpenShow(show)}
                                className="grid w-full grid-cols-[120px_minmax(0,1fr)_110px_120px] gap-3 px-4 py-3 text-left text-sm transition hover:bg-white/5"
                              >
                                <div className="text-slate-300">{formatShortDate(show.performanceDate || show.updatedAt || show.createdAt)}</div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-white">{show.title}</div>
                                  <div className="truncate text-xs text-slate-400">{show.venue || 'Venue not set'}</div>
                                </div>
                                <div className="font-medium text-slate-200">{formatMoney(Number(show.finances?.performanceFee || 0))}</div>
                                <div className="text-slate-200">{showAvg ? `⭐ ${showAvg}` : 'No data'}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">Contracts</div>
                          <div className="text-xs text-slate-400">Contract records tied to this client’s linked shows.</div>
                        </div>
                        <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{selectedMetrics.relatedContracts.length} total</div>
                      </div>

                      {selectedMetrics.relatedContracts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-8 text-center text-sm text-slate-400">
                          No contracts linked yet. Generate the first contract from this client record.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedMetrics.relatedContracts.slice(0, 4).map((contract) => {
                            const linkedShow = selectedMetrics.relatedShows.find((show) => show.id === contract.show_id);
                            return (
                              <div key={contract.id} className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-semibold text-white">{linkedShow?.title || 'Linked performance'}</div>
                                    <div className="mt-1 text-xs text-slate-400">{formatContractStatus(contract.status)} • Version {contract.version}</div>
                                  </div>
                                  <button onClick={() => handleViewContract(contract)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/15">
                                    <EyeIcon className="h-4 w-4" />
                                    View Contract
                                  </button>
                                </div>
                                <div className="mt-3 text-sm text-slate-300">Amount: <span className="font-semibold text-white">{formatMoney(Number(linkedShow?.finances?.performanceFee || 0))}</span></div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">Audience Feedback</div>
                          <div className="text-xs text-slate-400">Performance intelligence tied back to client results.</div>
                        </div>
                        <button onClick={handleViewFeedback} className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/15">
                          <EyeIcon className="h-4 w-4" />
                          View Full Feedback
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Average Rating</div>
                          <div className="mt-2 text-2xl font-bold text-white">{selectedMetrics.avgRating ? `⭐ ${selectedMetrics.avgRating}` : 'No data'}</div>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Top Reaction</div>
                          <div className="mt-2 text-2xl font-bold text-white">{selectedMetrics.topReaction || 'No data'}</div>
                        </div>
                      </div>

                      <div className="mt-3 rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Top Comment</div>
                        <div className="mt-2 text-sm text-white">{selectedMetrics.topComment || 'No comments collected from linked shows yet.'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Client Revenue</div>
                        <div className="text-xs text-slate-400">Lifetime value and average booking economics for this account.</div>
                      </div>
                      <DollarSignIcon className="h-5 w-5 text-emerald-300" />
                    </div>

                    <div className="space-y-3 text-sm text-slate-300">
                      <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total Shows</div>
                        <div className="mt-2 text-xl font-bold text-white">{selectedMetrics.showCount}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total Revenue</div>
                        <div className="mt-2 text-xl font-bold text-white">{formatMoney(selectedMetrics.revenue)}</div>
                      </div>
                      <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Average Fee</div>
                        <div className="mt-2 text-xl font-bold text-white">{formatMoney(selectedMetrics.averageFee)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-slate-950/45 p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">Client Activity</div>
                        <div className="text-xs text-slate-400">A mini CRM timeline for notes, shows, and contracts.</div>
                      </div>
                      <button onClick={() => handleCopyContact(selectedClient)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10">
                        <CopyIcon className="h-4 w-4" />
                        Copy Contact
                      </button>
                    </div>

                    <div className="rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Quick Add Note</div>
                      <div className="mt-3 flex flex-col gap-3">
                        <textarea
                          value={quickNote}
                          onChange={(e) => setQuickNote(e.target.value)}
                          rows={3}
                          placeholder="Add a client update, follow-up reminder, or show note..."
                          className="w-full rounded-2xl border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-purple-500 focus:ring-1 focus:ring-purple-500/40"
                        />
                        <button onClick={handleAddQuickNote} className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-500">
                          <FileTextIcon className="h-4 w-4" />
                          Save Note
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {selectedMetrics.activityTimeline.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 px-4 py-8 text-center text-sm text-slate-400">
                          No activity has been logged for this client yet.
                        </div>
                      ) : (
                        selectedMetrics.activityTimeline.map((item, index) => (
                          <div key={`${item.kind}-${index}-${item.title}`} className="relative rounded-2xl border border-white/8 bg-slate-950/55 p-4">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{formatShortDate(item.at)}</div>
                            <div className="mt-2 flex items-start gap-3">
                              <div className={`mt-0.5 h-2.5 w-2.5 rounded-full ${item.kind === 'note' ? 'bg-purple-400' : item.kind === 'contract' ? 'bg-cyan-400' : 'bg-emerald-400'}`} />
                              <div>
                                <div className="font-semibold text-white">{item.title}</div>
                                <div className="mt-1 text-sm text-slate-300">{item.detail}</div>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default ClientManagement;
