
import React, { useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { CONTRACT_GENERATOR_SYSTEM_INSTRUCTION } from '../constants';
import { FileTextIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, CopyIcon } from './icons';
import { updateShow } from '../services/showsService';
import { createContractVersion } from '../services/contractsService';
import type { Client, Show, User } from '../types';

interface ContractGeneratorProps {
    user: User;
    clients: Client[];
    shows: Show[];
    onShowsUpdate: (shows: Show[]) => void;
    onNavigateToShowPlanner: (showId: string) => void;
    onIdeaSaved: () => void;
}

type ContractSections = Required<NonNullable<Show['contract']>>;

const LoadingIndicator: React.FC = () => (
    <div className="flex flex-col items-center justify-center text-center p-8">
        <div className="relative">
            <WandIcon className="w-16 h-16 text-purple-400 animate-pulse" />
            <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
                 <div className="w-24 h-24 border-t-2 border-purple-300 rounded-full animate-spin"></div>
            </div>
        </div>
        <p className="text-slate-300 mt-4 text-lg">Drafting your agreement...</p>
        <p className="text-slate-400 text-sm">Ensuring all the details are in place.</p>
    </div>

const parseCurrencyToNumber = (value: string): number => {
    const cleaned = (value || '').toString().replace(/[^0-9.]/g, '');
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : 0;
};

);

const ContractGenerator: React.FC<ContractGeneratorProps> = ({ user, clients, shows, onShowsUpdate, onNavigateToShowPlanner, onIdeaSaved }) => {
    // Form State
    const [performerName, setPerformerName] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedShowId, setSelectedShowId] = useState<string>('');
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientAddress, setClientAddress] = useState('');
    const [eventTitle, setEventTitle] = useState('');
    const [eventType, setEventType] = useState('');
    const [eventDate, setEventDate] = useState('');
    const [eventTime, setEventTime] = useState('');
    const [eventLocation, setEventLocation] = useState('');
    const [performanceLength, setPerformanceLength] = useState('');
    const [performanceFee, setPerformanceFee] = useState('');
    const [depositAmount, setDepositAmount] = useState('');
    const [depositDueDate, setDepositDueDate] = useState('');
    const [specialRequirements, setSpecialRequirements] = useState('');
    const [cancellationPolicy, setCancellationPolicy] = useState('Deposit is non-refundable if Client cancels within 30 days of the event date. If Performer cancels, the deposit will be fully refunded.');

    // Control State
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ContractSections | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
    const [saveToShowStatus, setSaveToShowStatus] = useState<'idle' | 'saved'>('idle');
    
    const feeNum = useMemo(() => parseCurrencyToNumber(performanceFee), [performanceFee]);
    const isFormValid = performerName.trim() && clientName.trim() && eventDate.trim() && feeNum > 0;

    const responseSchema = useMemo(() => ({
        type: Type.OBJECT,
        properties: {
            performanceDetails: { type: Type.STRING },
            paymentTerms: { type: Type.STRING },
            technicalRequirements: { type: Type.STRING },
            cancellationPolicy: { type: Type.STRING },
            forceMajeure: { type: Type.STRING },
            signatureBlock: { type: Type.STRING },
        },
        required: ['performanceDetails', 'paymentTerms', 'technicalRequirements', 'cancellationPolicy', 'forceMajeure', 'signatureBlock']
    }), []);

    const handleClientSelect = (id: string) => {
        setSelectedClientId(id);
        const c = clients.find(x => x.id === id);
        if (!c) return;
        setClientName(c.name ?? '');
        setClientEmail(c.email ?? '');
        setClientPhone(c.phone ?? '');
        // Address is not yet a first-class Client field everywhere; allow manual entry.
        // If you later add an address column, just map it here.
        const inferredAddress = (c.notes || '').includes('Address:') ? (c.notes || '').split('Address:')[1]?.split('\n')[0]?.trim() : '';
        setClientAddress(inferredAddress || '');
    };

    const handleShowSelect = (id: string) => {
        setSelectedShowId(id);
        const s = shows.find(x => x.id === id);
        if (!s) return;
        setEventTitle(s.title ?? '');
        // Show Planner stores fee inside finances where available.
        const fee = (s.finances as any)?.performanceFee;
        if (typeof fee === 'number' && !Number.isNaN(fee) && fee > 0) setPerformanceFee(String(fee));
        // Use description as a helpful notes seed.
        if (s.description && !specialRequirements) setSpecialRequirements(String(s.description));
        // If a contract already exists, load it so the user can tweak/version.
        if ((s as any).contract) {
            const existing = (s as any).contract as ContractSections;
            if (existing?.performanceDetails) setResult(existing);
        }
    };

    const handleGenerate = async () => {
        if (!isFormValid) {
            setError("Please fill in all required fields (*).");
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        setCopyStatus('idle');
        setSaveToShowStatus('idle');

        const prompt = `
You are drafting a professional performance contract for a magician.

Return ONLY JSON matching the provided schema.

Contract context:
- Performer (Magician) Name/Company: ${performerName}
- Client Name: ${clientName}
- Client Email: ${clientEmail}
- Client Phone: ${clientPhone}
- Client Address: ${clientAddress}

Event details:
- Event Title: ${eventTitle}
- Event Type: ${eventType}
- Event Date: ${eventDate}
- Event Time: ${eventTime}
- Event Location/Address: ${eventLocation}
- Performance Length: ${performanceLength}

Financials:
- Total Performance Fee: $${performanceFee}
- Deposit Amount: $${depositAmount}
- Deposit Due Date: ${depositDueDate}
- Balance Due Date: The day of the event, prior to the performance.

Rider / Requirements:
${specialRequirements}

Cancellation Policy (base language):
${cancellationPolicy}

Guidelines:
- Keep language concise, professional, and plain-English.
- Avoid jurisdiction-specific legal advice.
- Use headings inside each section where appropriate.
`;
        
        try {
          const response = await generateStructuredResponse(prompt, CONTRACT_GENERATOR_SYSTEM_INSTRUCTION, responseSchema, user);
          const normalized: ContractSections = {
            performanceDetails: String(response?.performanceDetails ?? ''),
            paymentTerms: String(response?.paymentTerms ?? ''),
            technicalRequirements: String(response?.technicalRequirements ?? ''),
            cancellationPolicy: String(response?.cancellationPolicy ?? ''),
            forceMajeure: String(response?.forceMajeure ?? ''),
            signatureBlock: String(response?.signatureBlock ?? ''),
            generatedAt: Date.now(),
            clientId: selectedClientId || undefined,
          };
          setResult(normalized);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
          setIsLoading(false);
        }
    };
  
    const handleSave = () => {
        if (result) {
            const title = `Contract: ${performerName} & ${clientName}`;
            const text = formatContractAsText(result, { performerName, clientName, eventTitle });
            saveIdea('text', text, title);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleCopy = () => {
        if (result) {
            const text = formatContractAsText(result, { performerName, clientName, eventTitle });
            navigator.clipboard.writeText(text);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    const handleDownload = () => {
        if (result) {
            const text = formatContractAsText(result, { performerName, clientName, eventTitle });
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Performance_Contract_${clientName.replace(/\s/g, '_')}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    const handleSaveToShow = async () => {
        if (!selectedShowId || !result) return;

        // Build a plain-text contract for storage + sharing
        const contractText =
            `PERFORMANCE DETAILS\n${result.performanceDetails}\n\n` +
            `PAYMENT TERMS\n${result.paymentTerms}\n\n` +
            `TECHNICAL REQUIREMENTS\n${result.technicalRequirements}\n\n` +
            `CANCELLATION POLICY\n${result.cancellationPolicy}\n\n` +
            `FORCE MAJEURE\n${result.forceMajeure}\n\n` +
            `SIGNATURES\n${result.signatureBlock}\n`;

        try {
            setError(null);

            // Primary path: save into the contracts table (versioned)
            await createContractVersion({
                showId: selectedShowId,
                clientId: selectedClientId || null,
                content: contractText,
                status: 'draft',
                structured: result,
            });

            setSaveToShowStatus('saved');
            setTimeout(() => setSaveToShowStatus('idle'), 2000);

            // Navigate after a successful DB write
            onNavigateToShowPlanner(selectedShowId);
            return;
        } catch (e: any) {
            console.error('Save contract failed (contracts table):', e);
            const msg = e?.message ? String(e.message) : 'Failed to save contract to database.';
            setError(
                msg +
                    '  (Tip: If Row Level Security is enabled on contracts, you need INSERT/SELECT policies for auth.uid() = user_id.)'
            );

            // Backward compatibility fallback: try to persist onto the show record if supported
            try {
                const updatedShows = await updateShow(selectedShowId, { contract: result } as any);
                onShowsUpdate(updatedShows);
            } catch (fallbackErr) {
                console.warn('Legacy fallback save-to-show also failed:', fallbackErr);
            }
        }
    };

    const updateSection = (key: keyof ContractSections, value: string) => {
        setResult((prev) => prev ? ({ ...prev, [key]: value }) : prev);
    };

    const formatContractAsText = (
        sections: ContractSections,
        meta: { performerName: string; clientName: string; eventTitle: string }
    ) => {
        const titleLine = meta.eventTitle ? `${meta.eventTitle}` : 'Performance Agreement';
        return [
            titleLine,
            `Performer: ${meta.performerName}`,
            `Client: ${meta.clientName}`,
            '',
            '--- Performance Details ---',
            sections.performanceDetails,
            '',
            '--- Payment Terms ---',
            sections.paymentTerms,
            '',
            '--- Technical Requirements ---',
            sections.technicalRequirements,
            '',
            '--- Cancellation Policy ---',
            sections.cancellationPolicy,
            '',
            '--- Force Majeure ---',
            sections.forceMajeure,
            '',
            '--- Signature Block ---',
            sections.signatureBlock,
            '',
        ].join('\n');
    };

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Performance Contract Generator</h2>
                <p className="text-slate-400 mb-4">Fill in the gig details to create a professional performance agreement. Fields marked with * are required.</p>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="select-client" className="block text-sm font-medium text-slate-300 mb-1">Select Client</label>
                            <select
                                id="select-client"
                                value={selectedClientId}
                                onChange={(e) => handleClientSelect(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white"
                            >
                                <option value="">-- Choose a client --</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="select-show" className="block text-sm font-medium text-slate-300 mb-1">Select Show (optional)</label>
                            <select
                                id="select-show"
                                value={selectedShowId}
                                onChange={(e) => handleShowSelect(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white"
                            >
                                <option value="">-- No show selected --</option>
                                {shows.map(s => (
                                    <option key={s.id} value={s.id}>{s.title}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="performer-name" className="block text-sm font-medium text-slate-300 mb-1">Your Name/Company*</label><input id="performer-name" type="text" value={performerName} onChange={(e) => setPerformerName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="client-name" className="block text-sm font-medium text-slate-300 mb-1">Client Name*</label><input id="client-name" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="client-email" className="block text-sm font-medium text-slate-300 mb-1">Client Email</label><input id="client-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="client-phone" className="block text-sm font-medium text-slate-300 mb-1">Client Phone</label><input id="client-phone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="client-address" className="block text-sm font-medium text-slate-300 mb-1">Client Address</label><input id="client-address" type="text" value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="event-type" className="block text-sm font-medium text-slate-300 mb-1">Event Type</label><input id="event-type" type="text" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g., Corporate Gala" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="event-date" className="block text-sm font-medium text-slate-300 mb-1">Event Date*</label><input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="event-time" className="block text-sm font-medium text-slate-300 mb-1">Event Time</label><input id="event-time" type="text" value={eventTime} onChange={(e) => setEventTime(e.target.value)} placeholder="e.g., 7:00 PM - 8:00 PM" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                    </div>
                    <div><label htmlFor="event-title" className="block text-sm font-medium text-slate-300 mb-1">Event Title</label><input id="event-title" type="text" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="e.g., Holiday Party Show" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                    <div><label htmlFor="event-location" className="block text-sm font-medium text-slate-300 mb-1">Event Location / Address</label><textarea id="event-location" rows={2} value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="perf-length" className="block text-sm font-medium text-slate-300 mb-1">Performance Length</label><input id="perf-length" type="text" value={performanceLength} onChange={(e) => setPerformanceLength(e.target.value)} placeholder="e.g., 45 minutes" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="perf-fee" className="block text-sm font-medium text-slate-300 mb-1">Performance Fee ($)*</label><input id="perf-fee" type="number" value={performanceFee} onChange={(e) => setPerformanceFee(e.target.value)} placeholder="e.g., 1500" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="deposit-amt" className="block text-sm font-medium text-slate-300 mb-1">Deposit Amount ($)</label><input id="deposit-amt" type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="e.g., 750" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="deposit-due" className="block text-sm font-medium text-slate-300 mb-1">Deposit Due Date</label><input id="deposit-due" type="date" value={depositDueDate} onChange={(e) => setDepositDueDate(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                    </div>
                    <div><label htmlFor="requirements" className="block text-sm font-medium text-slate-300 mb-1">Special Requirements (Rider)</label><textarea id="requirements" rows={3} value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} placeholder="e.g., Private changing area, bottled water, one microphone on a stand." className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                    <div><label htmlFor="cancellation" className="block text-sm font-medium text-slate-300 mb-1">Cancellation Policy</label><textarea id="cancellation" rows={3} value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white text-sm" /></div>
                    
                    <button onClick={handleGenerate} disabled={isLoading || !isFormValid} className="w-full py-3 mt-4 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 rounded-md text-white font-bold transition-colors disabled:bg-slate-600 disabled:cursor-not-allowed">
                        <WandIcon className="w-5 h-5" />
                        <span>Generate Contract</span>
                    </button>
                    {error && <p className="text-red-400 mt-2 text-sm text-center">{error}</p>}
                </div>
            </div>

            {/* Result Display Area */}
            <div className="flex flex-col bg-slate-900/50 rounded-lg border border-slate-800 min-h-[300px]">
                {isLoading ? (
                    <div className="flex-1 flex items-center justify-center"><LoadingIndicator /></div>
                ) : result ? (
                     <div className="relative group flex-1 flex flex-col">
                        <div className="p-4 overflow-y-auto space-y-4">
                            <SectionEditor title="Performance Details" value={result.performanceDetails} onChange={(v) => updateSection('performanceDetails', v)} />
                            <SectionEditor title="Payment Terms" value={result.paymentTerms} onChange={(v) => updateSection('paymentTerms', v)} />
                            <SectionEditor title="Technical Requirements" value={result.technicalRequirements} onChange={(v) => updateSection('technicalRequirements', v)} />
                            <SectionEditor title="Cancellation Policy" value={result.cancellationPolicy} onChange={(v) => updateSection('cancellationPolicy', v)} />
                            <SectionEditor title="Force Majeure" value={result.forceMajeure} onChange={(v) => updateSection('forceMajeure', v)} />
                            <SectionEditor title="Signature Block" value={result.signatureBlock} onChange={(v) => updateSection('signatureBlock', v)} />
                        </div>
                        <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
                            <button
                                onClick={handleSaveToShow}
                                disabled={!selectedShowId || saveToShowStatus === 'saved'}
                                title={!selectedShowId ? 'Select a show to save this contract' : 'Save this contract to the selected show and open it in Show Planner'}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-md text-white"
                            >
                                {saveToShowStatus === 'saved' ? <CheckIcon className="w-4 h-4 text-green-300" /> : <ShareIcon className="w-4 h-4" />}
                                <span>{saveToShowStatus === 'saved' ? 'Saved to Show!' : 'Save to Show'}</span>
                            </button>
                            <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200"><FileTextIcon className="w-4 h-4" /><span>Download .txt</span></button>
                            <button onClick={handleCopy} disabled={copyStatus === 'copied'} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">{copyStatus === 'copied' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}<span>{copyStatus === 'copied' ? 'Copied!' : 'Copy'}</span></button>
                            <button onClick={handleSave} disabled={saveStatus === 'saved'} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded-md text-slate-200">{saveStatus === 'saved' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <SaveIcon className="w-4 h-4" />}<span>{saveStatus === 'saved' ? 'Saved!' : 'Save'}</span></button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center text-slate-500 p-4">
                        <div>
                            <FileTextIcon className="w-24 h-24 mx-auto mb-4" />
                            <p>Your generated performance contract will appear here.</p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
};

export default ContractGenerator;

const SectionEditor: React.FC<{ title: string; value: string; onChange: (v: string) => void }> = ({ title, value, onChange }) => {
    return (
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
            <div className="text-xs font-semibold text-slate-300 mb-2">{title}</div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100"
            />
        </div>
    );
};
