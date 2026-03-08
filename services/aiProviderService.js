"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAiProvider = getAiProvider;
exports.setAiProvider = setAiProvider;
var KEY = 'maw_ai_provider';
function getAiProvider() {
    try {
        var v = String(localStorage.getItem(KEY) || '').toLowerCase();
        if (v === 'openai' || v === 'anthropic' || v === 'gemini')
            return v;
    }
    catch (_a) { }
    return 'gemini';
}
function setAiProvider(provider) {
    try {
        localStorage.setItem(KEY, provider);
    }
    catch (_a) { }
    try {
        window.dispatchEvent(new CustomEvent('ai-provider-update', { detail: { provider: provider } }));
    }
    catch (_b) { }
}
