import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Client, AiSparkAction } from '../types';
import { getClients, addClient, updateClient, deleteClient } from '../services/clientsService';
import { UsersCogIcon, TrashIcon, PencilIcon, WandIcon, MailIcon } from './icons';
// OPTION_A_POLISH: investor-ready hierarchy + micro-interactions + revenue display + auto status logic

type ClientX = Client & {
    tags?: string[];
    last_contacted?: string;
    last_show_title?: string;
    last_show_date?: string;
    related_shows?: { title: string; date?: string }[];
    booking_status?: 'prospect' | 'booked' | 'completed' | 'followup';
    currency?: string; // e.g., USD
    lifetime_value?: number; // total revenue from this client
    last_booking_value?: number; // last booking amount

};


type NoteEntry = { at: string; text: string };

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
    } catch { /* ignore */ }
    // Back-compat: treat existing notes string as one entry
    return [{ at: '', text: r }];
}



function getBookingStatusMeta(status?: ClientX['booking_status']): { label: string; cls: string } {
    switch (status) {
        case 'booked':
            return { label: 'Booked', cls: 'bg-emerald-900/30 border-emerald-700 text-emerald-200' };
        case 'completed':
            return { label: 'Completed', cls: 'bg-sky-900/30 border-sky-700 text-sky-200' };
        case 'followup':
            return { label: 'Follow-Up Needed', cls: 'bg-rose-900/30 border-rose-700 text-rose-200' };
        case 'prospect':
        default:
            return { label: 'Prospect', cls: 'bg-amber-900/30 border-amber-700 text-amber-200' };
    }
}

function getAppBasePath(): string {
    try {
        return window.location.pathname.startsWith('/app') ? '/app' : '';
    } catch {
        return '';
    }
}

function promptForReminderDate(defaultYmd?: string): string | null {
    const def = (defaultYmd || '').trim() || new Date().toISOString().slice(0, 10);
    const input = window.prompt('Follow-up date (YYYY-MM-DD):', def);
    if (input === null) return null; // cancelled
    const v = input.trim();
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        alert('Please enter a date in YYYY-MM-DD format.');
        return null;
    }
    const d = new Date(v + 'T00:00:00');
    if (Number.isNaN(d.getTime())) {
        alert('That date does not look valid.');
        return null;
    }
    return v;
}


const BOOKING_STATUS_LABEL: Record<NonNullable<ClientX['booking_status']>, string> = {
    prospect: 'Prospect',
    booked: 'Booked',
    completed: 'Completed',
    followup: 'Follow-Up Needed',
};

function statusPillClasses(status: NonNullable<ClientX['booking_status']>) {
    switch (status) {
        case 'booked':
            return 'bg-purple-500/15 border-purple-400/40 text-purple-200';
        case 'completed':
            return 'bg-slate-500/15 border-slate-400/40 text-slate-200';
        case 'followup':
            return 'bg-red-500/15 border-red-400/40 text-red-200';
        case 'prospect':
        default:
            return 'bg-amber-500/15 border-amber-400/40 text-amber-200';
    }
}

function getNextFollowUpDate(notesJson?: string): string | null {
    const entries = parseNotesTimeline(notesJson);
    // Look for the newest reminder line with a YYYY-MM-DD date
    for (const e of entries) {
        const m = e.text.match(/reach out on\s+(\d{4}-\d{2}-\d{2})/i);
        if (m?.[1]) return m[1];
    }
    return null;
}

function money(n?: number, currency?: string) {
    if (typeof n !== 'number' || Number.isNaN(n)) return '—';
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(n);
    } catch {
        return `$${Math.round(n)}`;
    }
}

function normalizeBookingStatus(client: ClientX): ClientX['booking_status'] {
    // Preserve explicit follow-up flag if set
    if (client.booking_status === 'followup') return 'followup';

    const today = new Date().toISOString().slice(0, 10);
    const showDate = client.last_show_date;

    if (showDate) {
        if (showDate < today) return 'completed';
        // show date in future/today implies booked
        return 'booked';
    }

    // if a booking value exists, treat as booked (light heuristic)
    if (typeof client.last_booking_value === 'number' && client.last_booking_value > 0) return 'booked';

    return client.booking_status || 'prospect';
}


function formatShortDate(iso?: string) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
}

interface ClientManagementProps {
    onClientsUpdate: (clients: Client[]) => void;
    onAiSpark: (action: AiSparkAction) => void;
}

const ClientModal: React.FC<{
    onClose: () => void;
    onSave: (clientData: Omit<ClientX, 'id'|'createdAt'>) => void;
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
    const [bookingStatus, setBookingStatus] = useState<ClientX['booking_status']>(clientToEdit?.booking_status || 'prospect');
    const [currency, setCurrency] = useState(clientToEdit?.currency || 'USD');
    const [lifetimeValue, setLifetimeValue] = useState<string>(clientToEdit?.lifetime_value?.toString() || '');
    const [lastBookingValue, setLastBookingValue] = useState<string>(clientToEdit?.last_booking_value?.toString() || '');
    const [relatedShows, setRelatedShows] = useState<{ title: string; date?: string }[]>(clientToEdit?.related_shows || []);
    const [newRelatedShowTitle, setNewRelatedShowTitle] = useState('');
    const [newRelatedShowDate, setNewRelatedShowDate] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
            name,
            company,
            email,
            phone,
            notes: JSON.stringify(notesTimeline),
            tags: tagsText.split(',').map(t => t.trim()).filter(Boolean),
            last_contacted: lastContacted || undefined,
            last_show_title: lastShowTitle || undefined,
            last_show_date: lastShowDate || undefined,
        } as any);
    };

    const modalTitle = clientToEdit ? 'Edit Client' : 'Add New Client';
    const buttonText = clientToEdit ? 'Save Changes' : 'Add Client';

    const modalContent = (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-lg border border-slate-700/40 bg-slate-900/80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <form id="client-form" onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
                    <h2 className="text-xl font-bold text-white">{modalTitle}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">Name*</label><input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                        <div><label htmlFor="company" className="block text-sm font-medium text-slate-300 mb-1">Company</label><input id="company" type="text" value={company} onChange={e => setCompany(e.target.value)} className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                        <div><label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">Email</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                        <div><label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">Phone</label><input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Booking Status</label>
                        <select
                            value={bookingStatus}
                            onChange={(e) => setBookingStatus(e.target.value as any)}
                            className="w-full px-3 py-2 rounded-md text-slate-100 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                        >
                            <option value="prospect">Prospect</option>
                            <option value="booked">Booked</option>
                            <option value="completed">Completed</option>
                            <option value="followup">Follow-Up Needed</option>
                        </select>
                    </div>

                    </div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-1">Tags</label>
                        <input
                            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                            value={tagsText}
                            onChange={(e) => setTagsText(e.target.value)}
                            placeholder="e.g., Corporate, Repeat, Holiday"
                        />
                        {tagsText.trim() ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {tagsText.split(',').map(t => t.trim()).filter(Boolean).slice(0, 8).map((t, idx) => (
                                    <span key={idx} className="px-2 py-0.5 text-[11px] rounded-full bg-slate-900/40 border border-slate-700 text-slate-200">{t}</span>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Last Contacted</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                                value={lastContacted}
                                onChange={(e) => setLastContacted(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Last Show Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                                value={lastShowDate}
                                onChange={(e) => setLastShowDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-1">Last Show Title</label>
                        <input
                            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                            value={lastShowTitle}
                            onChange={(e) => setLastShowTitle(e.target.value)}
                            placeholder="e.g., Science Time"
                        />
                    </div>


<label className="block text-sm font-medium text-slate-300 mb-1">Notes Timeline</label>
<div className="rounded-md border border-slate-700 bg-slate-950/30 p-3">
    {notesTimeline.length === 0 ? (
        <div className="text-sm text-slate-400">No notes yet. Add your first note below.</div>
    ) : (
        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
            {notesTimeline
                .slice()
                .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
                .map((n, idx) => (
                    <div key={idx} className="text-sm">
                        <div className="text-slate-400 text-xs mb-0.5">
                            {n.at ? formatShortDate(n.at) : 'Note'}
                        </div>
                        <div className="text-slate-100 whitespace-pre-wrap">{n.text}</div>
                    </div>
                ))}
        </div>
    )}

    <div className="mt-3">
        <label htmlFor="newNote" className="block text-xs font-medium text-slate-400 mb-1">Add a note (append-only)</label>
        <textarea
            id="newNote"
            rows={2}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="e.g., Met at the 2026 convention. Interested in a holiday party booking."
            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
        />
        <div className="mt-2 flex justify-end">
            <button
                type="button"
                onClick={() => {
                    const t = newNote.trim();
                    if (!t) return;
                    setNotesTimeline((prev) => [{ at: new Date().toISOString(), text: t }, ...prev]);
                    setNewNote('');
                }}
                className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm border border-slate-600 transition"
            >
                Add Note
            </button>
        </div>
    </div>
</div>

<div className="mt-4">
    <label className="block text-sm font-medium text-slate-300 mb-1">Related Shows</label>
    {relatedShows.length === 0 ? (
        <div className="text-sm text-slate-400 mb-2">No related shows yet. Add one below.</div>
    ) : (
        <div className="flex flex-wrap gap-2 mb-2">
            {relatedShows.slice(0, 6).map((s, idx) => (
                <button
                    key={idx}
                    type="button"
                    onClick={() => {
                        // Best-effort navigation hook (safe even if unused)
                        try {
                            localStorage.setItem('maw_open_show_title', s.title);
                            try {
                            window.dispatchEvent(
                                new CustomEvent('maw:navigate', { detail: { view: 'show-planner', showTitle: s.title } })
                            );
                        } catch {}
                        } catch {}
                    }}
                    className="px-2 py-1 rounded-md text-xs bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
                    title="Open in Show Planner"
                >
                    {s.title}{s.date ? ` • ${formatShortDate(s.date)}` : ''}
                </button>
            ))}
        </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
            type="text"
            value={newRelatedShowTitle}
            onChange={(e) => setNewRelatedShowTitle(e.target.value)}
            placeholder="Show title (e.g., Science Time)"
            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
        />
        <input
            type="date"
            value={newRelatedShowDate}
            onChange={(e) => setNewRelatedShowDate(e.target.value)}
            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
        />
    </div>
    <div className="mt-2 flex justify-end">
        <button
            type="button"
            onClick={() => {
                const title = newRelatedShowTitle.trim();
                if (!title) return;
                setRelatedShows((prev) => [{ title, date: newRelatedShowDate || undefined }, ...prev]);
                // Auto status logic: adding a show implies "Booked" (or "Completed" if date already passed)
                try {
                    const d = (newRelatedShowDate || '').trim();
                    if (d) {
                        const today = new Date().toISOString().slice(0, 10);
                        if (d < today) setBookingStatus('completed');
                        else setBookingStatus('booked');
                    } else {
                        if (bookingStatus === 'prospect') setBookingStatus('booked');
                    }
                } catch {}
                setNewRelatedShowTitle('');
                setNewRelatedShowDate('');
            }}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 text-sm border border-slate-600 transition"
        >
            Add Related Show
        </button>
    </div>
</div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="w-full py-2 rounded-md text-slate-300 font-bold text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50">Cancel</button>
                        <button type="submit" className="w-full py-2 rounded-md text-white font-bold text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50">{buttonText}</button>
                    </div>
                </form>
            </div>
        </div>
    );
    return createPortal(modalContent, document.body);
};


const ClientManagement: React.FC<ClientManagementProps> = ({ onClientsUpdate, onAiSpark }) => {
    const [clients, setClients] = useState<ClientX[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'prospect' | 'booked' | 'completed' | 'followup'>('all');
    const [tagFilter, setTagFilter] = useState<string>('all');
    const [flashStatusClientId, setFlashStatusClientId] = useState<string | null>(null);
    const [flashRevenueClientId, setFlashRevenueClientId] = useState<string | null>(null);


    useEffect(() => {
        const allClients = getClients();
        setClients(allClients);
        onClientsUpdate(allClients);
    }, [onClientsUpdate]);
    
    const handleSaveClient = (clientData: Omit<Client, 'id'|'createdAt'>) => {
        let updatedClients: any[];
        const prevStatus = (clientToEdit as any)?.booking_status as ClientX['booking_status'] | undefined;
        const prevLifetime = (clientToEdit as any)?.lifetime_value as number | undefined;

        if (clientToEdit) {
            updatedClients = updateClient(clientToEdit.id, clientData);
        } else {
            updatedClients = addClient(clientData as any);
        }

        // Micro-interactions: flash on status / revenue changes
        try {
            const savedId = clientToEdit
                ? clientToEdit.id
                : (updatedClients?.[updatedClients.length - 1]?.id as string | undefined);

            const saved = savedId ? (updatedClients as ClientX[]).find((c) => c.id === savedId) : undefined;
            const nextStatus = saved?.booking_status;
            const nextLifetime = saved?.lifetime_value;

            if (savedId && prevStatus && nextStatus && prevStatus !== nextStatus) {
                setFlashStatusClientId(savedId);
                window.setTimeout(() => setFlashStatusClientId(null), 900);
            }

            if (savedId && typeof prevLifetime === 'number' && typeof nextLifetime === 'number' && prevLifetime !== nextLifetime) {
                setFlashRevenueClientId(savedId);
                window.setTimeout(() => setFlashRevenueClientId(null), 900);
            }

            // Special case: if newly marked completed, also flash revenue line
            if (savedId && nextStatus === 'completed' && prevStatus !== 'completed') {
                setFlashStatusClientId(savedId);
                setFlashRevenueClientId(savedId);
                window.setTimeout(() => {
                    setFlashStatusClientId(null);
                    setFlashRevenueClientId(null);
                }, 1100);
            }
        } catch {}

        setClients(updatedClients as any);
        onClientsUpdate(updatedClients as any);
        setIsModalOpen(false);
        setClientToEdit(null);
    };


    const addNoteToClient = async (client: ClientX, noteText: string) => {
        const timeline = parseNotesTimeline((client as any).notes);
        const next = [{ at: new Date().toISOString(), text: noteText }, ...timeline];
        const updated: ClientX = { ...client, notes: JSON.stringify(next) } as any;
        updateClient(updated as any);
        const refreshed = getClients() as ClientX[];
        setClients(refreshed);
        onClientsUpdate(refreshed);
        return updated;
    };

    const handleFollowUpReminder = async (client: ClientX) => {
        // Lightweight date prompt (no calendar UI)
        const today = new Date();
        const def = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const chosen = promptForReminderDate(def);
        if (!chosen) return;

        const msg = `Follow-up reminder: reach out on ${chosen}.`;

        try {
            await addNoteToClient({ ...client, booking_status: 'followup' }, msg);
            try {
                await navigator.clipboard.writeText(msg);
            } catch {
                // ignore clipboard failures
            }
            alert('Reminder added to notes and copied to clipboard.');
        } catch (e) {
            console.error(e);
            alert('Could not add reminder. Please try again.');
        }
    };

    const handleCreateBooking = async (client: ClientX) => {
        // Best-effort handoff to Show Planner (safe even if Show Planner ignores these hints today)
        try {
            localStorage.setItem('maw_new_booking_client_name', client.name || '');
            localStorage.setItem('maw_new_booking_client_company', client.company || '');
            localStorage.setItem('maw_new_booking_client_email', client.email || '');
            localStorage.setItem('maw_new_booking_client_phone', client.phone || '');
        } catch {}

        // Also copy contact info for quick pasting
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(
                    `Client: ${client.name}\nCompany: ${client.company || ''}\nEmail: ${client.email || ''}\nPhone: ${client.phone || ''}`
                );
            }
        } catch {}

        // Navigate to Show Planner (no full reload)
        try {
            window.dispatchEvent(
                new CustomEvent('maw:navigate', {
                    detail: {
                        view: 'show-planner',
                        newBooking: true,
                        clientName: client.name || '',
                        clientEmail: client.email || '',
                    },
                })
            );
        } catch {}};

    const handleDeleteClient = (id: string) => {
        if (window.confirm("Are you sure you want to delete this client? This cannot be undone.")) {
            const updatedClients = deleteClient(id);
            setClients(updatedClients);
            onClientsUpdate(updatedClients);
        }
    };

    const openEditModal = (client: Client) => {
        setClientToEdit(client);
        setIsModalOpen(true);
    };

    const openAddModal = () => {
        setClientToEdit(null);
        setIsModalOpen(true);
    };

    
    const allTags = Array.from(
        new Set(
            (clients || [])
                .flatMap((c) => (c.tags || []).map((t) => t.trim()).filter(Boolean))
        )
    ).sort((a, b) => a.localeCompare(b));

    const filteredClients = (clients || []).filter((c) => {
        const q = searchQuery.trim().toLowerCase();
        const matchesQuery =
            !q ||
            (c.name || '').toLowerCase().includes(q) ||
            (c.company || '').toLowerCase().includes(q);

        const matchesStatus = statusFilter === 'all' || (c.booking_status || 'prospect') === statusFilter;

        const matchesTag = tagFilter === 'all' || (c.tags || []).includes(tagFilter);

        return matchesQuery && matchesStatus && matchesTag;
    });

return (
        <div className="flex-1 flex flex-col overflow-y-auto p-4 md:p-6 animate-fade-in">
            {isModalOpen && <ClientModal onClose={() => setIsModalOpen(false)} onSave={handleSaveClient} clientToEdit={clientToEdit} />}
            <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <UsersCogIcon className="w-8 h-8 text-purple-400" />
                    <h2 className="text-2xl font-bold text-slate-200 font-cinzel">Client Management</h2>
                </div>
                <button onClick={openAddModal} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors flex items-center gap-2 text-sm">
                    <WandIcon className="w-4 h-4" />
                    <span>Add New Client</span>
                </button>
            </header>


            {/* Tier 4: Mini Dashboard */}
            {clients.length > 0 && (
                <div className="mb-5 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="py-3 px-4 rounded-lg bg-slate-900/40 border border-slate-700">
                        <div className="text-xs text-slate-400">Upcoming Follow-Ups (7 days)</div>
                        <div className="text-2xl font-bold text-slate-100 mt-0.5">
                            {clients.filter(c => {
                                const d = getNextFollowUpDate(c.notes);
                                if (!d) return false;
                                const today = new Date().toISOString().slice(0, 10);
                                const max = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                                return d >= today && d <= max;
                            }).length}
                        </div>
                    </div>
                    <div className="py-3 px-4 rounded-lg bg-slate-900/40 border border-slate-700">
                        <div className="text-xs text-slate-400">Stale Clients (90+ days)</div>
                        <div className="text-2xl font-bold text-slate-100 mt-0.5">
                            {clients.filter(c => {
                                if (!c.last_contacted) return true;
                                const d = new Date(c.last_contacted + 'T00:00:00').getTime();
                                return Date.now() - d > 90 * 24 * 60 * 60 * 1000;
                            }).length}
                        </div>
                    </div>
                    <div className="py-3 px-4 rounded-lg bg-slate-900/40 border border-slate-700">
                        <div className="text-xs text-slate-400">Booked Clients</div>
                        <div className="text-2xl font-bold text-slate-100 mt-0.5">
                            {clients.filter(c => (c.booking_status || 'prospect') === 'booked').length}
                        </div>
                    </div>
                    <div className="py-3 px-4 rounded-lg bg-slate-900/40 border border-slate-700">
                        <div className="text-xs text-slate-400">Total Revenue (Lifetime)</div>
                        <div className="text-2xl font-bold text-slate-100 mt-0.5">
                            {money(clients.reduce((sum, c) => sum + (typeof c.lifetime_value === 'number' ? c.lifetime_value : 0), 0), clients.find(c => c.currency)?.currency || 'USD')}
                        </div>
                    </div>
                </div>
            )}

            {/* Tier 4: AI Insights (lightweight, rule-based for now) */}
            {clients.length > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-slate-900/25 border border-slate-700">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-slate-100">AI Insights</div>
                            <div className="text-xs text-slate-400">Quick wins based on your client activity.</div>
                        </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                        {clients
                            .filter(c => {
                                if (!c.last_contacted) return true;
                                const d = new Date(c.last_contacted + 'T00:00:00').getTime();
                                return Date.now() - d > 90 * 24 * 60 * 60 * 1000;
                            })
                            .slice(0, 3)
                            .map(c => (
                                <div key={c.id} className="p-3 rounded-md bg-slate-900/35 border border-slate-700">
                                    <div className="text-sm font-semibold text-slate-100">{c.name}</div>
                                    <div className="text-xs text-slate-400">Haven’t contacted in 90+ days</div>
                                    <div className="mt-2 flex gap-2">
                                        <button
                                            type="button"
                                            className="px-2 py-1 rounded-md text-xs bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60"
                                            onClick={() => {
                                                const today = new Date().toISOString().slice(0, 10);
                                                updateClient({ ...(c as any), last_contacted: today } as any);
                                                setClients(getClients() as ClientX[]);
                                            }}
                                        >
                                            Mark Contacted
                                        </button>
                                        <button
                                            type="button"
                                            className="px-2 py-1 rounded-md text-xs bg-purple-600/70 border border-purple-400/40 text-white hover:bg-purple-600 hover:shadow-md hover:shadow-purple-500/30 transition"
                                            onClick={() => onAiSpark({ type: 'draft-email', payload: { client: c, context: { bookingStatus: c.booking_status || 'prospect', lastShowTitle: c.last_show_title, lastShowDate: c.last_show_date, tags: c.tags || [], latestNote: parseNotesTimeline(c.notes)[0]?.text || '', relatedShows: c.related_shows || [], nextFollowUp: getNextFollowUpDate(c.notes), revenue: { last: c.last_booking_value, lifetime: c.lifetime_value, currency: c.currency || 'USD' } } } })}
                                        >
                                            Draft Email
                                        </button>
                                    </div>
                                </div>
                            ))}
                        {clients.filter(c => !c.last_contacted || (Date.now() - new Date((c.last_contacted || '1970-01-01') + 'T00:00:00').getTime() > 90 * 24 * 60 * 60 * 1000)).length === 0 && (
                            <div className="p-3 rounded-md bg-slate-900/20 border border-slate-700 text-slate-300 text-sm">
                                No stale clients detected. Nice work staying in touch.
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="flex-1">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search clients by name or company…"
                        className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                    />
                </div>
                <div className="flex gap-3">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-3 py-2 rounded-md text-slate-100 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                        title="Filter by booking status"
                    >
                        <option value="all">All Statuses</option>
                        <option value="prospect">Prospect</option>
                        <option value="booked">Booked</option>
                        <option value="completed">Completed</option>
                        <option value="followup">Follow-Up Needed</option>
                    </select>
                    <select
                        value={tagFilter}
                        onChange={(e) => setTagFilter(e.target.value)}
                        className="px-3 py-2 rounded-md text-slate-100 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                        title="Filter by tag"
                    >
                        <option value="all">All Tags</option>
                        {allTags.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
            </div>


            {filteredClients.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredClients.map(client => (
                        <div key={client.id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-5 flex flex-col justify-between shadow-lg shadow-black/30 hover:shadow-xl hover:-translate-y-0.5 transition-all">
                            <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg text-white">{client.name}</h3>
                                            <span className={`px-2 py-0.5 text-[11px] rounded-full border ${getBookingStatusMeta(client.booking_status).cls} ${flashStatusClientId === client.id ? 'animate-pulse' : ''}`}>
                                                {getBookingStatusMeta(client.booking_status).label}
                                            </span>
                                        </div>
                                        {client.company && <p className="text-sm text-slate-400">{client.company}</p>}
                                {client.tags && client.tags.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {client.tags.slice(0, 6).map((t, idx) => (
                                            <span key={idx} className="px-2 py-0.5 text-[11px] rounded-full bg-slate-900/40 border border-slate-700 text-slate-200">{t}</span>
                                        ))}
                                    </div>
                                )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button onClick={() => openEditModal(client)} className="p-2 text-slate-400 hover:text-amber-300 rounded-full hover:bg-slate-700"><PencilIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleDeleteClient(client.id)} className="p-2 text-slate-400 hover:text-red-400 rounded-full hover:bg-slate-700"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                </div>
                                <div className="text-sm space-y-1 text-slate-300 border-t border-slate-700/50 pt-2">
                                    {client.email && <p><strong className="text-slate-400">Email:</strong> {client.email}</p>}
                                    {client.phone && <p><strong className="text-slate-400">Phone:</strong> {client.phone}</p>}
                                    {typeof client.lifetime_value === 'number' && (
                                        <p className={`text-xs text-slate-400 mt-2 ${flashRevenueClientId === client.id ? 'animate-pulse' : ''}`}>
                                            <strong>Revenue:</strong> {money(client.lifetime_value, client.currency || 'USD')} lifetime
                                        </p>
                                    )}
                                    {client.last_contacted && <p className="text-xs text-slate-400 mt-2"><strong>Last contacted:</strong> {client.last_contacted}</p>}
                                    {(client.last_show_title || client.last_show_date) && (
                                        <p className="text-xs text-slate-400"><strong>Last show:</strong> {client.last_show_title || '—'}{client.last_show_date ? ` — ${client.last_show_date}` : ''}</p>
                                    )}
                                    {((client.related_shows && client.related_shows.length > 0) || client.last_show_title) && (
                                        <div className="mt-2">
                                            <div className="text-xs font-semibold text-slate-400 mb-1">Related Shows</div>
                                            <div className="flex flex-wrap gap-2">
                                                {(client.related_shows && client.related_shows.length > 0
                                                    ? client.related_shows
                                                    : [{ title: client.last_show_title || 'Show', date: client.last_show_date || undefined }])
                                                    .slice(0, 3)
                                                    .map((s, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => {
                                                                try {
                                                                    localStorage.setItem('maw_open_show_title', s.title);
                                                                    try {
                            window.dispatchEvent(
                                new CustomEvent('maw:navigate', { detail: { view: 'show-planner', showTitle: s.title } })
                            );
                        } catch {}
                                                                } catch {}
                                                            }}
                                                            className="px-2 py-1 rounded-md text-[11px] bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-800 transition"
                                                            title="Open in Show Planner"
                                                        >
                                                            {s.title}{s.date ? ` • ${formatShortDate(s.date)}` : ''}
                                                        </button>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {parseNotesTimeline(client.notes).length > 0 && (
                                    <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-md mt-3">
                                        <strong>Latest note:</strong> {parseNotesTimeline(client.notes)[0].text}
                                    </p>
                                )}
                            </div>
                             <div className="border-t border-slate-700/50 mt-3 pt-3">
                                <div className="flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const today = new Date().toISOString().slice(0, 10);
                                            const updated = { ...client, last_contacted: today };
                                            updateClient(updated as any);
                                            setClients(getClients() as ClientX[]);
                                            onAiSpark({ type: 'draft-email', payload: { client: updated, context: { bookingStatus: updated.booking_status || 'prospect', lastShowTitle: updated.last_show_title, lastShowDate: updated.last_show_date, tags: updated.tags || [], latestNote: parseNotesTimeline(updated.notes)[0]?.text || '', relatedShows: updated.related_shows || [] } } });
                                        }}
                                        title="Draft follow-up email"
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 hover:border-purple-400/40 hover:shadow-md hover:shadow-purple-500/20 transition-all"
                                    >
                                        <MailIcon className="w-4 h-4" />
                                        <span className="text-sm font-semibold">Email</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={async () => {
                                            const clip = `${client.name}${client.company ? `\n${client.company}` : ''}\nEmail: ${client.email || ''}\nPhone: ${client.phone || ''}`;
                                            try { await navigator.clipboard.writeText(clip); } catch {}
                                        }}
                                        title="Copy contact info"
                                        className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                        aria-label="Copy contact info"
                                    >
                                        📋
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleFollowUpReminder(client)}
                                        title="Add follow-up reminder (adds note + copies reminder)"
                                        className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                        aria-label="Add follow-up reminder"
                                    >
                                        🗓️
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleCreateBooking(client)}
                                        title="Create show / booking (opens Show Planner)"
                                        className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                        aria-label="Create show / booking"
                                    >
                                        🧾
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            
            {clients.length > 0 && filteredClients.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <h3 className="text-lg font-bold text-slate-300">No matching clients</h3>
                    <p className="text-slate-500">Try adjusting your search or filters.</p>
                </div>
            )}

{clients.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <UsersCogIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                    <h3 className="text-lg font-bold text-slate-400">Your Client List is Empty</h3>
                    <p className="text-slate-500">Clients are created automatically from bookings or can be added manually. Once you perform shows, feedback and follow-ups can connect here automatically.</p>
                </div>)}
        </div>
    );
};

export default ClientManagement;
