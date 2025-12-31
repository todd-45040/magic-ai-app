import React, { useState, useRef } from 'react';
import { exportData, importData, clearAllData } from '../services/dataService';
import { DatabaseIcon, DownloadIcon, UploadIcon, TrashIcon, CheckIcon } from './icons';

interface DataManagerProps {
    onClose: () => void;
    onDataRestored: () => void;
}

const DataManager: React.FC<DataManagerProps> = ({ onClose, onDataRestored }) => {
    const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [exportStatus, setExportStatus] = useState<'idle' | 'loading'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [isClearing, setIsClearing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleExportClick = async () => {
        setExportStatus('loading');
        try {
            await exportData();
        } catch (e) {
            console.error(e);
            setErrorMessage("Failed to export data.");
        } finally {
            setExportStatus('idle');
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (window.confirm("Restoring from backup will replace your current data with the backup file. Are you sure you want to proceed?")) {
            setImportStatus('loading');
            try {
                await importData(file);
                setImportStatus('success');
                setTimeout(() => {
                    onDataRestored();
                    onClose();
                }, 1500);
            } catch (err) {
                setImportStatus('error');
                setErrorMessage(err instanceof Error ? err.message : "Failed to import data.");
            }
        }
        e.target.value = ''; // Reset input
    };

    const handleClearData = async () => {
        const confirm1 = window.confirm("WARNING: This will permanently delete ALL your shows, ideas, clients, and history from the cloud. This action cannot be undone.");
        if (confirm1) {
            const confirm2 = window.confirm("Are you absolutely sure? All data will be lost forever.");
            if (confirm2) {
                setIsClearing(true);
                try {
                    await clearAllData();
                    onDataRestored();
                    onClose();
                } catch (error) {
                    console.error("Failed to clear data:", error);
                    setErrorMessage("Failed to clear data.");
                } finally {
                    setIsClearing(false);
                }
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="w-full max-w-lg bg-slate-800 border border-purple-500 rounded-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <header className="p-6 border-b border-slate-700 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <DatabaseIcon className="w-8 h-8 text-purple-400" />
                        <div>
                            <h2 className="text-xl font-bold text-white font-cinzel">Data Management</h2>
                            <p className="text-sm text-slate-400">Securely backup or restore your creative work.</p>
                        </div>
                    </div>
                </header>

                <div className="p-6 space-y-6">
                    {/* Export Section */}
                    <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <DownloadIcon className="w-5 h-5 text-sky-400" />
                            Backup Your Work
                        </h3>
                        <p className="text-sm text-slate-300 mb-4">
                            Download a full copy of your shows, scripts, ideas, and clients to your computer. Keep this file safe!
                        </p>
                        <button
                            onClick={handleExportClick}
                            disabled={exportStatus === 'loading'}
                            className="w-full py-2 bg-sky-600 hover:bg-sky-700 rounded-md text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <DownloadIcon className="w-4 h-4" />
                            <span>{exportStatus === 'loading' ? 'Exporting...' : 'Export Backup File'}</span>
                        </button>
                    </div>

                    {/* Import Section */}
                    <div className="bg-slate-700/30 p-4 rounded-lg border border-slate-600">
                        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <UploadIcon className="w-5 h-5 text-green-400" />
                            Restore from Backup
                        </h3>
                        <p className="text-sm text-slate-300 mb-4">
                            Upload a previously saved backup file to restore your data.
                            <span className="text-amber-400 block mt-1 text-xs font-semibold">⚠️ This will overwrite current data.</span>
                        </p>
                        <input
                            type="file"
                            accept=".json"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <button
                            onClick={handleImportClick}
                            disabled={importStatus === 'loading'}
                            className="w-full py-2 bg-green-700 hover:bg-green-800 rounded-md text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {importStatus === 'loading' ? (
                                <span>Restoring...</span>
                            ) : importStatus === 'success' ? (
                                <><CheckIcon className="w-4 h-4" /><span>Restore Complete</span></>
                            ) : (
                                <><UploadIcon className="w-4 h-4" /><span>Select Backup File</span></>
                            )}
                        </button>
                        {importStatus === 'error' && <p className="text-red-400 text-sm text-center mt-2">{errorMessage}</p>}
                    </div>

                    {/* Danger Zone */}
                    <div className="border-t border-slate-700 pt-4 mt-4">
                        <button
                            onClick={handleClearData}
                            disabled={isClearing}
                            className="w-full py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <TrashIcon className="w-4 h-4" />
                            <span>{isClearing ? 'Clearing Data...' : 'Factory Reset (Clear All Data)'}</span>
                        </button>
                    </div>
                </div>

                <footer className="p-4 border-t border-slate-700 bg-slate-900/50 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-md text-white font-bold transition-colors">
                        Close
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DataManager;