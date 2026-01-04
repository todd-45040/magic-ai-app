
import React, { useState } from 'react';
import { generateResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { CONTRACT_GENERATOR_SYSTEM_INSTRUCTION } from '../constants';
import { FileTextIcon, WandIcon, SaveIcon, CheckIcon, ShareIcon, CopyIcon } from './icons';
import ShareButton from './ShareButton';
import type { User } from '../types';

interface ContractGeneratorProps {
    user: User;
    onIdeaSaved: () => void;
}

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
);

const ContractGenerator: React.FC<ContractGeneratorProps> = ({ user, onIdeaSaved }) => {
    // Form State
    const [performerName, setPerformerName] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientContact, setClientContact] = useState('');
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
    const [result, setResult] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
    
    const isFormValid = performerName && clientName && eventDate && performanceFee;

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

        const prompt = `
            Please generate a performance agreement with the following details:
            - Performer (Magician) Name/Company: ${performerName}
            - Client Name: ${clientName}
            - Client Contact Info: ${clientContact}
            - Event Type: ${eventType}
            - Event Date: ${eventDate}
            - Event Time: ${eventTime}
            - Event Location/Address: ${eventLocation}
            - Performance Length: ${performanceLength}
            - Total Performance Fee: $${performanceFee}
            - Deposit Amount: $${depositAmount}
            - Deposit Due Date: ${depositDueDate}
            - Balance Due Date: The day of the event, prior to the performance.
            - Special Requirements (Rider): ${specialRequirements}
            - Cancellation Policy: ${cancellationPolicy}
        `;
        
        try {
          // FIX: Pass the user object to generateResponse as the 3rd argument.
          const response = await generateResponse(prompt, CONTRACT_GENERATOR_SYSTEM_INSTRUCTION, user);
          setResult(response);
        } catch (err) {
          setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
          setIsLoading(false);
        }
    };
  
    const handleSave = () => {
        if (result) {
            const title = `Contract: ${performerName} & ${clientName}`;
            saveIdea('text', result, title);
            onIdeaSaved();
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }
    };

    const handleCopy = () => {
        if (result) {
            navigator.clipboard.writeText(result);
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }
    };

    const handleDownload = () => {
        if (result) {
            const blob = new Blob([result], { type: 'text/plain' });
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

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
            {/* Control Panel */}
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-slate-300 mb-2">Performance Contract Generator</h2>
                <p className="text-slate-400 mb-4">Fill in the gig details to create a professional performance agreement. Fields marked with * are required.</p>
                
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label htmlFor="performer-name" className="block text-sm font-medium text-slate-300 mb-1">Your Name/Company*</label><input id="performer-name" type="text" value={performerName} onChange={(e) => setPerformerName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="client-name" className="block text-sm font-medium text-slate-300 mb-1">Client Name*</label><input id="client-name" type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="client-contact" className="block text-sm font-medium text-slate-300 mb-1">Client Contact (Phone/Email)</label><input id="client-contact" type="text" value={clientContact} onChange={(e) => setClientContact(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="event-type" className="block text-sm font-medium text-slate-300 mb-1">Event Type</label><input id="event-type" type="text" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="e.g., Corporate Gala" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="event-date" className="block text-sm font-medium text-slate-300 mb-1">Event Date*</label><input id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                        <div><label htmlFor="event-time" className="block text-sm font-medium text-slate-300 mb-1">Event Time</label><input id="event-time" type="text" value={eventTime} onChange={(e) => setEventTime(e.target.value)} placeholder="e.g., 7:00 PM - 8:00 PM" className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white" /></div>
                    </div>
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
                        <div className="p-4 overflow-y-auto"><pre className="whitespace-pre-wrap break-words text-slate-200 font-sans text-sm">{result}</pre></div>
                        <div className="mt-auto p-2 bg-slate-900/50 flex justify-end gap-2 border-t border-slate-800">
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
