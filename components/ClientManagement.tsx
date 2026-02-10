import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Client, AiSparkAction } from '../types';
import { getClients, addClient, updateClient, deleteClient } from '../services/clientsService';
import { UsersCogIcon, TrashIcon, PencilIcon, WandIcon, MailIcon } from './icons';

type ClientX = Client & {
    tags?: string[];
    last_contacted?: string;
    last_show_title?: string;
    last_show_date?: string;
};

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
    const [notes, setNotes] = useState(clientToEdit?.notes || '');
    const [tagsText, setTagsText] = useState((clientToEdit?.tags || []).join(', '));
    const [lastContacted, setLastContacted] = useState(clientToEdit?.last_contacted || '');
    const [lastShowTitle, setLastShowTitle] = useState(clientToEdit?.last_show_title || '');
    const [lastShowDate, setLastShowDate] = useState(clientToEdit?.last_show_date || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSave({
            name,
            company,
            email,
            phone,
            notes,
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
            <div className="w-full max-w-lg border border border/30 rounded-lg shadow-2xl text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50" onClick={(e) => e.stopPropagation()}>
                <form id="client-form" onSubmit={handleSubmit} className="p-6 space-y-4">
                    <h2 className="text-xl font-bold text-white">{modalTitle}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-1">Name*</label><input id="name" type="text" value={name} onChange={e => setName(e.target.value)} required autoFocus className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50" /></div>
                        <div><label htmlFor="company" className="block text-sm font-medium text-slate-300 mb-1">Company</label><input id="company" type="text" value={company} onChange={e => setCompany(e.target.value)} className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50" /></div>
                        <div><label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1">Email</label><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50" /></div>
                        <div><label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-1">Phone</label><input id="phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50" /></div>
                    </div>
                    <div>
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-1">Tags</label>
                        <input
                            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50"
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
                                className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50"
                                value={lastContacted}
                                onChange={(e) => setLastContacted(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Last Show Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50"
                                value={lastShowDate}
                                onChange={(e) => setLastShowDate(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-slate-300 mb-1">Last Show Title</label>
                        <input
                            className="w-full px-3 py-2 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50"
                            value={lastShowTitle}
                            onChange={(e) => setLastShowTitle(e.target.value)}
                            placeholder="e.g., Science Time"
                        />
                    </div>

<label htmlFor="notes" className="block text-sm font-medium text-slate-300 mb-1">Notes</label><textarea id="notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Met at the 2026 convention. Interested in a holiday party booking." className="w-full px-3 py-2 border-slate-600 rounded-md text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50" /></div>
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="w-full py-2 rounded-md text-slate-300 font-bold text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50">Cancel</button>
                        <button type="submit" className="w-full py-2 rounded-md text-white font-bold text-slate-100 placeholder:text-slate-400 bg-slate-900/70 border border-slate-600 focus:outline-none focus:border border border/30 focus:ring-1 focus:ringborder border border/30/50">{buttonText}</button>
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

    useEffect(() => {
        const allClients = getClients();
        setClients(allClients);
        onClientsUpdate(allClients);
    }, [onClientsUpdate]);
    
    const handleSaveClient = (clientData: Omit<Client, 'id'|'createdAt'>) => {
        let updatedClients;
        if (clientToEdit) {
            updatedClients = updateClient(clientToEdit.id, clientData);
        } else {
            updatedClients = addClient(clientData as any);
        }
        setClients(updatedClients);
        onClientsUpdate(updatedClients);
        setIsModalOpen(false);
        setClientToEdit(null);
    };

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

            {clients.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {clients.map(client => (
                        <div key={client.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start gap-2 mb-2">
                                    <div>
                                        <h3 className="font-bold text-lg text-white">{client.name}</h3>
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
                                    {client.last_contacted && <p className="text-xs text-slate-400 mt-2"><strong>Last contacted:</strong> {client.last_contacted}</p>}
                                    {(client.last_show_title || client.last_show_date) && (
                                        <p className="text-xs text-slate-400"><strong>Last show:</strong> {client.last_show_title || '—'}{client.last_show_date ? ` — ${client.last_show_date}` : ''}</p>
                                    )}
                                </div>
                                {client.notes && <p className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-md mt-3"><strong>Notes:</strong> {client.notes}</p>}
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
                                            onAiSpark({ type: 'draft-email', payload: { client: updated } });
                                        }}
                                        title="Draft follow-up email"
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
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
                                        onClick={() => alert('Follow-up reminders are coming soon.')}
                                        title="Add follow-up reminder (coming soon)"
                                        className="px-3 py-2 rounded-md bg-slate-900/40 border border-slate-700 text-slate-200 hover:bg-slate-900/60 transition"
                                        aria-label="Add follow-up reminder"
                                    >
                                        🗓️
                                    </button>

                                    <button
                                        type="button"
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
            )}

            {clients.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
                    <UsersCogIcon className="w-16 h-16 mx-auto textborder-slate-600 mb-4" />
                    <h3 className="text-lg font-bold text-slate-400">Your Client List is Empty</h3>
                    <p className="text-slate-500">Click "Add New Client" to start building your professional network.</p>
                </div>)}
        </div>
    );
};

export default ClientManagement;