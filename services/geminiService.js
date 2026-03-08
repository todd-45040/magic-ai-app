"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Type = exports.Modality = exports.generateMagicWireFeed = exports.generateNewsArticle = exports.editImageWithPrompt = exports.generateImages = exports.generateImage = exports.identifyTrickFromImage = exports.generateStructuredResponse = exports.generateResponseWithParts = exports.generateResponse = void 0;
exports.startLiveSession = startLiveSession;
exports.getLikelyLiveAudioModels = getLikelyLiveAudioModels;
exports.decodeAudioData = decodeAudioData;
exports.decode = decode;
exports.encode = encode;
var genai_1 = require("@google/genai");
Object.defineProperty(exports, "Type", { enumerable: true, get: function () { return genai_1.Type; } });
var supabase_1 = require("../supabase");
var aiProviderService_1 = require("./aiProviderService");
function extractJsonBlock(input) {
    var text = (input || '').trim();
    if (!text)
        return '';
    var firstObj = text.indexOf('{');
    var firstArr = text.indexOf('[');
    var start = -1;
    if (firstObj === -1)
        start = firstArr;
    else if (firstArr === -1)
        start = firstObj;
    else
        start = Math.min(firstObj, firstArr);
    if (start === -1)
        return text;
    // Try to find the matching last brace/bracket (best-effort)
    var endObj = text.lastIndexOf('}');
    var endArr = text.lastIndexOf(']');
    var end = Math.max(endObj, endArr);
    if (end === -1 || end <= start)
        return text.slice(start);
    return text.slice(start, end + 1);
}
function escapeNewlinesInsideStrings(jsonLike) {
    var out = '';
    var inStr = false;
    var esc = false;
    for (var i = 0; i < jsonLike.length; i++) {
        var ch = jsonLike[i];
        if (esc) {
            out += ch;
            esc = false;
            continue;
        }
        if (ch === '\\') {
            out += ch;
            esc = true;
            continue;
        }
        if (ch === '"') {
            inStr = !inStr;
            out += ch;
            continue;
        }
        if (inStr && (ch === '\n' || ch === '\r')) {
            out += '\\n';
            if (ch === '\r' && jsonLike[i + 1] === '\n')
                i++;
            continue;
        }
        if (inStr && ch === '\t') {
            out += '\\t';
            continue;
        }
        out += ch;
    }
    return out;
}
function stripTrailingCommas(jsonLike) {
    return String(jsonLike || '').replace(/,\s*([}\]])/g, '$1');
}
function closeLikelyTruncatedJson(jsonLike) {
    var src = String(jsonLike || '');
    var out = '';
    var inStr = false;
    var esc = false;
    var closers = [];
    for (var i = 0; i < src.length; i++) {
        var ch = src[i];
        out += ch;
        if (esc) {
            esc = false;
            continue;
        }
        if (ch === '\\') {
            esc = true;
            continue;
        }
        if (ch === '"') {
            inStr = !inStr;
            continue;
        }
        if (inStr)
            continue;
        if (ch === '{')
            closers.push('}');
        else if (ch === '[')
            closers.push(']');
        else if ((ch === '}' || ch === ']') && closers.length)
            closers.pop();
    }
    if (inStr)
        out += '"';
    if (closers.length)
        out += closers.reverse().join('');
    return out;
}
function safeJsonParse(text) {
    var candidate = extractJsonBlock(text);
    var base = candidate || '{}';
    var repaired = escapeNewlinesInsideStrings(base);
    var attempts = [
        base,
        repaired,
        stripTrailingCommas(repaired),
        closeLikelyTruncatedJson(stripTrailingCommas(repaired)),
    ];
    var lastErr = null;
    for (var _i = 0, attempts_1 = attempts; _i < attempts_1.length; _i++) {
        var attempt = attempts_1[_i];
        try {
            return JSON.parse(attempt || '{}');
        }
        catch (err) {
            lastErr = err;
        }
    }
    throw lastErr || new Error('Invalid JSON');
}
function isAssistantStudioStructuredRequest(prompt, systemInstruction) {
    var haystack = "".concat(String(prompt || ''), "\n").concat(String(systemInstruction || '')).toLowerCase();
    return (haystack.includes("assistant studio") ||
        haystack.includes("assistant-operations") ||
        haystack.includes("assistant operations") ||
        haystack.includes("assistant choreography") ||
        haystack.includes("stage director") ||
        haystack.includes("rehearsal notes"));
}
function buildSchemaFallback(responseSchema, rawText) {
    var props = (responseSchema === null || responseSchema === void 0 ? void 0 : responseSchema.properties) && typeof responseSchema.properties === 'object'
        ? responseSchema.properties
        : {};
    var lines = String(rawText || '')
        .split(/\r?\n+/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean)
        .filter(function (line) { return !/^```/.test(line); })
        .slice(0, 8);
    var shortText = lines.length
        ? lines.join('\n')
        : 'Plan generated, but structured formatting failed. Please regenerate for a cleaner layout.';
    var out = {};
    Object.keys(props).forEach(function (key, idx) {
        var _a;
        var propType = String(((_a = props[key]) === null || _a === void 0 ? void 0 : _a.type) || '').toLowerCase();
        if (propType === 'array')
            out[key] = lines.length ? lines.slice(idx, idx + 3) : [];
        else if (propType === 'number' || propType === 'integer')
            out[key] = 0;
        else if (propType === 'boolean')
            out[key] = false;
        else
            out[key] = shortText;
    });
    return out;
}
function getBearerToken() {
    return __awaiter(this, void 0, void 0, function () {
        var data, token, _a;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, supabase_1.supabase.auth.getSession()];
                case 1:
                    data = (_c.sent()).data;
                    token = (_b = data === null || data === void 0 ? void 0 : data.session) === null || _b === void 0 ? void 0 : _b.access_token;
                    return [2 /*return*/, token ? "Bearer ".concat(token) : 'Bearer guest'];
                case 2:
                    _a = _c.sent();
                    return [2 /*return*/, 'Bearer guest'];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function fetchWithTimeout(input, init, timeoutMs) {
    return __awaiter(this, void 0, void 0, function () {
        var controller, t, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    controller = new AbortController();
                    t = setTimeout(function () { return controller.abort(); }, timeoutMs);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 3, 4]);
                    return [4 /*yield*/, fetch(input, __assign(__assign({}, init), { signal: controller.signal }))];
                case 2:
                    res = _a.sent();
                    return [2 /*return*/, res];
                case 3:
                    clearTimeout(t);
                    return [7 /*endfinally*/];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function sleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
function isRetryableStatus(status) {
    return status === 429 || status === 502 || status === 503 || status === 504;
}
function postJson(url, body, currentUser, extraHeaders, options) {
    return __awaiter(this, void 0, void 0, function () {
        var timeoutMs, retries, init, _a, lastErr, attempt, res, remaining, limit, membership, burstRemaining, burstLimit, text, json, message, err_1, isAbort, isNetwork, msg;
        var _b, _c;
        var _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0:
                    timeoutMs = (_d = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _d !== void 0 ? _d : 90000;
                    retries = (_e = options === null || options === void 0 ? void 0 : options.retries) !== null && _e !== void 0 ? _e : 2;
                    _b = {
                        method: 'POST'
                    };
                    _c = { 'Content-Type': 'application/json' };
                    _a = 'Authorization';
                    return [4 /*yield*/, getBearerToken()];
                case 1:
                    init = (_b.headers = __assign.apply(void 0, [(_c[_a] = _g.sent(), _c['X-AI-Provider'] = (0, aiProviderService_1.getAiProvider)(), _c), (extraHeaders || {})]),
                        _b.body = JSON.stringify(body),
                        _b);
                    lastErr = null;
                    attempt = 0;
                    _g.label = 2;
                case 2:
                    if (!(attempt <= retries)) return [3 /*break*/, 13];
                    _g.label = 3;
                case 3:
                    _g.trys.push([3, 9, , 12]);
                    return [4 /*yield*/, fetchWithTimeout(url, init, timeoutMs)];
                case 4:
                    res = _g.sent();
                    // Emit usage info for the Usage Meter UI (best-effort)
                    try {
                        remaining = res.headers.get('X-AI-Remaining');
                        limit = res.headers.get('X-AI-Limit');
                        membership = res.headers.get('X-AI-Membership');
                        burstRemaining = res.headers.get('X-AI-Burst-Remaining');
                        burstLimit = res.headers.get('X-AI-Burst-Limit');
                        if (remaining || limit || membership || burstRemaining || burstLimit) {
                            window.dispatchEvent(new CustomEvent('ai-usage-update', {
                                detail: {
                                    remaining: remaining ? Number(remaining) : undefined,
                                    limit: limit ? Number(limit) : undefined,
                                    membership: membership || undefined,
                                    burstRemaining: burstRemaining ? Number(burstRemaining) : undefined,
                                    burstLimit: burstLimit ? Number(burstLimit) : undefined,
                                    ts: Date.now(),
                                },
                            }));
                        }
                    }
                    catch (_h) {
                        // ignore
                    }
                    return [4 /*yield*/, res.text()];
                case 5:
                    text = _g.sent();
                    json = void 0;
                    try {
                        json = text ? JSON.parse(text) : {};
                    }
                    catch (_j) {
                        json = { raw: text };
                    }
                    if (!!res.ok) return [3 /*break*/, 8];
                    message = (json === null || json === void 0 ? void 0 : json.error) || (json === null || json === void 0 ? void 0 : json.message) || "Request failed (".concat(res.status, ")");
                    if (!(attempt < retries && isRetryableStatus(res.status))) return [3 /*break*/, 7];
                    return [4 /*yield*/, sleep(800 * (attempt + 1))];
                case 6:
                    _g.sent();
                    return [3 /*break*/, 12];
                case 7: throw new Error(message);
                case 8: return [2 /*return*/, json];
                case 9:
                    err_1 = _g.sent();
                    lastErr = err_1;
                    isAbort = (err_1 === null || err_1 === void 0 ? void 0 : err_1.name) === 'AbortError' || /aborted/i.test(String((err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || ''));
                    isNetwork = /network|failed to fetch/i.test(String((err_1 === null || err_1 === void 0 ? void 0 : err_1.message) || ''));
                    if (!(attempt < retries && (isAbort || isNetwork))) return [3 /*break*/, 11];
                    return [4 /*yield*/, sleep(800 * (attempt + 1))];
                case 10:
                    _g.sent();
                    return [3 /*break*/, 12];
                case 11: return [3 /*break*/, 13];
                case 12:
                    attempt++;
                    return [3 /*break*/, 2];
                case 13:
                    msg = (lastErr === null || lastErr === void 0 ? void 0 : lastErr.name) === 'AbortError'
                        ? "Request timed out (".concat(Math.round(((_f = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _f !== void 0 ? _f : 90000) / 1000), "s)")
                        : ((lastErr === null || lastErr === void 0 ? void 0 : lastErr.message) || 'Request failed');
                    throw new Error(msg);
            }
        });
    });
}
function extractText(result) {
    var _a, _b, _c;
    // SDK usually exposes `.text` (client-side). Your serverless function returns the raw result.
    if (typeof (result === null || result === void 0 ? void 0 : result.text) === 'string' && result.text.trim())
        return result.text;
    // Try common candidate path
    var parts = (_c = (_b = (_a = result === null || result === void 0 ? void 0 : result.candidates) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.parts;
    if (Array.isArray(parts)) {
        var joined = parts
            .map(function (p) { return p === null || p === void 0 ? void 0 : p.text; })
            .filter(function (t) { return typeof t === 'string'; })
            .join('')
            .trim();
        if (joined)
            return joined;
    }
    return "No response generated.";
}
var generateResponse = function (prompt, systemInstruction, currentUser, history, options) { return __awaiter(void 0, void 0, void 0, function () {
    var apiHistory, body, result, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                apiHistory = (history === null || history === void 0 ? void 0 : history.map(function (msg) { return ({
                    role: msg.role,
                    parts: [{ text: msg.text }]
                }); })) || [];
                body = {
                    model: 'gemini-3-pro-preview',
                    contents: __spreadArray(__spreadArray([], apiHistory, true), [{ role: 'user', parts: [{ text: prompt }] }], false),
                    config: { systemInstruction: systemInstruction },
                };
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, postJson('/api/generate', body, currentUser, options === null || options === void 0 ? void 0 : options.extraHeaders, { timeoutMs: 90000, retries: 2 })];
            case 2:
                result = _a.sent();
                return [2 /*return*/, extractText(result)];
            case 3:
                error_1 = _a.sent();
                console.error('AI Error:', error_1);
                return [2 /*return*/, "Error: ".concat((error_1 === null || error_1 === void 0 ? void 0 : error_1.message) || 'Failed to connect to AI wizard.')];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.generateResponse = generateResponse;
var generateResponseWithParts = function (parts, systemInstruction, currentUser, history, options) { return __awaiter(void 0, void 0, void 0, function () {
    var apiHistory, body, result, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                apiHistory = (history === null || history === void 0 ? void 0 : history.map(function (msg) { return ({
                    role: msg.role,
                    parts: [{ text: msg.text }]
                }); })) || [];
                body = {
                    model: 'gemini-3-pro-preview',
                    contents: __spreadArray(__spreadArray([], apiHistory, true), [{ role: 'user', parts: parts }], false),
                    config: { systemInstruction: systemInstruction },
                };
                _a.label = 1;
            case 1:
                _a.trys.push([1, 3, , 4]);
                return [4 /*yield*/, postJson('/api/generate', body, currentUser, options === null || options === void 0 ? void 0 : options.extraHeaders, { timeoutMs: 90000, retries: 2 })];
            case 2:
                result = _a.sent();
                return [2 /*return*/, extractText(result)];
            case 3:
                error_2 = _a.sent();
                console.error('AI Error:', error_2);
                return [2 /*return*/, "Error: ".concat((error_2 === null || error_2 === void 0 ? void 0 : error_2.message) || 'Failed to connect to AI wizard.')];
            case 4: return [2 /*return*/];
        }
    });
}); };
exports.generateResponseWithParts = generateResponseWithParts;
var generateStructuredResponse = function (prompt, systemInstruction, responseSchema, currentUser, options) { return __awaiter(void 0, void 0, void 0, function () {
    var speedMode, model, body, result, text, looksTruncated, clampForPrompt, err_2, msg, wasTruncated, retryPrompt, retryBody, retryResult, retryText, err2_1, isAssistantStudio, msg2_1, shorterPrompt, shorterBody, shorterResult, shorterText, msg2, fallbackPrompt, fallbackBody, fallbackResult, fallbackText;
    var _a, _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                speedMode = (_a = options === null || options === void 0 ? void 0 : options.speedMode) !== null && _a !== void 0 ? _a : 'full';
                model = speedMode === 'fast' ? 'gemini-2.5-flash' : 'gemini-2.5-pro';
                body = {
                    model: model,
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    config: __assign({ systemInstruction: systemInstruction, responseMimeType: "application/json", responseSchema: responseSchema }, (typeof (options === null || options === void 0 ? void 0 : options.maxOutputTokens) === 'number' ? { maxOutputTokens: options.maxOutputTokens } : {})),
                };
                return [4 /*yield*/, postJson('/api/generate', body, currentUser, options === null || options === void 0 ? void 0 : options.extraHeaders, { timeoutMs: 90000, retries: 2 })];
            case 1:
                result = _d.sent();
                text = extractText(result);
                looksTruncated = function (raw, errMsg) {
                    var t = (raw || '').trim();
                    if (!t)
                        return false;
                    if (/end of data/i.test(errMsg))
                        return true;
                    // If it doesn't end like JSON, it was likely cut off mid-object/array.
                    return !/[}\]]\s*$/.test(t);
                };
                clampForPrompt = function (s, maxChars) {
                    var str = String(s || '');
                    if (str.length <= maxChars)
                        return str;
                    return str.slice(0, maxChars) + "\n\n[TRUNCATED ".concat(str.length - maxChars, " CHARS]");
                };
                _d.label = 2;
            case 2:
                _d.trys.push([2, 3, , 11]);
                return [2 /*return*/, safeJsonParse(text || '{}')];
            case 3:
                err_2 = _d.sent();
                msg = String((err_2 === null || err_2 === void 0 ? void 0 : err_2.message) || err_2 || 'Invalid JSON');
                wasTruncated = looksTruncated(text || '', msg);
                retryPrompt = "The previous response was INVALID JSON and failed to parse (error: ".concat(msg, ").\n") +
                    (wasTruncated ? "It appears the JSON was TRUNCATED (cut off before closing braces).\n\n" : "\n") +
                    "Re-emit ONLY valid JSON that conforms EXACTLY to the provided schema.\n" +
                    "Rules:\n" +
                    "- Output ONLY JSON (no markdown fences, no prose).\n" +
                    "- Do NOT include trailing comments.\n" +
                    "- Do NOT include raw newlines inside string values; use \\n if needed.\n" +
                    "- Ensure all quotes inside strings are properly escaped.\n" +
                    "- The JSON MUST be complete and MUST end with a closing } or ].\n" +
                    "- If you are running out of space, shorten string fields (titles, transitions) but keep the schema valid.\n\n" +
                    "Here is the invalid output to fix:\n" +
                    "".concat(clampForPrompt(text || '', 8000), "\n\n") +
                    "Now output the corrected JSON only.";
                retryBody = {
                    // More reliable structured output in edge cases (truncation / schema pressure)
                    model: model,
                    contents: [{ role: 'user', parts: [{ text: retryPrompt }] }],
                    config: __assign({ systemInstruction: systemInstruction, responseMimeType: "application/json", responseSchema: responseSchema }, (speedMode === 'fast'
                        ? { maxOutputTokens: Math.max(Number((_b = options === null || options === void 0 ? void 0 : options.maxOutputTokens) !== null && _b !== void 0 ? _b : 900), 1200) }
                        : (typeof (options === null || options === void 0 ? void 0 : options.maxOutputTokens) === 'number'
                            ? { maxOutputTokens: Math.max(options.maxOutputTokens, 8192) }
                            : { maxOutputTokens: 8192 }))),
                };
                return [4 /*yield*/, postJson('/api/generate', retryBody, currentUser, options === null || options === void 0 ? void 0 : options.extraHeaders, { timeoutMs: 90000, retries: 1 })];
            case 4:
                retryResult = _d.sent();
                retryText = extractText(retryResult);
                _d.label = 5;
            case 5:
                _d.trys.push([5, 6, , 10]);
                return [2 /*return*/, safeJsonParse(retryText || '{}')];
            case 6:
                err2_1 = _d.sent();
                isAssistantStudio = isAssistantStudioStructuredRequest(prompt, systemInstruction);
                if (!(speedMode === 'fast' && isAssistantStudio)) return [3 /*break*/, 8];
                msg2_1 = String((err2_1 === null || err2_1 === void 0 ? void 0 : err2_1.message) || err2_1 || 'Invalid JSON');
                shorterPrompt = "The JSON is still invalid after a repair attempt (error: ".concat(msg2_1, ").\n\n") +
                    "Re-emit a SHORTER but still useful JSON object that fits the schema exactly.\n" +
                    "Hard requirements:\n" +
                    "- JSON ONLY (no markdown, no prose).\n" +
                    "- Keep every required field populated.\n" +
                    "- Shorten string values aggressively, but do not leave fields blank.\n" +
                    "- Every field must remain usable rehearsal content.\n" +
                    "- The JSON MUST be complete and MUST end with } or ].\n\n" +
                    "Here is the invalid output to shorten and repair:\n" +
                    "".concat(clampForPrompt(retryText || text || '', 5000), "\n\n") +
                    "Now output the corrected SHORTER JSON only.";
                shorterBody = {
                    model: model,
                    contents: [{ role: 'user', parts: [{ text: shorterPrompt }] }],
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                        maxOutputTokens: Math.max(Number((_c = options === null || options === void 0 ? void 0 : options.maxOutputTokens) !== null && _c !== void 0 ? _c : 900), 1200),
                    },
                };
                return [4 /*yield*/, postJson('/api/generate', shorterBody, currentUser, options === null || options === void 0 ? void 0 : options.extraHeaders, { timeoutMs: 90000, retries: 1 })];
            case 7:
                shorterResult = _d.sent();
                shorterText = extractText(shorterResult);
                try {
                    return [2 /*return*/, safeJsonParse(shorterText || '{}')];
                }
                catch (err3) {
                    throw new Error("Assistant Studio JSON parse failed after repair retry: ".concat(String((err3 === null || err3 === void 0 ? void 0 : err3.message) || err3 || 'Invalid JSON')));
                }
                _d.label = 8;
            case 8:
                // Assistant Studio must not silently fake success with fallback stubs.
                // For other fast tools, keep the lightweight schema fallback.
                if (speedMode === 'fast' && !isAssistantStudio) {
                    return [2 /*return*/, buildSchemaFallback(responseSchema, retryText || text || '')];
                }
                msg2 = String((err2_1 === null || err2_1 === void 0 ? void 0 : err2_1.message) || err2_1 || 'Invalid JSON');
                fallbackPrompt = "The JSON is STILL invalid after a repair attempt (error: ".concat(msg2, ").\n\n") +
                    "Re-emit a SHORTER JSON that fits within limits while preserving the schema.\n" +
                    "Hard requirements:\n" +
                    "- JSON ONLY (no markdown, no prose).\n" +
                    "- MUST be complete and MUST end with } or ].\n" +
                    "- Preserve the provided schema exactly.\n" +
                    "- Shorten all strings aggressively (especially transition_notes).\n" +
                    "- If segments are part of the schema, keep them minimal and concise.\n\n" +
                    "Here is the last invalid output (for reference):\n" +
                    "".concat(clampForPrompt(retryText || text || '', 6000), "\n\n") +
                    "Now output the corrected SHORTER JSON only.";
                fallbackBody = {
                    model: model,
                    contents: [{ role: 'user', parts: [{ text: fallbackPrompt }] }],
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                        maxOutputTokens: 4096,
                    },
                };
                return [4 /*yield*/, postJson('/api/generate', fallbackBody, currentUser, options === null || options === void 0 ? void 0 : options.extraHeaders, { timeoutMs: 90000, retries: 1 })];
            case 9:
                fallbackResult = _d.sent();
                fallbackText = extractText(fallbackResult);
                try {
                    return [2 /*return*/, safeJsonParse(fallbackText || '{}')];
                }
                catch (err3) {
                    if (isAssistantStudioStructuredRequest(prompt, systemInstruction)) {
                        throw new Error("Assistant Studio JSON parse failed after final repair attempt: ".concat(String((err3 === null || err3 === void 0 ? void 0 : err3.message) || err3 || 'Invalid JSON')));
                    }
                    return [2 /*return*/, buildSchemaFallback(responseSchema, fallbackText || retryText || text || '')];
                }
                return [3 /*break*/, 10];
            case 10: return [3 /*break*/, 11];
            case 11: return [2 /*return*/];
        }
    });
}); };
exports.generateStructuredResponse = generateStructuredResponse;
var identifyTrickFromImage = function (base64ImageData, mimeType, currentUser) { return __awaiter(void 0, void 0, void 0, function () {
    var prompt, responseSchema, body, result, text, parsed, trickName, videoQueriesRaw, videoQueries, fallbackQueries, queriesToUse, videos, yt, ytVideos, _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                prompt = "Identify this magic trick based on the image provided. " +
                    "Return JSON with: (1) trickName and (2) videoQueries: 3 concise YouTube search queries " +
                    "that will likely find real performance examples (no URLs).";
                responseSchema = {
                    type: genai_1.Type.OBJECT,
                    properties: {
                        trickName: { type: genai_1.Type.STRING },
                        videoQueries: {
                            type: genai_1.Type.ARRAY,
                            items: { type: genai_1.Type.STRING },
                        },
                    },
                    required: ['trickName', 'videoQueries']
                };
                body = {
                    model: model,
                    contents: {
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: mimeType, data: base64ImageData } }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: responseSchema,
                    },
                };
                return [4 /*yield*/, postJson('/api/generate', body, currentUser)];
            case 1:
                result = _b.sent();
                text = extractText(result);
                parsed = JSON.parse(text || '{}');
                trickName = String((parsed === null || parsed === void 0 ? void 0 : parsed.trickName) || '').trim() || 'Unknown Trick';
                videoQueriesRaw = Array.isArray(parsed === null || parsed === void 0 ? void 0 : parsed.videoQueries) ? parsed.videoQueries : [];
                videoQueries = videoQueriesRaw
                    .map(function (q) { return String(q || '').trim(); })
                    .filter(Boolean)
                    .slice(0, 3);
                fallbackQueries = [
                    "".concat(trickName, " magic trick performance"),
                    "".concat(trickName, " illusion on stage performance"),
                    "".concat(trickName, " magic trick live show"),
                ];
                queriesToUse = videoQueries.length ? videoQueries : fallbackQueries;
                videos = [];
                _b.label = 2;
            case 2:
                _b.trys.push([2, 4, , 5]);
                return [4 /*yield*/, postJson('/api/videoSearch', { queries: queriesToUse, maxResultsPerQuery: 3, safeSearch: 'strict' }, currentUser)];
            case 3:
                yt = _b.sent();
                ytVideos = Array.isArray(yt === null || yt === void 0 ? void 0 : yt.videos) ? yt.videos : [];
                videos = ytVideos
                    .map(function (v) { return ({ title: String((v === null || v === void 0 ? void 0 : v.title) || '').trim(), url: String((v === null || v === void 0 ? void 0 : v.url) || '').trim() }); })
                    .filter(function (v) { return v.title && v.url; })
                    .slice(0, 3);
                return [3 /*break*/, 5];
            case 4:
                _a = _b.sent();
                // If YouTube API fails (quota/network), keep a safe fallback:
                // provide YouTube search links that will always work.
                videos = queriesToUse.slice(0, 3).map(function (q) { return ({
                    title: "Search YouTube: ".concat(q),
                    url: "https://www.youtube.com/results?search_query=".concat(encodeURIComponent(q)),
                }); });
                return [3 /*break*/, 5];
            case 5: return [2 /*return*/, { trickName: trickName, videoExamples: videos }];
        }
    });
}); };
exports.identifyTrickFromImage = identifyTrickFromImage;
// Google rotates preview suffixes; keep a short list of likely working models.
// (Used for display only until we ship an ephemeral-token broker.)
var LIVE_MODEL_CANDIDATES = [
    'gemini-2.5-flash-native-audio-preview-12-2025',
    'gemini-2.5-flash-native-audio-preview-09-2025',
];
/**
 * Start a Gemini Live (native audio) session.
 *
 * Production baseline:
 * - Disabled until we add a server-side ephemeral token broker.
 * - This prevents exposing any Google AI keys in the client bundle.
 */
function startLiveSession(systemInstruction, callbacks, tools) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            void systemInstruction;
            void callbacks;
            void tools;
            throw new Error('Live Rehearsal (native audio) is disabled in the production baseline to prevent frontend key exposure. ' +
                'Next step: implement a server-side ephemeral token broker for Google Live sessions.');
        });
    });
}
// Optional helper for UI display/diagnostics.
function getLikelyLiveAudioModels() {
    return __spreadArray([], LIVE_MODEL_CANDIDATES, true);
}
// Minimal helper used by LiveRehearsal.tsx. This implementation assumes raw PCM16.
// If you re-enable live audio, you may want a more robust decoder.
function decodeAudioData(bytes_1, ctx_1) {
    return __awaiter(this, arguments, void 0, function (bytes, ctx, sampleRate, channels) {
        var int16, float32, i, buffer;
        if (sampleRate === void 0) { sampleRate = 24000; }
        if (channels === void 0) { channels = 1; }
        return __generator(this, function (_a) {
            int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
            float32 = new Float32Array(int16.length);
            for (i = 0; i < int16.length; i++)
                float32[i] = int16[i] / 32768;
            buffer = ctx.createBuffer(channels, float32.length, sampleRate);
            buffer.getChannelData(0).set(float32);
            return [2 /*return*/, buffer];
        });
    });
}
function decode(base64) {
    var binaryString = atob(base64);
    var len = binaryString.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++)
        bytes[i] = binaryString.charCodeAt(i);
    return bytes;
}
function encode(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
// --- Image + News helpers (serverless) ---
/**
 * Generate an image using the serverless Imagen endpoint.
 * Returns a data URL you can drop directly into an <img src="..." />.
 */
var generateImage = function (prompt_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([prompt_1], args_1, true), void 0, function (prompt, aspectRatio, currentUser) {
        var result, img, base64, mime;
        var _a, _b, _c, _d;
        if (aspectRatio === void 0) { aspectRatio = "1:1"; }
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0: return [4 /*yield*/, postJson('/api/generate-images', { prompt: prompt, aspectRatio: aspectRatio }, currentUser)];
                case 1:
                    result = _e.sent();
                    img = ((_a = result === null || result === void 0 ? void 0 : result.generatedImages) === null || _a === void 0 ? void 0 : _a[0]) || ((_b = result === null || result === void 0 ? void 0 : result.images) === null || _b === void 0 ? void 0 : _b[0]) || ((_c = result === null || result === void 0 ? void 0 : result.data) === null || _c === void 0 ? void 0 : _c[0]);
                    base64 = ((_d = img === null || img === void 0 ? void 0 : img.image) === null || _d === void 0 ? void 0 : _d.imageBytes) ||
                        (img === null || img === void 0 ? void 0 : img.imageBytes) ||
                        (img === null || img === void 0 ? void 0 : img.b64_json) ||
                        (img === null || img === void 0 ? void 0 : img.base64);
                    mime = (img === null || img === void 0 ? void 0 : img.mimeType) || (img === null || img === void 0 ? void 0 : img.mime) || 'image/jpeg';
                    if (typeof base64 === 'string' && base64.length > 0) {
                        return [2 /*return*/, "data:".concat(mime, ";base64,").concat(base64)];
                    }
                    throw new Error('No image data returned from /api/generate-images.');
            }
        });
    });
};
exports.generateImage = generateImage;
/**
 * Generate multiple images (variations) using the serverless Imagen endpoint.
 * Returns an array of data URLs you can drop directly into an <img src="..." />.
 */
var generateImages = function (prompt_1) {
    var args_1 = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args_1[_i - 1] = arguments[_i];
    }
    return __awaiter(void 0, __spreadArray([prompt_1], args_1, true), void 0, function (prompt, aspectRatio, count, currentUser) {
        var safeCount, result, imgs, out, _a, _b, img, base64, mime;
        var _c;
        if (aspectRatio === void 0) { aspectRatio = "1:1"; }
        if (count === void 0) { count = 4; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    safeCount = Math.max(1, Math.min(4, Math.floor(Number(count) || 1)));
                    return [4 /*yield*/, postJson('/api/generate-images', { prompt: prompt, aspectRatio: aspectRatio, count: safeCount }, currentUser)];
                case 1:
                    result = _d.sent();
                    imgs = (result === null || result === void 0 ? void 0 : result.generatedImages) || (result === null || result === void 0 ? void 0 : result.images) || (result === null || result === void 0 ? void 0 : result.data);
                    if (!Array.isArray(imgs) || imgs.length === 0) {
                        throw new Error('No image data returned from /api/generate-images.');
                    }
                    out = [];
                    for (_a = 0, _b = imgs.slice(0, safeCount); _a < _b.length; _a++) {
                        img = _b[_a];
                        base64 = ((_c = img === null || img === void 0 ? void 0 : img.image) === null || _c === void 0 ? void 0 : _c.imageBytes) ||
                            (img === null || img === void 0 ? void 0 : img.imageBytes) ||
                            (img === null || img === void 0 ? void 0 : img.b64_json) ||
                            (img === null || img === void 0 ? void 0 : img.base64);
                        mime = (img === null || img === void 0 ? void 0 : img.mimeType) || (img === null || img === void 0 ? void 0 : img.mime) || 'image/jpeg';
                        if (typeof base64 === 'string' && base64.length > 0) {
                            out.push("data:".concat(mime, ";base64,").concat(base64));
                        }
                    }
                    if (out.length === 0) {
                        throw new Error('No image data returned from /api/generate-images.');
                    }
                    return [2 /*return*/, out];
            }
        });
    });
};
exports.generateImages = generateImages;
/**
 * Image editing is not wired through a serverless route yet.
 * Keep the API surface so the app compiles, but fail gracefully.
 */
var editImageWithPrompt = function (base64ImageData, mimeType, prompt, currentUser) { return __awaiter(void 0, void 0, void 0, function () {
    var result, img, base64, mime;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0: return [4 /*yield*/, postJson('/api/edit-images', { imageBase64: base64ImageData, mimeType: mimeType, prompt: prompt }, currentUser)];
            case 1:
                result = _e.sent();
                img = ((_a = result === null || result === void 0 ? void 0 : result.generatedImages) === null || _a === void 0 ? void 0 : _a[0]) || ((_b = result === null || result === void 0 ? void 0 : result.images) === null || _b === void 0 ? void 0 : _b[0]) || ((_c = result === null || result === void 0 ? void 0 : result.data) === null || _c === void 0 ? void 0 : _c[0]);
                base64 = ((_d = img === null || img === void 0 ? void 0 : img.image) === null || _d === void 0 ? void 0 : _d.imageBytes) ||
                    (img === null || img === void 0 ? void 0 : img.imageBytes) ||
                    (img === null || img === void 0 ? void 0 : img.b64_json) ||
                    (img === null || img === void 0 ? void 0 : img.base64);
                mime = (img === null || img === void 0 ? void 0 : img.mimeType) || (img === null || img === void 0 ? void 0 : img.mime) || 'image/jpeg';
                if (typeof base64 === 'string' && base64.length > 0) {
                    return [2 /*return*/, "data:".concat(mime, ";base64,").concat(base64)];
                }
                throw new Error('No image data returned from /api/edit-images.');
        }
    });
}); };
exports.editImageWithPrompt = editImageWithPrompt;
/**
 * Generate a single fictional news article for the Magic Wire.
 */
var generateNewsArticle = function (currentUser) { return __awaiter(void 0, void 0, void 0, function () {
    var prompt, responseSchema;
    return __generator(this, function (_a) {
        prompt = "Generate a single magic news article for the 'Magic Wire' feed. Return as JSON. If you reference a real public source, include its URL in sourceUrl; otherwise omit sourceUrl.";
        responseSchema = {
            type: genai_1.Type.OBJECT,
            properties: {
                category: { type: genai_1.Type.STRING },
                headline: { type: genai_1.Type.STRING },
                source: { type: genai_1.Type.STRING },
                sourceUrl: { type: genai_1.Type.STRING },
                summary: { type: genai_1.Type.STRING },
                body: { type: genai_1.Type.STRING },
            },
            required: ['category', 'headline', 'source', 'summary', 'body']
        };
        return [2 /*return*/, (0, exports.generateStructuredResponse)(prompt, 'You are the Magic Wire editor. Write engaging, plausible-sounding magic industry news. Keep it safe and family-friendly.', responseSchema, currentUser)];
    });
}); };
exports.generateNewsArticle = generateNewsArticle;
/**
 * Generate multiple fictional news articles for the Magic Wire in ONE server call.
 * This is much more reliable than firing many parallel requests (burst limits / timeouts).
 */
var generateMagicWireFeed = function (count) { return __awaiter(void 0, void 0, void 0, function () {
    var safeCount, data, token, res, text;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                safeCount = Math.max(1, Math.min(12, Math.floor(count || 1)));
                return [4 /*yield*/, supabase_1.supabase.auth.getSession()];
            case 1:
                data = (_b.sent()).data;
                token = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
                if (!token)
                    throw new Error('Not authenticated');
                return [4 /*yield*/, fetch("/api/magicWire?count=".concat(safeCount), {
                        headers: { Authorization: "Bearer ".concat(token) },
                    })];
            case 2:
                res = _b.sent();
                return [4 /*yield*/, res.text()];
            case 3:
                text = _b.sent();
                if (!res.ok)
                    throw new Error(text || "Request failed (".concat(res.status, ")"));
                return [2 /*return*/, JSON.parse(text)];
        }
    });
}); };
exports.generateMagicWireFeed = generateMagicWireFeed;
