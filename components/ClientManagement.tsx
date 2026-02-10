import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Client, AiSparkAction } from '../types';

// Extended client fields for UI-level CRM enhancements
type ClientEx = Client & {
  tags?: string[];
  last_contacted?: string; // ISO date string
  last_show?: { title: string; date?: string };
};
import { getClients, addClient, updateClient, deleteClient } from '../services/clientsService';
import { UsersCogIcon, TrashIcon, PencilIcon, WandIcon, MailIcon } from './icons';

interface ClientManagementProps {
    onClientsUpdate: (clients: Client[]) => void;
    onAiSpark: (action: AiSparkAction) => void;
}

const ClientModal: React.FC<{
    onClose: () => void;
    onSave: (clientData: Omit<Client, 'id'|'createdAt'>) => void;
    clientToEdit?: Client | null;
}> = ({ onClose, onSave, clientToEdit }) => {
    const [name, setName] = useState(clientToEdit?.name || '');
    const [company, setCompany] = useState(clientToEdit?.company || '');
    const [email, setEmail] = useState(clientToEdit?.email || '');
    const [phone, setPhone] = useState(clientToEdit?.phone || '');
    const [notes, setNotes] = useState(clientToEdit?.notes || '');

    const [tagsText, setTagsText] = useState('');
    const [lastContacted, setLastContacted] = useState('');
    const [lastShowTitle, setLastShowTitle] = useState('');
    const [lastShowDate, setLastShowDate] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({ name, company, email, phone, notes });
    };

    const modalTitle = clientToEdit ? 'Edit Client' : 'Add New Client';
    const buttonText = clientToEdit ? 'Save Changes' : 'Add Client';

    const modalContent = (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
            <div className="w-full max-w-lg -purple-500 rounded-lg shadow-2xl text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" onClick={(e) => e.stopPropagation()}>
                <form id="client-form" onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h2 className="text-xl font-bold text-white">{modalTitle}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">Name*</label><input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus className="w-full px-3 py-2 -slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                        <div><label htmlFor="company" className="block text-sm font-medium text-slate-300 mb-1">Company</label><input id="company" type="text" value={company} onChange={e => setCompany(e.target.value)} className="w-full px-3 py-2 -slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                        <div><label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">Email</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 -slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                        <div><label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">Phone</label><input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 -slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                    </div>
                    <div>
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
                            <label className="block text-sm font-medium text-slate-300 mb-1">Last Show</label>
                            <input
                                className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                                value={lastShowTitle}
                                onChange={(e) => setLastShowTitle(e.target.value)}
                                placeholder="e.g., Science Time"
                            />
                            <input
                                type="date"
                                className="mt-2 w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50"
                                value={lastShowDate}
                                onChange={(e) => setLastShowDate(e.target.value)}
                            />
                        </div>

                        <label htmlFor="notes" className="block text-sm font-medium text-slate-300 mb-1">Notes</label><textarea id="notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Met at the 2026 convention. Interested in a holiday party booking." className="w-full px-3 py-2 -slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50" /></div>
                    <div className="flex gap-3 pt-2">
                        
                                <div className="flex items-center justify-between gap-2">
                                    <button
                                        onClick={() => {
                                            const today = new Date().toISOString().slice(0, 10);
                                            const updated = { ...(client as ClientEx), last_contacted: today };
                                            updateClient(updated as any);
                                            setClients(getClients() as ClientEx[]);
                                            onAiSpark({ type: 'draft-email', payload: { client: updated } });
                                        }}
                                        title="Draft follow-up email"
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                    >
                                        <MailIcon className="w-4 h-4" />
                                        <span className="text-sm font-semibold">Email</span>
                                    </button>

                                    <button
                                        onClick={async () => {
                                            const text = `${client.name}${client.company ? `
${client.company}` : ''}
Email: ${client.email || ''}
Phone: ${client.phone || ''}`;
                                            try { await navigator.clipboard.writeText(text); } catch {}
                                        }}
                                        title="Copy contact info"
                                        className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                        aria-label="Copy contact info"
                                    >
                                        📋
                                    </button>

                                    <button
                                        onClick={() => alert('Follow-up reminders are coming soon.')}
                                        title="Add follow-up reminder (coming soon)"
                                        className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                        aria-label="Add follow-up reminder"
                                    >
                                        🗓️
                                    </button>

                                    <button
                                        onClick={() => alert('Booking creation will connect to Show Planner in a future update.')}
                                        title="Create show / booking (coming soon)"
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
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <UsersCogIcon className="w-16 h-16 mx-auto text-slate-600 mb-4" />
                    <h3 className="text-lg font-bold text-slate-400">Your Client List is Empty</h3>
                    <p className="text-slate-500">Click "Add New Client" to start building your professional network.</p>
                </div>
            )}
        </div>
    );
};

export default ClientManagement;