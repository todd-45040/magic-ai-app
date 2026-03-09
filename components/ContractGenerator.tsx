import React, { useEffect, useMemo, useState } from 'react';
import { Type } from '@google/genai';
import { generateStructuredResponse } from '../services/geminiService';
import { saveIdea } from '../services/ideasService';
import { CONTRACT_GENERATOR_SYSTEM_INSTRUCTION } from '../constants';
import {
    FileTextIcon,
    WandIcon,
    SaveIcon,
    CheckIcon,
    ShareIcon,
    CopyIcon,
    CalendarIcon,
    UsersIcon,
    ShieldIcon,
    ClockIcon,
    ChevronDownIcon,
} from './icons';
import { updateShow } from '../services/showsService';
import { createContractVersion, listContractsForShow } from '../services/contractsService';
import { updateClient } from '../services/clientsService';
import { trackClientEvent } from '../services/telemetryClient';
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

type PreviewContract = {
    performerName: string;
    clientCompany: string;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientAddress: string;
    eventTitle: string;
    eventType: string;
    eventDate: string;
    eventTime: string;
    eventLocation: string;
    performanceLength: string;
    performanceFee: string;
    depositAmount: string;
    depositDueDate: string;
    specialRequirements: string;
    cancellationPolicy: string;
    contractType: ContractType;
    previewToneSeed: string;
};

type ContractType = 'Corporate Event' | 'Private Party' | 'School Show' | 'Festival' | 'Theater';

type ContractPreset = {
    depositRatio: number;
    cancellationPolicy: string;
    riderLanguage: string;
    previewToneSeed: string;
};

const CONTRACT_TYPE_PRESETS: Record<ContractType, ContractPreset> = {
    'Corporate Event': {
        depositRatio: 0.5,
        cancellationPolicy: 'A 50% booking deposit is required to secure the date and is non-refundable if the Client cancels within 30 days of the event. Remaining balance is due on the event date before performance.',
        riderLanguage: 'Performer will be provided a private staging area, one stable table, and basic sound support suitable for a corporate banquet or ballroom environment.',
        previewToneSeed: 'Polished corporate language with clear professionalism and concise expectations.',
    },
    'Private Party': {
        depositRatio: 0.4,
        cancellationPolicy: 'A 40% retainer secures the date. If the Client cancels within 14 days of the event, the retainer is non-refundable. Good-faith rescheduling may be offered when possible.',
        riderLanguage: 'Performer requires a performance space clear of guest traffic, a safe setup area, and access to the venue 30 minutes before showtime.',
        previewToneSeed: 'Warm, friendly client-facing language appropriate for family and private events.',
    },
    'School Show': {
        depositRatio: 0.25,
        cancellationPolicy: 'A 25% booking deposit secures the engagement. School closures, safety events, or weather-related schedule changes may be rescheduled in good faith when possible.',
        riderLanguage: 'Performer requires an indoor performance area, access to a power outlet if sound is used, and an arrival window of 45 minutes for setup in school environments.',
        previewToneSeed: 'Clear educational-event language emphasizing scheduling clarity, safety, and professionalism.',
    },
    Festival: {
        depositRatio: 0.3,
        cancellationPolicy: 'A 30% booking deposit secures the performance slot. Outdoor weather delays, festival programming changes, or force majeure events will be handled in accordance with the event schedule and rescheduling feasibility.',
        riderLanguage: 'Performer requires a sheltered staging area when outdoors, a secure prop space, and event staff coordination for load-in, parking, and cue timing.',
        previewToneSeed: 'Production-aware language suitable for public events, festivals, and shared schedules.',
    },
    Theater: {
        depositRatio: 0.5,
        cancellationPolicy: 'A 50% booking deposit secures the theater date. Cancellations within 45 days of performance may forfeit the deposit due to date exclusivity and production planning commitments.',
        riderLanguage: 'Performer requires coordinated access with venue staff, agreed rehearsal or sound-check timing, backstage support, and a clear stage plot for theater presentation.',
        previewToneSeed: 'Formal venue language with production professionalism and stage-management clarity.',
    },
};

const DEFAULT_CONTRACT_TYPE: ContractType = 'Corporate Event';

const DEFAULT_CANCELLATION_POLICY =
    'Deposit is non-refundable if Client cancels within 30 days of the event date. If Performer cancels, the deposit will be fully refunded.';


const ADMC_DEMO_CONTRACT: Partial<PreviewContract> = {
    performerName: 'Todd Simpson',
    clientName: 'Cincinnati Event Planner',
    clientCompany: 'Cincinnati Event Planner',
    clientEmail: 'events@cincinnatieventplanner.com',
    clientPhone: '(513) 555-0142',
    clientAddress: '35 W 5th St, Cincinnati, OH 45202',
    eventTitle: 'Corporate Holiday Gala',
    eventType: 'Corporate Holiday Gala',
    eventDate: '2025-12-12',
    eventTime: '7:00 PM',
    eventLocation: 'Hilton Cincinnati Netherland Plaza',
    performanceLength: '45 Minute Interactive Magic Show',
    performanceFee: '1500',
    depositAmount: '750',
    depositDueDate: '2025-11-15',
    specialRequirements: 'Performer requires a small performance area, a wireless handheld microphone if available, one skirted side table, and venue access 45 minutes before showtime for setup.',
    cancellationPolicy: 'Deposit is non-refundable. Cancellation within 14 days of the event requires full payment unless otherwise agreed in writing by both parties.',
    contractType: 'Corporate Event',
    previewToneSeed: 'Polished corporate language with clear professionalism and concise expectations.',
};

const ADMC_DEMO_CONTRACT_SECTIONS: ContractSections = {
    performanceDetails: 'Performer agrees to present one forty-five (45) minute interactive magic show for the Client at the Corporate Holiday Gala on December 12, 2025, at the Hilton Cincinnati Netherland Plaza in Cincinnati, Ohio. The performance is designed for a corporate audience and will feature clean, audience-friendly interactive magic suitable for a banquet or gala setting. Client will provide a safe, accessible performance area and reasonable audience attention during the scheduled performance window.',
    paymentTerms: 'The total performance fee is $1,500. A non-refundable booking deposit of $750 is due no later than November 15, 2025, in order to secure the performance date. The remaining balance of $750 is due on or before the event date prior to the performance. Late changes to schedule, venue access, or event timing that materially affect the performance may require written approval by both parties.',
    technicalRequirements: 'Client will provide a clear performance area, one stable side table, and a wireless handheld microphone if available. Performer will be granted access to the venue approximately forty-five (45) minutes before showtime for setup and pre-show preparation. Basic coordination with the event planner or banquet captain will be provided for cue timing and room readiness.',
    cancellationPolicy: 'The booking deposit is non-refundable once paid. If Client cancels the engagement within fourteen (14) days of the event date, the full contract amount remains due because the date has been reserved and other bookings may have been declined. If Performer must cancel due to emergency or circumstances beyond reasonable control, all payments received from Client will be refunded and Performer will make reasonable efforts to assist with a replacement referral if requested.',
    forceMajeure: 'Neither party will be considered in breach of this agreement for delays or cancellation caused by events beyond reasonable control, including severe weather, venue closure, government restrictions, labor disruptions, or other force majeure events. In such cases, both parties agree to work in good faith toward a reasonable rescheduling solution when feasible.',
    signatureBlock: 'Client Representative: ________________________________\nDate: ____________________\n\nPerformer: Todd Simpson\nDate: ____________________',
    generatedAt: Date.now(),
};

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

const isUuid = (value: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const inferClientAddress = (client?: Client | null): string => {
    if (!client?.notes) return '';
    return client.notes.includes('Address:')
        ? client.notes.split('Address:')[1]?.split('\n')[0]?.trim() || ''
        : '';
};

const formatDateForPreview = (value: string): string => {
    if (!value) return 'Date to be confirmed';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
};

const formatCurrency = (value: string): string => {
    const numeric = Number(value);
    if (!value || Number.isNaN(numeric)) return 'To be determined';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(numeric);
};

const contractSectionsToText = (sections: ContractSections): string => {
    const parts: Array<[string, string]> = [
        ['Performance Details', sections.performanceDetails],
        ['Payment Terms', sections.paymentTerms],
        ['Technical Requirements', sections.technicalRequirements],
        ['Cancellation Policy', sections.cancellationPolicy],
        ['Force Majeure', sections.forceMajeure],
        ['Signature Block', sections.signatureBlock],
    ];

    return parts
        .filter(([, body]) => (body ?? '').toString().trim().length > 0)
        .map(([title, body]) => `${title}\n${body}`.trim())
        .join('\n\n');
};

const buildContractSummaryText = (preview: PreviewContract, result: ContractSections | null): string => {
    const lines = [
        `Performer: ${preview.performerName || 'TBD'}`,
        `Client: ${preview.clientName || 'TBD'}${preview.clientCompany ? ` (${preview.clientCompany})` : ''}`,
        `Event: ${preview.eventTitle || 'Untitled Engagement'}`,
        `Type: ${preview.eventType || 'Professional performance agreement'}`,
        `Date: ${formatDateForPreview(preview.eventDate)}`,
        `Time: ${preview.eventTime || 'Time to be confirmed'}`,
        `Location: ${preview.eventLocation || 'Location to be confirmed'}`,
        `Performance Length: ${preview.performanceLength || 'Length to be confirmed'}`,
        `Fee: ${formatCurrency(preview.performanceFee)}`,
        `Deposit: ${preview.depositAmount ? formatCurrency(preview.depositAmount) : 'No deposit specified'}${preview.depositDueDate ? ` due ${formatDateForPreview(preview.depositDueDate)}` : ''}`,
        '',
        'Special Requirements:',
        preview.specialRequirements || 'None specified yet.',
        '',
        'Cancellation Policy:',
        preview.cancellationPolicy || DEFAULT_CANCELLATION_POLICY,
    ];

    if (result) lines.push('', contractSectionsToText(result));
    return lines.join('\n');
};

const escapeHtml = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const buildContractPrintHtml = (preview: PreviewContract, result: ContractSections | null): string => {
    const section = (title: string, body: string) => `
        <section style="margin-top:18px;">
            <h3 style="font-size:15px;margin:0 0 8px 0;color:#111827;">${escapeHtml(title)}</h3>
            <div style="white-space:pre-wrap;line-height:1.55;color:#374151;">${escapeHtml(body)}</div>
        </section>`;
    const signatureStub = result?.signatureBlock || `Performer: ${preview.performerName || '________________'}\nClient: ${preview.clientName || '________________'}\nDate: ____________________`;
    return `<!doctype html><html><head><meta charset="utf-8" /><title>Performance Contract</title></head><body style="font-family:Arial,Helvetica,sans-serif;padding:40px;max-width:860px;margin:0 auto;color:#111827;"><div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px;"><div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7c3aed;">Performance Agreement</div><h1 style="margin:8px 0 4px 0;font-size:28px;">${escapeHtml(preview.eventTitle || 'Untitled Engagement')}</h1><div style="color:#4b5563;">${escapeHtml(preview.eventType || 'Professional performance contract')} · ${escapeHtml(preview.contractType)}</div></div>${section('Parties', `Performer: ${preview.performerName || 'Performer name pending'}\nClient: ${preview.clientName || 'Client name pending'}${preview.clientCompany ? `\nCompany: ${preview.clientCompany}` : ''}${preview.clientEmail ? `\nEmail: ${preview.clientEmail}` : ''}${preview.clientPhone ? `\nPhone: ${preview.clientPhone}` : ''}${preview.clientAddress ? `\nAddress: ${preview.clientAddress}` : ''}`)}${section('Event', `${formatDateForPreview(preview.eventDate)}${preview.eventTime ? `\n${preview.eventTime}` : ''}\n${preview.eventLocation || 'Location to be confirmed'}${preview.performanceLength ? `\n${preview.performanceLength}` : ''}`)}${section('Financial Terms', `Performance Fee: ${formatCurrency(preview.performanceFee)}\nDeposit: ${preview.depositAmount ? formatCurrency(preview.depositAmount) : 'No deposit specified yet'}${preview.depositDueDate ? ` due ${formatDateForPreview(preview.depositDueDate)}` : ''}`)}${section('Operational Notes', preview.specialRequirements || 'Special requirements will appear here once added.')}${section('Cancellation', preview.cancellationPolicy || DEFAULT_CANCELLATION_POLICY)}${section('Agreement Language', [`Performance Details\n${result?.performanceDetails || 'Performance details will appear here after generation.'}`, `\nPayment Terms\n${result?.paymentTerms || `Total fee: ${formatCurrency(preview.performanceFee)}. ${preview.depositAmount ? `Deposit: ${formatCurrency(preview.depositAmount)}` : 'Deposit terms pending.'}`}`, `\nTechnical Requirements\n${result?.technicalRequirements || preview.specialRequirements || 'Technical and rider requirements will appear here.'}`, `\nCancellation Policy\n${result?.cancellationPolicy || preview.cancellationPolicy || DEFAULT_CANCELLATION_POLICY}`, `\nForce Majeure\n${result?.forceMajeure || 'Either party may be excused from performance delays or cancellations caused by events beyond reasonable control.'}`, `\nSignature Block\n${signatureStub}`].join(''))}</body></html>`;
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

const ContractGenerator: React.FC<ContractGeneratorProps> = ({ user, clients, shows, onShowsUpdate, onNavigateToShowPlanner, onIdeaSaved }) => {
    const [performerName, setPerformerName] = useState('');
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [selectedShowId, setSelectedShowId] = useState<string>('');
    const [clientName, setClientName] = useState('');
    const [clientCompany, setClientCompany] = useState('');
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
    const [cancellationPolicy, setCancellationPolicy] = useState(DEFAULT_CANCELLATION_POLICY);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ContractSections | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
    const [saveToShowStatus, setSaveToShowStatus] = useState<'idle' | 'saved'>('idle');
    const [showNextVersion, setShowNextVersion] = useState<number | null>(null);
    const [showLatestStatus, setShowLatestStatus] = useState<string | null>(null);
    const [clientLoadedFromCrm, setClientLoadedFromCrm] = useState(false);
    const [contractType, setContractType] = useState<ContractType>(DEFAULT_CONTRACT_TYPE);
    const [previewToneSeed, setPreviewToneSeed] = useState(CONTRACT_TYPE_PRESETS[DEFAULT_CONTRACT_TYPE].previewToneSeed);
    const [clientRecordSaveStatus, setClientRecordSaveStatus] = useState<'idle' | 'saved'>('idle');
    const [emailStatus, setEmailStatus] = useState<'idle' | 'opened'>('idle');

    const isFormValid = performerName && clientName && eventDate && performanceFee;
    const selectedShow = useMemo(() => shows.find((s) => s.id === selectedShowId) ?? null, [shows, selectedShowId]);

    const responseSchema = useMemo(
        () => ({
            type: Type.OBJECT,
            properties: {
                performanceDetails: { type: Type.STRING },
                paymentTerms: { type: Type.STRING },
                technicalRequirements: { type: Type.STRING },
                cancellationPolicy: { type: Type.STRING },
                forceMajeure: { type: Type.STRING },
                signatureBlock: { type: Type.STRING },
            },
            required: ['performanceDetails', 'paymentTerms', 'technicalRequirements', 'cancellationPolicy', 'forceMajeure', 'signatureBlock'],
        }),
        []
    );

    const previewContract: PreviewContract = useMemo(
        () => ({
            performerName,
            clientCompany,
            clientName,
            clientEmail,
            clientPhone,
            clientAddress,
            eventTitle,
            eventType,
            eventDate,
            eventTime,
            eventLocation,
            performanceLength,
            performanceFee,
            depositAmount,
            depositDueDate,
            specialRequirements,
            cancellationPolicy,
            contractType,
            previewToneSeed,
        }),
        [
            performerName,
            clientCompany,
            clientName,
            clientEmail,
            clientPhone,
            clientAddress,
            eventTitle,
            eventType,
            eventDate,
            eventTime,
            eventLocation,
            performanceLength,
            performanceFee,
            depositAmount,
            depositDueDate,
            specialRequirements,
            cancellationPolicy,
            contractType,
            previewToneSeed,
        ]
    );

    const telemetryMetadata = useMemo(
        () => ({
            client_id: selectedClientId || null,
            show_id: selectedShowId || null,
            contract_type: contractType,
            performance_fee: Number(performanceFee) || 0,
            deposit_amount: Number(depositAmount) || 0,
            has_ai_sections: !!result,
            has_selected_client: !!selectedClientId,
            has_selected_show: !!selectedShowId,
        }),
        [selectedClientId, selectedShowId, contractType, performanceFee, depositAmount, result]
    );

    const emitContractTelemetry = (action: string, metadata: Record<string, any> = {}) => {
        void trackClientEvent({
            tool: 'contract_generator',
            action,
            metadata: {
                ...telemetryMetadata,
                ...metadata,
            },
        });
    };


    const applyContractPreset = (nextType: ContractType) => {
        const preset = CONTRACT_TYPE_PRESETS[nextType];
        setContractType(nextType);
        emitContractTelemetry('contract_template_selected', { contract_type: nextType });
        setPreviewToneSeed(preset.previewToneSeed);
        setCancellationPolicy(preset.cancellationPolicy);
        setSpecialRequirements((prev) => {
            const trimmed = prev.trim();
            if (!trimmed) return preset.riderLanguage;
            return trimmed.includes(preset.riderLanguage) ? trimmed : `${trimmed}\n\n${preset.riderLanguage}`;
        });
        const fee = Number(performanceFee);
        if (!Number.isNaN(fee) && fee > 0) setDepositAmount(String(Math.round(fee * preset.depositRatio)));
    };

    const applyClientSelection = (clientId: string) => {
        setSelectedClientId(clientId);
        const client = clients.find((x) => x.id === clientId);
        if (!client) {
            setClientLoadedFromCrm(false);
            return;
        }
        setClientName(client.name ?? '');
        setClientCompany(client.company ?? '');
        setClientEmail(client.email ?? '');
        setClientPhone(client.phone ?? '');
        setClientAddress(inferClientAddress(client));
        setClientLoadedFromCrm(true);
    };

    const applyShowSelection = (showId: string) => {
        setSelectedShowId(showId);
        if (!showId) return;
        const show = shows.find((x) => x.id === showId);
        if (!show) return;

        const runtimeMinutes = Array.isArray(show.tasks)
            ? show.tasks.reduce((sum: number, task: any) => sum + (Number(task?.durationMinutes) || 0), 0)
            : 0;

        setEventTitle(show.title ?? '');
        setEventType(show.status ? `Performance · ${show.status}` : eventType);
        setEventLocation(show.venue ?? '');
        setEventDate(show.performanceDate ? new Date(show.performanceDate).toISOString().slice(0, 10) : '');
        if ((show as any).performanceTime) setEventTime(String((show as any).performanceTime));
        if (runtimeMinutes > 0) setPerformanceLength(`${runtimeMinutes} minutes`);
        if (typeof show.finances?.performanceFee === 'number' && !Number.isNaN(show.finances.performanceFee) && show.finances.performanceFee > 0) {
            setPerformanceFee(String(show.finances.performanceFee));
        }
        if (show.description && !specialRequirements) {
            setSpecialRequirements(String(show.description));
        }
        if ((show as any).clientId && !selectedClientId) {
            const linkedClient = clients.find((c) => c.id === (show as any).clientId);
            if (linkedClient) applyClientSelection(linkedClient.id);
        }
        if ((show as any).contract) {
            const existing = (show as any).contract as ContractSections;
            if (existing?.performanceDetails) {
                setResult(existing);
            }
        }
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem('maw_contract_revision_prefill');
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed?.showId && typeof parsed.showId === 'string') {
                applyShowSelection(parsed.showId);
            }
            localStorage.removeItem('maw_contract_revision_prefill');
        } catch {
            // ignore malformed prefill payloads
        }
    }, [shows]);

    useEffect(() => {
        const preset = CONTRACT_TYPE_PRESETS[contractType];
        const fee = Number(performanceFee);
        if (!Number.isNaN(fee) && fee > 0) {
            const suggestedDeposit = String(Math.round(fee * preset.depositRatio));
            setDepositAmount((prev) => (!prev || Number.isNaN(Number(prev)) ? suggestedDeposit : prev));
        }
    }, [contractType, performanceFee]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            if (!selectedShowId) {
                setShowNextVersion(null);
                setShowLatestStatus(null);
                return;
            }

            try {
                const rows = await listContractsForShow(selectedShowId);
                if (cancelled) return;
                if (!rows || rows.length === 0) {
                    setShowNextVersion(1);
                    setShowLatestStatus(null);
                    return;
                }

                const maxVersion = rows.reduce((m: number, row: any) => Math.max(m, Number(row?.version ?? 0) || 0), 0);
                const latest = [...rows].sort((a: any, b: any) => (Number(b?.version ?? 0) || 0) - (Number(a?.version ?? 0) || 0))[0];
                setShowNextVersion(maxVersion + 1);
                setShowLatestStatus((latest?.status as string) ?? null);
            } catch {
                if (!cancelled) {
                    setShowNextVersion(1);
                    setShowLatestStatus(null);
                }
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [selectedShowId]);


    useEffect(() => {
        emitContractTelemetry('contract_page_opened');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadDemoContract = () => {
        setPerformerName(ADMC_DEMO_CONTRACT.performerName ?? '');
        setSelectedClientId('');
        setSelectedShowId('');
        setClientName(ADMC_DEMO_CONTRACT.clientName ?? '');
        setClientCompany(ADMC_DEMO_CONTRACT.clientCompany ?? '');
        setClientEmail(ADMC_DEMO_CONTRACT.clientEmail ?? '');
        setClientPhone(ADMC_DEMO_CONTRACT.clientPhone ?? '');
        setClientAddress(ADMC_DEMO_CONTRACT.clientAddress ?? '');
        setEventTitle(ADMC_DEMO_CONTRACT.eventTitle ?? '');
        setEventType(ADMC_DEMO_CONTRACT.eventType ?? '');
        setEventDate(ADMC_DEMO_CONTRACT.eventDate ?? '');
        setEventTime(ADMC_DEMO_CONTRACT.eventTime ?? '');
        setEventLocation(ADMC_DEMO_CONTRACT.eventLocation ?? '');
        setPerformanceLength(ADMC_DEMO_CONTRACT.performanceLength ?? '');
        setPerformanceFee(ADMC_DEMO_CONTRACT.performanceFee ?? '');
        setDepositAmount(ADMC_DEMO_CONTRACT.depositAmount ?? '');
        setDepositDueDate(ADMC_DEMO_CONTRACT.depositDueDate ?? '');
        setSpecialRequirements(ADMC_DEMO_CONTRACT.specialRequirements ?? '');
        setCancellationPolicy(ADMC_DEMO_CONTRACT.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY);
        setContractType(ADMC_DEMO_CONTRACT.contractType ?? DEFAULT_CONTRACT_TYPE);
        setPreviewToneSeed(ADMC_DEMO_CONTRACT.previewToneSeed ?? CONTRACT_TYPE_PRESETS[DEFAULT_CONTRACT_TYPE].previewToneSeed);
        setClientLoadedFromCrm(false);
        setShowNextVersion(null);
        setShowLatestStatus(null);
        setResult({ ...ADMC_DEMO_CONTRACT_SECTIONS, generatedAt: Date.now() });
        setError(null);
        setSaveStatus('idle');
        setCopyStatus('idle');
        setSaveToShowStatus('idle');
        setClientRecordSaveStatus('idle');
        setEmailStatus('idle');
        emitContractTelemetry('demo_contract_loaded', {
            contract_type: ADMC_DEMO_CONTRACT.contractType ?? DEFAULT_CONTRACT_TYPE,
            demo_name: 'admc_corporate_holiday_gala',
            has_ai_sections: true,
        });
    };

    const handleGenerate = async () => {
        if (!isFormValid) {
            setError('Please fill in all required fields (*).');
            return;
        }

        setIsLoading(true);
        setError(null);
        setResult(null);
        setSaveStatus('idle');
        setCopyStatus('idle');
        setSaveToShowStatus('idle');
        setClientRecordSaveStatus('idle');
        setEmailStatus('idle');

        const prompt = `
You are drafting a professional performance contract for a magician.

Return ONLY JSON matching the provided schema.

Contract context:
- Performer (Magician) Name/Company: ${performerName}
- Client Name: ${clientName}
- Client Company: ${clientCompany}
- Client Email: ${clientEmail}
- Client Phone: ${clientPhone}
- Client Address: ${clientAddress}

Event details:
- Event Title: ${eventTitle}
- Event Type: ${eventType}
- Contract Type Preset: ${contractType}
- Preview Tone Seed: ${previewToneSeed}
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
            emitContractTelemetry('contract_generated', {
                has_ai_sections: true,
                generated_section_count: 6,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = () => {
        if (!result) return;
        const title = `Contract: ${performerName} & ${clientName}`;
        const text = formatContractAsText(result, { performerName, clientName, eventTitle });
        saveIdea('text', text, title);
        onIdeaSaved();
        emitContractTelemetry('contract_saved_to_ideas');
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
    };

    const handleCopy = () => {
        if (!result) return;
        const text = formatContractAsText(result, { performerName, clientName, eventTitle });
        navigator.clipboard.writeText(text);
        emitContractTelemetry('contract_copied');
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
    };

    const handleDownloadPdf = () => {
        const html = buildContractPrintHtml(previewContract, result);
        const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1100');
        if (!printWindow) {
            setError('Popup blocked. Please allow popups to download the contract as a PDF.');
            return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        emitContractTelemetry('contract_downloaded', { format: 'pdf' });
        window.setTimeout(() => { printWindow.print(); }, 250);
    };

    const handleDownloadTxt = () => {
        if (!result) return;
        const text = formatContractAsText(result, { performerName, clientName, eventTitle });
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Performance_Contract_${clientName.replace(/\s/g, '_') || 'Client'}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        emitContractTelemetry('contract_downloaded', { format: 'txt' });
    };

    const handleSendEmail = () => {
        const subject = encodeURIComponent(`Performance Agreement — ${eventTitle || 'Upcoming Event'}`);
        const body = encodeURIComponent(`Hello ${clientName || 'Client'},\n\nAttached below is the draft performance agreement for your review.\n\n${buildContractSummaryText(previewContract, result)}\n\nThank you,\n${performerName || 'Performer'}`);
        const email = clientEmail || '';
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
        emitContractTelemetry('contract_email_composed');
        setEmailStatus('opened');
        setTimeout(() => setEmailStatus('idle'), 2500);
    };

    const handleSaveToClientRecord = () => {
        if (!selectedClientId) return;
        try {
            const selectedClient = clients.find((client) => client.id === selectedClientId);
            const stamp = new Date().toLocaleString();
            const existingNotes = selectedClient?.notes?.trim() || '';
            const contractRecord = [
                `Contract Record — ${stamp}`,
                `Contract Type: ${contractType}`,
                `Event: ${eventTitle || 'Untitled Engagement'}`,
                `Fee: ${formatCurrency(performanceFee)}`,
                `Deposit: ${depositAmount ? formatCurrency(depositAmount) : 'Not specified'}`,
                `Status: ${result ? 'AI draft generated' : 'Preview draft saved'}`,
                buildContractSummaryText(previewContract, result),
            ].join('\n');
            updateClient(selectedClientId, { notes: existingNotes ? `${existingNotes}\n\n${contractRecord}` : contractRecord } as any);
            setClientRecordSaveStatus('saved');
            setTimeout(() => setClientRecordSaveStatus('idle'), 2000);
        } catch (err: any) {
            setError(err?.message || 'Unable to save contract details to the selected client record.');
        }
    };

    const handleSaveToShow = async () => {
        if (!selectedShowId || !result) return;
        try {
            setError(null);
            const content = contractSectionsToText(result);

            await createContractVersion({
                showId: selectedShowId,
                clientId: selectedClientId && isUuid(selectedClientId) ? selectedClientId : null,
                content,
                status: 'draft',
            });

            emitContractTelemetry('contract_saved_to_show');
            setSaveToShowStatus('saved');
            setTimeout(() => setSaveToShowStatus('idle'), 2000);
            onNavigateToShowPlanner(selectedShowId);
        } catch (err: any) {
            console.error('Save to Show failed:', err);
            try {
                const updatedShows = await updateShow(selectedShowId, { contract: result } as any);
                onShowsUpdate(updatedShows);
                emitContractTelemetry('contract_saved_to_show', { save_mode: 'legacy_fallback' });
                setSaveToShowStatus('saved');
                setTimeout(() => setSaveToShowStatus('idle'), 2000);
                onNavigateToShowPlanner(selectedShowId);
                return;
            } catch (fallbackErr: any) {
                console.error('Legacy save fallback failed:', fallbackErr);
            }

            const msg =
                (err?.message as string) ||
                'Failed to save contract to database. Check Supabase RLS policies and required columns on the contracts table.';
            setError(msg);
        }
    };

    const updateSection = (key: keyof ContractSections, value: string) => {
        setResult((prev) => (prev ? { ...prev, [key]: value } : prev));
    };

    return (
        <main className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
            <div className="mb-6 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-100">Performance Contract Generator</h2>
                    <p className="text-slate-400 mt-1 max-w-3xl">
                        Build a professional performance agreement with connected client and show details. Fields marked with * are required.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <button
                        type="button"
                        onClick={loadDemoContract}
                        className="inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-400 to-yellow-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.22)] transition hover:scale-[1.01] hover:from-amber-300 hover:to-yellow-200"
                    >
                        <span aria-hidden="true">🎭</span>
                        Load Demo Contract
                    </button>
                    <StatusPill label={selectedClientId ? 'Client linked' : 'Client manual'} active={!!selectedClientId} />
                    <StatusPill label={selectedShowId ? 'Show linked' : 'Show optional'} active={!!selectedShowId} />
                    <StatusPill label={showNextVersion ? `Version ready · v${showNextVersion}` : 'Version pending'} active={!!showNextVersion} />
                    <StatusPill label={result ? 'AI-generated' : 'Preview mode'} active={!!result} />
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] gap-6">
                <section className="space-y-5">
                    <EventClientSection
                        clients={clients}
                        shows={shows}
                        selectedClientId={selectedClientId}
                        selectedShowId={selectedShowId}
                        onClientSelect={applyClientSelection}
                        onShowSelect={applyShowSelection}
                        performerName={performerName}
                        setPerformerName={setPerformerName}
                        clientCompany={clientCompany}
                        clientName={clientName}
                        setClientCompany={setClientCompany}
                        setClientName={setClientName}
                        clientEmail={clientEmail}
                        setClientEmail={setClientEmail}
                        clientPhone={clientPhone}
                        setClientPhone={setClientPhone}
                        clientAddress={clientAddress}
                        setClientAddress={setClientAddress}
                        eventTitle={eventTitle}
                        setEventTitle={setEventTitle}
                        eventType={eventType}
                        setEventType={setEventType}
                        eventDate={eventDate}
                        setEventDate={setEventDate}
                        eventTime={eventTime}
                        setEventTime={setEventTime}
                        eventLocation={eventLocation}
                        setEventLocation={setEventLocation}
                        clientLoadedFromCrm={clientLoadedFromCrm}
                        contractType={contractType}
                        setContractType={applyContractPreset}
                        selectedShow={selectedShow}
                        showNextVersion={showNextVersion}
                        showLatestStatus={showLatestStatus}
                        onOpenShowPlanner={() => selectedShowId && onNavigateToShowPlanner(selectedShowId)}
                    />

                    <FinancialTermsSection
                        performanceLength={performanceLength}
                        setPerformanceLength={setPerformanceLength}
                        performanceFee={performanceFee}
                        setPerformanceFee={setPerformanceFee}
                        depositAmount={depositAmount}
                        setDepositAmount={setDepositAmount}
                        depositDueDate={depositDueDate}
                        contractType={contractType}
                        setDepositDueDate={setDepositDueDate}
                    />

                    <ContractDetailsSection
                        specialRequirements={specialRequirements}
                        setSpecialRequirements={setSpecialRequirements}
                        cancellationPolicy={cancellationPolicy}
                        setCancellationPolicy={setCancellationPolicy}
                        onGenerate={handleGenerate}
                        isLoading={isLoading}
                        isFormValid={!!isFormValid}
                        error={error}
                    />
                </section>

                <section className="space-y-5">
                    <ContractPreviewPanel
                        preview={previewContract}
                        result={result}
                        isLoading={isLoading}
                        selectedShow={selectedShow}
                        showNextVersion={showNextVersion}
                        showLatestStatus={showLatestStatus}
                    />

                    <ContractActionBar
                        result={result}
                        selectedShowId={selectedShowId}
                        selectedClientId={selectedClientId}
                        saveStatus={saveStatus}
                        copyStatus={copyStatus}
                        saveToShowStatus={saveToShowStatus}
                        clientRecordSaveStatus={clientRecordSaveStatus}
                        emailStatus={emailStatus}
                        onSave={handleSave}
                        onCopy={handleCopy}
                        onDownloadPdf={handleDownloadPdf}
                        onDownloadTxt={handleDownloadTxt}
                        onSendEmail={handleSendEmail}
                        onSaveToClientRecord={handleSaveToClientRecord}
                        onSaveToShow={handleSaveToShow}
                    />

                    <IntegrationHintsCard selectedShow={selectedShow} selectedClientId={selectedClientId} performanceFee={performanceFee} />

                    {result ? (
                        <CardShell title="AI Contract Sections" description="Refine the generated agreement language before saving or exporting." icon={<ShieldIcon className="w-5 h-5" />} collapsible defaultOpen={false} summary="6 editable sections ready">
                            <div className="space-y-3">
                                <SectionEditor title="Performance Details" value={result.performanceDetails} onChange={(v) => updateSection('performanceDetails', v)} />
                                <SectionEditor title="Payment Terms" value={result.paymentTerms} onChange={(v) => updateSection('paymentTerms', v)} />
                                <SectionEditor title="Technical Requirements" value={result.technicalRequirements} onChange={(v) => updateSection('technicalRequirements', v)} />
                                <SectionEditor title="Cancellation Policy" value={result.cancellationPolicy} onChange={(v) => updateSection('cancellationPolicy', v)} />
                                <SectionEditor title="Force Majeure" value={result.forceMajeure} onChange={(v) => updateSection('forceMajeure', v)} />
                                <SectionEditor title="Signature Block" value={result.signatureBlock} onChange={(v) => updateSection('signatureBlock', v)} />
                            </div>
                        </CardShell>
                    ) : null}
                </section>
            </div>
        </main>
    );
};

export default ContractGenerator;

const CardShell: React.FC<{ title: string; description?: string; icon?: React.ReactNode; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean; summary?: string }> = ({
    title,
    description,
    icon,
    children,
    collapsible = false,
    defaultOpen = true,
    summary,
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur-sm">
            <div className="mb-3 flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300 border border-purple-400/20 shrink-0">
                    {icon ?? <FileTextIcon className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="text-base font-semibold text-slate-100">{title}</h3>
                            {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
                            {!isOpen && summary ? <div className="mt-2 text-xs text-slate-400">{summary}</div> : null}
                        </div>
                        {collapsible ? (
                            <button
                                type="button"
                                onClick={() => setIsOpen((prev) => !prev)}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800/80"
                                aria-expanded={isOpen}
                            >
                                <span>{isOpen ? 'Hide' : 'Show'}</span>
                                <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
            {(!collapsible || isOpen) ? children : null}
        </div>
    );
};

const FieldLabel: React.FC<{ htmlFor: string; children: React.ReactNode }> = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-300">
        {children}
    </label>
);

const FieldInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input
        {...props}
        className={`w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${props.className ?? ''}`.trim()}
    />
);

const FieldTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
    <textarea
        {...props}
        className={`w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-purple-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${props.className ?? ''}`.trim()}
    />
);

const FieldSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <select
        {...props}
        className={`w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-white focus:border-purple-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${props.className ?? ''}`.trim()}
    />
);

const StatusPill: React.FC<{ label: string; active?: boolean }> = ({ label, active = false }) => (
    <span
        className={`rounded-full border px-3 py-1 font-medium ${
            active ? 'border-purple-400/30 bg-purple-500/15 text-purple-200' : 'border-white/10 bg-white/5 text-slate-400'
        }`}
    >
        {label}
    </span>
);

const EventClientSection: React.FC<{
    clients: Client[];
    shows: Show[];
    selectedClientId: string;
    selectedShowId: string;
    onClientSelect: (id: string) => void;
    onShowSelect: (id: string) => void;
    performerName: string;
    setPerformerName: (v: string) => void;
    clientCompany: string;
    clientName: string;
    setClientCompany: (v: string) => void;
    setClientName: (v: string) => void;
    clientEmail: string;
    setClientEmail: (v: string) => void;
    clientPhone: string;
    setClientPhone: (v: string) => void;
    clientAddress: string;
    setClientAddress: (v: string) => void;
    eventTitle: string;
    setEventTitle: (v: string) => void;
    eventType: string;
    setEventType: (v: string) => void;
    eventDate: string;
    setEventDate: (v: string) => void;
    eventTime: string;
    setEventTime: (v: string) => void;
    eventLocation: string;
    setEventLocation: (v: string) => void;
    clientLoadedFromCrm: boolean;
    contractType: ContractType;
    setContractType: (v: ContractType) => void;
    selectedShow: Show | null;
    showNextVersion: number | null;
    showLatestStatus: string | null;
    onOpenShowPlanner: () => void;
}> = ({
    clients,
    shows,
    selectedClientId,
    selectedShowId,
    onClientSelect,
    onShowSelect,
    performerName,
    setPerformerName,
    clientCompany,
    clientName,
    setClientCompany,
    setClientName,
    clientEmail,
    setClientEmail,
    clientPhone,
    setClientPhone,
    clientAddress,
    setClientAddress,
    eventTitle,
    setEventTitle,
    eventType,
    setEventType,
    eventDate,
    setEventDate,
    eventTime,
    setEventTime,
    eventLocation,
    setEventLocation,
    clientLoadedFromCrm,
    contractType,
    setContractType,
    selectedShow,
    showNextVersion,
    showLatestStatus,
    onOpenShowPlanner,
}) => (
    <CardShell
        title="📅 Event & Client"
        description="Connect this agreement to your CRM and Show Planner, then confirm the booking details."
        icon={<UsersIcon className="w-5 h-5" />}
    >
        <div className="space-y-3">
            <div className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Preset active: <span className="font-semibold">{contractType}</span> · Deposit and language defaults are tuned for this booking type.</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <FieldLabel htmlFor="select-client">Select Client</FieldLabel>
                    <FieldSelect id="select-client" value={selectedClientId} onChange={(e) => onClientSelect(e.target.value)}>
                        <option value="">-- Choose a client --</option>
                        {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                                {client.name}
                                {client.company ? ` (${client.company})` : ''}
                            </option>
                        ))}
                    </FieldSelect>
                </div>
                <div>
                    <FieldLabel htmlFor="select-show">Select Show (optional)</FieldLabel>
                    <FieldSelect id="select-show" value={selectedShowId} onChange={(e) => onShowSelect(e.target.value)}>
                        <option value="">-- Choose a show --</option>
                        {shows.map((show) => (
                            <option key={show.id} value={show.id}>
                                {show.title}
                            </option>
                        ))}
                    </FieldSelect>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <FieldLabel htmlFor="performer-name">Performer / Company Name *</FieldLabel>
                    <FieldInput id="performer-name" value={performerName} onChange={(e) => setPerformerName(e.target.value)} placeholder="Todd Simpson Magic" />
                </div>
                <div>
                    <FieldLabel htmlFor="client-name">Client Name *</FieldLabel>
                    <FieldInput id="client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Cincinnati Event Planner" />
                </div>
                <div>
                    <FieldLabel htmlFor="client-company">Company / Organization</FieldLabel>
                    <FieldInput id="client-company" value={clientCompany} onChange={(e) => setClientCompany(e.target.value)} placeholder="Cincinnati Event Planner" />
                </div>
                <div>
                    <FieldLabel htmlFor="client-email">Client Email</FieldLabel>
                    <FieldInput id="client-email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="client@example.com" />
                </div>
                <div>
                    <FieldLabel htmlFor="client-phone">Client Phone</FieldLabel>
                    <FieldInput id="client-phone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="(555) 555-5555" />
                </div>
            </div>

            <div>
                <FieldLabel htmlFor="client-address">Client Address</FieldLabel>
                <FieldTextarea id="client-address" rows={2} value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Mailing address or billing address" />
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
                <StatusPill label={clientLoadedFromCrm ? 'Loaded from Client Management' : 'Manual client entry'} active={clientLoadedFromCrm} />
                <StatusPill label={selectedShow ? 'Show linked from Planner' : 'No show linked'} active={!!selectedShow} />
            </div>

            {selectedShow ? (
                <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="text-sm text-slate-200">
                            <div className="font-semibold">Selected show: {selectedShow.title}</div>
                            <div className="mt-1 text-xs text-slate-300">
                                Contract status: {showLatestStatus || 'No saved contract yet'}
                                {showNextVersion ? ` · Next version v${showNextVersion}` : ''}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onOpenShowPlanner}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                        >
                            <ShareIcon className="h-4 w-4" />
                            Open in Show Planner
                        </button>
                    </div>
                </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <FieldLabel htmlFor="contract-type">Contract Type</FieldLabel>
                    <FieldSelect id="contract-type" value={contractType} onChange={(e) => setContractType(e.target.value as ContractType)}>
                        {Object.keys(CONTRACT_TYPE_PRESETS).map((type) => (
                            <option key={type} value={type}>
                                {type}
                            </option>
                        ))}
                    </FieldSelect>
                </div>
                <div>
                    <FieldLabel htmlFor="event-title">Event Name / Title</FieldLabel>
                    <FieldInput id="event-title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="Corporate Holiday Gala" />
                </div>
                <div>
                    <FieldLabel htmlFor="event-type">Event Type</FieldLabel>
                    <FieldInput id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="Corporate Event" />
                </div>
                <div>
                    <FieldLabel htmlFor="event-date">Event Date *</FieldLabel>
                    <FieldInput id="event-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                </div>
                <div>
                    <FieldLabel htmlFor="event-time">Event Time</FieldLabel>
                    <FieldInput id="event-time" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
                </div>
            </div>

            <div>
                <FieldLabel htmlFor="event-location">Event Location / Address</FieldLabel>
                <FieldTextarea id="event-location" rows={2} value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Hilton Cincinnati Netherland Plaza" />
            </div>
        </div>
    </CardShell>
);

const FinancialTermsSection: React.FC<{
    performanceLength: string;
    setPerformanceLength: (v: string) => void;
    performanceFee: string;
    setPerformanceFee: (v: string) => void;
    depositAmount: string;
    setDepositAmount: (v: string) => void;
    depositDueDate: string;
    setDepositDueDate: (v: string) => void;
    contractType: ContractType;
}> = ({ performanceLength, setPerformanceLength, performanceFee, setPerformanceFee, depositAmount, setDepositAmount, depositDueDate, setDepositDueDate, contractType }) => (
    <CardShell
        title="💰 Financial Terms"
        description="Set the booking economics clearly so the agreement reads like a professional client document."
        icon={<ClockIcon className="w-5 h-5" />}
    >
        <div className="mb-3 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">Preset active: <span className="font-semibold">{contractType}</span> · Deposit and language defaults are tuned for this booking type.</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
                <FieldLabel htmlFor="perf-length">Performance Length</FieldLabel>
                <FieldInput id="perf-length" value={performanceLength} onChange={(e) => setPerformanceLength(e.target.value)} placeholder="45 minutes" />
            </div>
            <div>
                <FieldLabel htmlFor="perf-fee">Performance Fee ($) *</FieldLabel>
                <FieldInput id="perf-fee" type="number" value={performanceFee} onChange={(e) => setPerformanceFee(e.target.value)} placeholder="1500" />
            </div>
            <div>
                <FieldLabel htmlFor="deposit-amt">Deposit Amount ($)</FieldLabel>
                <FieldInput id="deposit-amt" type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="750" />
            </div>
            <div>
                <FieldLabel htmlFor="deposit-due">Deposit Due Date</FieldLabel>
                <FieldInput id="deposit-due" type="date" value={depositDueDate} onChange={(e) => setDepositDueDate(e.target.value)} />
            </div>
        </div>
    </CardShell>
);

const ContractDetailsSection: React.FC<{
    specialRequirements: string;
    setSpecialRequirements: (v: string) => void;
    cancellationPolicy: string;
    setCancellationPolicy: (v: string) => void;
    onGenerate: () => void;
    isLoading: boolean;
    isFormValid: boolean;
    error: string | null;
}> = ({ specialRequirements, setSpecialRequirements, cancellationPolicy, setCancellationPolicy, onGenerate, isLoading, isFormValid, error }) => (
    <CardShell
        title="📜 Contract Details"
        description="Define rider notes, cancellation expectations, and then generate the full agreement language."
        icon={<ShieldIcon className="w-5 h-5" />}
        collapsible
        defaultOpen={false}
        summary={`Requirements: ${specialRequirements.trim() ? 'set' : 'pending'} · Cancellation: ${cancellationPolicy.trim() ? 'set' : 'pending'}`}
    >
        <div className="space-y-4">
            <div>
                <FieldLabel htmlFor="requirements">Special Requirements (Rider)</FieldLabel>
                <FieldTextarea
                    id="requirements"
                    rows={4}
                    value={specialRequirements}
                    onChange={(e) => setSpecialRequirements(e.target.value)}
                    placeholder="Private changing area, bottled water, one microphone on a stand."
                />
            </div>
            <div>
                <FieldLabel htmlFor="cancellation">Cancellation Policy</FieldLabel>
                <FieldTextarea id="cancellation" rows={4} value={cancellationPolicy} onChange={(e) => setCancellationPolicy(e.target.value)} />
            </div>

            <button
                onClick={onGenerate}
                disabled={isLoading || !isFormValid}
                className="w-full rounded-xl border border-purple-400/30 bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-3 text-white font-semibold shadow-[0_0_24px_rgba(168,85,247,0.24)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-slate-700 disabled:shadow-none"
            >
                <span className="inline-flex items-center justify-center gap-2">
                    <WandIcon className="w-5 h-5" />
                    {isLoading ? 'Generating Contract...' : 'Generate Contract'}
                </span>
            </button>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
    </CardShell>
);

const ContractPreviewPanel: React.FC<{
    preview: PreviewContract;
    result: ContractSections | null;
    isLoading: boolean;
    selectedShow: Show | null;
    showNextVersion: number | null;
    showLatestStatus: string | null;
}> = ({ preview, result, isLoading, selectedShow, showNextVersion, showLatestStatus }) => {
    const signatureStub = result?.signatureBlock || `Performer: ${preview.performerName || '________________'}\nClient: ${preview.clientName || '________________'}\nDate: ____________________`;
    const hasPreviewSeedData = Boolean(
        preview.performerName ||
        preview.clientName ||
        preview.eventTitle ||
        preview.eventDate ||
        preview.eventLocation ||
        preview.performanceFee ||
        preview.depositAmount ||
        preview.performanceLength ||
        preview.specialRequirements ||
        preview.cancellationPolicy ||
        result
    );

    return (
        <CardShell
            title="Live Contract Preview"
            description="The agreement preview updates as you build. Generated sections appear below once the AI draft is ready."
            icon={<CalendarIcon className="w-5 h-5" />}
        >
            <div className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4 md:p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                    <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
                        <StatusPill label={preview.clientName ? 'Client linked' : 'Client pending'} active={!!preview.clientName} />
                        <StatusPill label={selectedShow ? 'Show linked' : 'Show pending'} active={!!selectedShow} />
                        <StatusPill label={showNextVersion ? `Version ready · v${showNextVersion}` : 'Version pending'} active={!!showNextVersion} />
                        <StatusPill label={result ? 'AI-generated' : 'Awaiting AI draft'} active={!!result} />
                    </div>

                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 py-4">
                        <div>
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-purple-300/90">Performance Agreement</div>
                            <h4 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-white">{preview.eventTitle || 'Untitled Engagement'}</h4>
                            <p className="mt-1 text-sm text-slate-400">
                                {preview.eventType || 'Professional performance contract'} · {preview.contractType}
                            </p>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right text-xs text-slate-300">
                            <div>Status: {result ? 'AI draft generated' : 'Live preview active'}</div>
                            <div className="mt-1">{showNextVersion ? `Next version: v${showNextVersion}` : 'Versioning available after show link'}</div>
                        </div>
                    </div>

                    {isLoading ? (
                        <LoadingIndicator />
                    ) : !hasPreviewSeedData ? (
                        <div className="space-y-4 pt-4 animate-pulse">
                            <div className="h-4 w-40 rounded bg-white/10"></div>
                            <div className="h-10 w-full rounded-xl bg-white/5"></div>
                            <div className="h-4 w-28 rounded bg-white/10"></div>
                            <div className="h-24 w-full rounded-xl bg-white/5"></div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="h-16 rounded-xl bg-white/5"></div>
                                <div className="h-16 rounded-xl bg-white/5"></div>
                            </div>
                            <p className="text-sm text-slate-400">Start filling in the booking details to watch the agreement assemble in real time.</p>
                        </div>
                    ) : (
                        <div className="space-y-5 pt-4 text-sm text-slate-300">
                            <PreviewBlock title="Parties">
                                <p><span className="text-slate-500">Performer:</span> {preview.performerName || 'Performer name pending'}</p>
                                <p><span className="text-slate-500">Client:</span> {preview.clientName || 'Client name pending'}</p>
                                {preview.clientCompany ? <p><span className="text-slate-500">Company:</span> {preview.clientCompany}</p> : null}
                                {preview.clientEmail ? <p><span className="text-slate-500">Email:</span> {preview.clientEmail}</p> : null}
                                {preview.clientPhone ? <p><span className="text-slate-500">Phone:</span> {preview.clientPhone}</p> : null}
                                {preview.clientAddress ? <p><span className="text-slate-500">Address:</span> {preview.clientAddress}</p> : null}
                            </PreviewBlock>

                            <PreviewBlock title="Event">
                                <p>{formatDateForPreview(preview.eventDate)}</p>
                                {preview.eventTime ? <p>{preview.eventTime}</p> : null}
                                <p>{preview.eventLocation || 'Location to be confirmed'}</p>
                                {preview.performanceLength ? <p>{preview.performanceLength}</p> : null}
                            </PreviewBlock>

                            <PreviewBlock title="💰 Financial Terms">
                                <p><span className="text-slate-500">Performance Fee:</span> {formatCurrency(preview.performanceFee)}</p>
                                <p>
                                    <span className="text-slate-500">Deposit:</span>{' '}
                                    {preview.depositAmount ? formatCurrency(preview.depositAmount) : 'No deposit specified yet'}
                                    {preview.depositDueDate ? ` due ${formatDateForPreview(preview.depositDueDate)}` : ''}
                                </p>
                            </PreviewBlock>

                            <PreviewBlock title="Operational Notes">
                                <p>{preview.specialRequirements || 'Special requirements will appear here once added.'}</p>
                            </PreviewBlock>

                            <PreviewBlock title="Cancellation">
                                <p>{preview.cancellationPolicy || DEFAULT_CANCELLATION_POLICY}</p>
                            </PreviewBlock>

                            <PreviewBlock title="Agreement Language">
                                <p className="font-medium text-slate-200">Performance Details</p>
                                <p className="mb-3 whitespace-pre-wrap">{result?.performanceDetails || 'Performance details will appear here after generation. The agreement will summarize the show type, date, timing, and service commitment.'}</p>
                                <p className="font-medium text-slate-200">Payment Terms</p>
                                <p className="mb-3 whitespace-pre-wrap">{result?.paymentTerms || `Total fee: ${formatCurrency(preview.performanceFee)}. ${preview.depositAmount ? `Deposit: ${formatCurrency(preview.depositAmount)}` : 'Deposit terms pending.'}`}</p>
                                <p className="font-medium text-slate-200">Technical Requirements</p>
                                <p className="mb-3 whitespace-pre-wrap">{result?.technicalRequirements || preview.specialRequirements || 'Technical and rider requirements will appear here.'}</p>
                                <p className="font-medium text-slate-200">Cancellation Policy</p>
                                <p className="mb-3 whitespace-pre-wrap">{result?.cancellationPolicy || preview.cancellationPolicy || DEFAULT_CANCELLATION_POLICY}</p>
                                <p className="font-medium text-slate-200">Force Majeure</p>
                                <p className="mb-3 whitespace-pre-wrap">{result?.forceMajeure || 'Either party may be excused from performance delays or cancellations caused by events beyond reasonable control.'}</p>
                                <p className="font-medium text-slate-200">Signature Block</p>
                                <p className="whitespace-pre-wrap">{signatureStub}</p>
                            </PreviewBlock>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <InfoChip title="Show status" value={selectedShow ? showLatestStatus || 'No saved contract status' : 'No show connected'} />
                    <InfoChip title="Revenue snapshot" value={preview.performanceFee ? formatCurrency(preview.performanceFee) : 'Fee not entered'} />
                    <InfoChip title="Contract preset" value={preview.contractType} />
                    <InfoChip title="Preview tone" value={preview.previewToneSeed} />
                </div>
            </div>
        </CardShell>
    );
};

const ContractActionBar: React.FC<{
    result: ContractSections | null;
    selectedShowId: string;
    selectedClientId: string;
    saveStatus: 'idle' | 'saved';
    copyStatus: 'idle' | 'copied';
    saveToShowStatus: 'idle' | 'saved';
    clientRecordSaveStatus: 'idle' | 'saved';
    emailStatus: 'idle' | 'opened';
    onSave: () => void;
    onCopy: () => void;
    onDownloadPdf: () => void;
    onDownloadTxt: () => void;
    onSendEmail: () => void;
    onSaveToClientRecord: () => void;
    onSaveToShow: () => void;
}> = ({ result, selectedShowId, selectedClientId, saveStatus, copyStatus, saveToShowStatus, clientRecordSaveStatus, emailStatus, onSave, onCopy, onDownloadPdf, onDownloadTxt, onSendEmail, onSaveToClientRecord, onSaveToShow }) => (
    <CardShell
        title="Document Toolbelt"
        description="Export, email, or save this agreement into the connected client and show workflow."
        icon={<ShareIcon className="w-5 h-5" />}
        collapsible
        defaultOpen={false}
        summary={`Actions ready · ${result ? 'document generated' : 'preview only'}`}
    >
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <StatusPill label={result ? 'Document ready' : 'Draft preview'} active={!!result} />
            <StatusPill label={selectedClientId ? 'Client record connected' : 'No client record'} active={!!selectedClientId} />
            <StatusPill label={selectedShowId ? 'Show versioning active' : 'Show versioning off'} active={!!selectedShowId} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ActionButton onClick={onCopy} disabled={!result || copyStatus === 'copied'} primary className="sm:col-span-2">
                {copyStatus === 'copied' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                <span>{copyStatus === 'copied' ? 'Copied!' : 'Copy Contract'}</span>
            </ActionButton>
            <ActionButton onClick={onDownloadPdf} disabled={!result} className="border border-purple-400/20 bg-purple-500/10 text-purple-100 hover:bg-purple-500/15">
                <FileTextIcon className="w-4 h-4" />
                <span>Download PDF</span>
            </ActionButton>
            <ActionButton onClick={onSendEmail} disabled={!selectedClientId}>
                {emailStatus === 'opened' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <ShareIcon className="w-4 h-4" />}
                <span>{emailStatus === 'opened' ? 'Email Ready' : 'Send Email'}</span>
            </ActionButton>
            <ActionButton onClick={onSaveToClientRecord} disabled={!selectedClientId || clientRecordSaveStatus === 'saved'}>
                {clientRecordSaveStatus === 'saved' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <SaveIcon className="w-4 h-4" />}
                <span>{clientRecordSaveStatus === 'saved' ? 'Saved to Client!' : 'Save to Client Record'}</span>
            </ActionButton>
            <ActionButton onClick={onSaveToShow} disabled={!result || !selectedShowId || saveToShowStatus === 'saved'}>
                {saveToShowStatus === 'saved' ? <CheckIcon className="w-4 h-4 text-green-300" /> : <ShareIcon className="w-4 h-4" />}
                <span>{saveToShowStatus === 'saved' ? 'Saved to Show!' : 'Save as New Version to Show'}</span>
            </ActionButton>
            <ActionButton onClick={onSave} disabled={!result || saveStatus === 'saved'} className="sm:col-span-2">
                {saveStatus === 'saved' ? <CheckIcon className="w-4 h-4 text-green-400" /> : <SaveIcon className="w-4 h-4" />}
                <span>{saveStatus === 'saved' ? 'Saved!' : 'Save to Ideas'}</span>
            </ActionButton>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill label="PDF print flow" active={!!result} />
            <button type="button" onClick={onDownloadTxt} disabled={!result} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">Download .txt fallback</button>
        </div>
        <div className="mt-3 text-xs text-slate-400 space-y-1">
            <div>• Save to Client Record appends a structured contract note to the linked client record.</div>
            <div>• Send Email opens a compose-ready draft using the selected client email.</div>
            <div>• Save as New Version to Show creates a versioned draft for the selected show.</div>
        </div>
    </CardShell>
);

const IntegrationHintsCard: React.FC<{ selectedShow: Show | null; selectedClientId: string; performanceFee: string }> = ({ selectedShow, selectedClientId, performanceFee }) => (
    <CardShell
        title="Connected Workflow"
        description="This builder is positioned to connect contracts with CRM, booking value, and Show Planner history."
        icon={<FileTextIcon className="w-5 h-5" />}
        collapsible
        defaultOpen={false}
        summary={`CRM ${selectedClientId ? 'connected' : 'pending'} · Show ${selectedShow ? 'connected' : 'pending'} · Revenue ${performanceFee ? 'set' : 'pending'}`}
    >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <HintTile
                title="Client CRM"
                text={selectedClientId ? 'Client information has been pulled into the contract builder.' : 'Select a client to auto-fill contact details.'}
                active={!!selectedClientId}
            />
            <HintTile
                title="Show Planner"
                text={selectedShow ? `Linked to ${selectedShow.title}${selectedShow.status ? ` · ${selectedShow.status}` : ''}` : 'Link a show to carry event and fee details forward.'}
                active={!!selectedShow}
            />
            <HintTile
                title="Revenue"
                text={performanceFee ? `Current draft value: ${formatCurrency(performanceFee)}` : 'Fee will become a visible contract value signal.'}
                active={!!performanceFee}
            />
        </div>
    </CardShell>
);

const ActionButton: React.FC<{ onClick: () => void; disabled?: boolean; primary?: boolean; className?: string; children: React.ReactNode }> = ({ onClick, disabled, primary, className, children }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
            primary
                ? 'border border-purple-400/25 bg-purple-600 text-white hover:bg-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.22)] disabled:border-white/10 disabled:bg-slate-700 disabled:shadow-none'
                : 'border border-white/10 bg-slate-900/70 text-slate-200 hover:bg-slate-800 disabled:bg-slate-800/60 disabled:text-slate-500'
        } disabled:cursor-not-allowed`}
    >
        {children}
    </button>
);

const HintTile: React.FC<{ title: string; text: string; active?: boolean }> = ({ title, text, active = false }) => (
    <div className={`rounded-xl border p-3 ${active ? 'border-purple-400/20 bg-purple-500/10' : 'border-white/10 bg-slate-950/35'}`}>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</div>
        <p className="mt-1 text-slate-400 text-sm">{text}</p>
    </div>
);

const InfoChip: React.FC<{ title: string; value: string }> = ({ title, value }) => (
    <div className="rounded-lg border border-white/10 bg-slate-950/35 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</div>
        <div className="mt-1 line-clamp-2 text-[13px] leading-5 text-slate-200">{value}</div>
    </div>
);

const PreviewBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{title}</div>
        <div className="space-y-1.5 leading-6">{children}</div>
    </div>
);

const SectionEditor: React.FC<{ title: string; value: string; onChange: (v: string) => void }> = ({ title, value, onChange }) => {
    return (
        <div className="rounded-lg border border-white/10 bg-slate-950/35 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{title}</div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={5}
                className="w-full resize-y rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-purple-400/60 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
        </div>
    );
};
