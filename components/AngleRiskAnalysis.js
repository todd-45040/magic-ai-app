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
exports.default = AngleRiskAnalysis;
var react_1 = require("react");
var constants_1 = require("../constants");
var geminiService_1 = require("../services/geminiService");
var ideasService_1 = require("../services/ideasService");
var showsService_1 = require("../services/showsService");
var icons_1 = require("./icons");
var FormattedText_1 = require("./FormattedText");
var ToastProvider_1 = require("./ToastProvider");
var DEFAULT_KEY_MOMENTS = [
    'Load',
    'Ditch',
    'Secret action',
    'Reset',
    'Volunteer management',
];
var FOCUS_CHIPS = [
    'Sightlines & angles',
    'Reset risks',
    'Handling tells',
    'Blocking & body position',
    'Timing of secret actions',
];
var DEFAULT_ROUTINE_STEPS = [
    'Introduction / framing',
    'Secret setup or load',
    'Main effect sequence',
    'Reveal / applause cue',
    'Cleanup / reset',
];
function AngleRiskAnalysis(_a) {
    var _this = this;
    var user = _a.user, onIdeaSaved = _a.onIdeaSaved, onDeepLinkShowPlanner = _a.onDeepLinkShowPlanner, onNavigate = _a.onNavigate, onAiSpark = _a.onAiSpark;
    var toast = (0, ToastProvider_1.useToast)();
    var routineNameRef = (0, react_1.useRef)(null);
    var focusRef = (0, react_1.useRef)(null);
    var _b = (0, react_1.useState)(''), routineName = _b[0], setRoutineName = _b[1];
    var _c = (0, react_1.useState)('Close-up'), mode = _c[0], setMode = _c[1];
    var _d = (0, react_1.useState)('Seated (front)'), setup = _d[0], setSetup = _d[1];
    var _e = (0, react_1.useState)(''), propsText = _e[0], setPropsText = _e[1];
    var _f = (0, react_1.useState)([]), keyMoments = _f[0], setKeyMoments = _f[1];
    var _g = (0, react_1.useState)(''), focusText = _g[0], setFocusText = _g[1];
    var _h = (0, react_1.useState)(DEFAULT_ROUTINE_STEPS.join('\n')), routineSteps = _h[0], setRoutineSteps = _h[1];
    var _j = (0, react_1.useState)('Close-up table'), venueType = _j[0], setVenueType = _j[1];
    var _k = (0, react_1.useState)('Bright / direct'), lighting = _k[0], setLighting = _k[1];
    var _l = (0, react_1.useState)('1–3 ft'), audienceDistance = _l[0], setAudienceDistance = _l[1];
    var _m = (0, react_1.useState)(false), isLoading = _m[0], setIsLoading = _m[1];
    var _o = (0, react_1.useState)(''), analysis = _o[0], setAnalysis = _o[1];
    var parsedAnalysis = (0, react_1.useMemo)(function () {
        var _a, _b, _c, _d, _e;
        var raw = (analysis || '').trim();
        if (!raw)
            return null;
        var sectionEntries = raw
            .split(/\n(?=#{2,6}\s+)/)
            .map(function (section) { return section.trim(); })
            .filter(Boolean);
        var sections = sectionEntries.map(function (section) {
            var _a = section.split('\n'), headingLine = _a[0], bodyLines = _a.slice(1);
            var heading = headingLine.replace(/^#{2,6}\s+/, '').trim();
            var body = bodyLines.join('\n').trim();
            var bulletItems = body
                .split('\n')
                .map(function (line) { return line.trim(); })
                .filter(Boolean)
                .map(function (line) { return line.replace(/^[-*•]\s+/, ''); })
                .map(function (line) { return line.replace(/^\d+\.\s+/, ''); });
            return { heading: heading, body: body, bulletItems: bulletItems };
        });
        var findSection = function () {
            var _a;
            var keywords = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                keywords[_i] = arguments[_i];
            }
            return (_a = sections.find(function (section) {
                var heading = section.heading.toLowerCase();
                return keywords.every(function (keyword) { return heading.includes(keyword); });
            })) !== null && _a !== void 0 ? _a : null;
        };
        return {
            sections: sections,
            overview: findSection('overview'),
            sightlines: (_a = findSection('sightline')) !== null && _a !== void 0 ? _a : findSection('angle'),
            reset: (_c = (_b = findSection('reset')) !== null && _b !== void 0 ? _b : findSection('pocket')) !== null && _c !== void 0 ? _c : findSection('prop'),
            handling: (_e = (_d = findSection('handling')) !== null && _d !== void 0 ? _d : findSection('body-language')) !== null && _e !== void 0 ? _e : findSection('body language'),
            mitigations: findSection('mitigation'),
            questions: findSection('questions', 'refine'),
            critical: findSection('critical', 'exposure'),
            coaching: findSection('professional', 'coaching'),
        };
    }, [analysis]);
    var scoreRisk = function (text, fallback) {
        if (fallback === void 0) { fallback = 30; }
        var lower = text.toLowerCase();
        var score = fallback;
        if (/(extreme|highest risk|severe|very high)/.test(lower))
            score += 45;
        if (/(high risk|high exposure|significant|critical)/.test(lower))
            score += 30;
        if (/(moderate|medium|watch for|caution|careful)/.test(lower))
            score += 15;
        if (/(low risk|generally safe|minimal|minor)/.test(lower))
            score -= 10;
        return Math.max(10, Math.min(95, score));
    };
    var riskProfile = (0, react_1.useMemo)(function () {
        var _a, _b, _c, _d, _e;
        if (!analysis.trim())
            return null;
        var postureScore = scoreRisk(((_a = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.handling) === null || _a === void 0 ? void 0 : _a.body) || analysis, 38);
        var blockingScore = scoreRisk("".concat(((_b = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.sightlines) === null || _b === void 0 ? void 0 : _b.body) || '', "\n").concat(((_c = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.reset) === null || _c === void 0 ? void 0 : _c.body) || '') || analysis, 42);
        var timingScore = scoreRisk("".concat(focusText, "\n").concat(analysis), 35);
        var anglesScore = scoreRisk(((_d = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.sightlines) === null || _d === void 0 ? void 0 : _d.body) || analysis, 45);
        var resetScore = scoreRisk(((_e = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.reset) === null || _e === void 0 ? void 0 : _e.body) || analysis, 32);
        var metrics = [
            { label: 'Posture', score: postureScore },
            { label: 'Blocking', score: blockingScore },
            { label: 'Timing', score: timingScore },
            { label: 'Angles', score: anglesScore },
            { label: 'Reset', score: resetScore },
        ].map(function (metric) { return (__assign(__assign({}, metric), { level: metric.score >= 70 ? 'High' : metric.score >= 45 ? 'Medium' : 'Low' })); });
        var average = Math.round(metrics.reduce(function (sum, item) { return sum + item.score; }, 0) / metrics.length);
        var overall = average >= 70 ? { label: 'High', dot: '🔴' } : average >= 45 ? { label: 'Medium', dot: '🟡' } : { label: 'Low', dot: '🟢' };
        var topRisks = __spreadArray([], metrics, true).sort(function (a, b) { return b.score - a.score; })
            .slice(0, 2)
            .map(function (item) { return item.label; });
        return { overall: overall, average: average, topRisks: topRisks, metrics: metrics };
    }, [analysis, focusText, parsedAnalysis]);
    var criticalExposurePoints = (0, react_1.useMemo)(function () {
        var _a, _b, _c, _d;
        var sourceItems = __spreadArray(__spreadArray(__spreadArray(__spreadArray([], (((_a = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.critical) === null || _a === void 0 ? void 0 : _a.bulletItems) || []), true), (((_b = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.sightlines) === null || _b === void 0 ? void 0 : _b.bulletItems) || []), true), (((_c = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.reset) === null || _c === void 0 ? void 0 : _c.bulletItems) || []), true), (((_d = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.handling) === null || _d === void 0 ? void 0 : _d.bulletItems) || []), true);
        return Array.from(new Set(sourceItems)).slice(0, 4);
    }, [parsedAnalysis]);
    var coachingNotes = (0, react_1.useMemo)(function () {
        var _a, _b;
        var sourceItems = __spreadArray(__spreadArray([], (((_a = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.coaching) === null || _a === void 0 ? void 0 : _a.bulletItems) || []), true), (((_b = parsedAnalysis === null || parsedAnalysis === void 0 ? void 0 : parsedAnalysis.mitigations) === null || _b === void 0 ? void 0 : _b.bulletItems) || []), true);
        return Array.from(new Set(sourceItems)).slice(0, 5);
    }, [parsedAnalysis]);
    var canAnalyze = routineName.trim().length > 0;
    // Phase 6B: Improve output scannability without changing AI logic.
    // We decorate key section headings with visual anchors, and render the Mitigations section
    // in a dedicated, actionable checklist container.
    var decoratedOutput = (0, react_1.useMemo)(function () {
        var _a, _b, _c, _d;
        var raw = analysis || '';
        if (!raw.trim())
            return null;
        var decorateHeadings = function (txt) {
            var lines = txt.split('\n');
            var out = [];
            for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                var line = lines_1[_i];
                var trimmed = line.trim();
                var isHeading = /^#{2,6}\s+/.test(trimmed);
                if (!isHeading) {
                    out.push(line);
                    continue;
                }
                var lower = trimmed.toLowerCase();
                // Sightlines
                if (lower.includes('sightline')) {
                    out.push(trimmed.replace(/^#{2,6}\s+.*/, '### 👁 Sightlines'));
                    continue;
                }
                // Reset / pocket / prop management
                if (lower.includes('reset') || lower.includes('pocket') || lower.includes('prop management')) {
                    out.push(trimmed.replace(/^#{2,6}\s+.*/, '### 🔁 Reset Risks'));
                    continue;
                }
                // Handling/body-language tells
                if (lower.includes('handling') || lower.includes('body-language') || lower.includes('body language') || lower.includes('tells')) {
                    out.push(trimmed.replace(/^#{2,6}\s+.*/, '### 🧍 Handling Tells'));
                    continue;
                }
                out.push(line);
            }
            return out.join('\n');
        };
        // Extract Mitigations section (if present) so we can render it as a checklist.
        // We look for a heading containing "Mitigations" and split until the next heading.
        var mitigationsHeadingRegex = /^#{2,6}\s+.*mitigations.*$/gim;
        var mitigationsMatch = mitigationsHeadingRegex.exec(raw);
        var mainWithoutMitigations = raw;
        var mitigationsItems = [];
        if (mitigationsMatch) {
            var headingStart = mitigationsMatch.index;
            var afterHeadingIndex = headingStart + mitigationsMatch[0].length;
            var afterHeading = raw.slice(afterHeadingIndex);
            // Find the next heading after Mitigations.
            var nextHeadingMatch = afterHeading.match(/\n#{2,6}\s+/m);
            var mitigationsBody = nextHeadingMatch
                ? afterHeading.slice(0, (_a = nextHeadingMatch.index) !== null && _a !== void 0 ? _a : 0)
                : afterHeading;
            var post = nextHeadingMatch
                ? afterHeading.slice((_b = nextHeadingMatch.index) !== null && _b !== void 0 ? _b : 0)
                : '';
            var pre = raw.slice(0, headingStart);
            mitigationsItems = mitigationsBody
                .split('\n')
                .map(function (l) { return l.trim(); })
                .filter(Boolean)
                .map(function (l) { return l.replace(/^[-*•]\s+/, ''); })
                .map(function (l) { return l.replace(/^\d+\.?\s+/, ''); })
                .filter(Boolean);
            mainWithoutMitigations = "".concat(pre, "\n").concat(post).trim();
        }
        // Extract "Questions to refine this analysis" so we can elevate it with a refinement CTA.
        var questionsHeadingRegex = /^#{2,6}\s+.*questions\s+to\s+refine.*$/gim;
        var questionsMatch = questionsHeadingRegex.exec(mainWithoutMitigations);
        var mainText = mainWithoutMitigations;
        var questionsItems = [];
        if (questionsMatch) {
            var qStart = questionsMatch.index;
            var afterQHeadingIndex = qStart + questionsMatch[0].length;
            var afterHeading = mainWithoutMitigations.slice(afterQHeadingIndex);
            // Questions are usually at the end; if there's another heading after, stop there.
            var nextHeadingMatch = afterHeading.match(/\n#{2,6}\s+/m);
            var qBody = nextHeadingMatch
                ? afterHeading.slice(0, (_c = nextHeadingMatch.index) !== null && _c !== void 0 ? _c : 0)
                : afterHeading;
            var qPre = mainWithoutMitigations.slice(0, qStart);
            var qPost = nextHeadingMatch
                ? afterHeading.slice((_d = nextHeadingMatch.index) !== null && _d !== void 0 ? _d : 0)
                : '';
            mainText = "".concat(qPre, "\n").concat(qPost).trim();
            questionsItems = qBody
                .split('\n')
                .map(function (l) { return l.trim(); })
                .filter(Boolean)
                .map(function (l) { return l.replace(/^[-*•]\s+/, ''); })
                .map(function (l) { return l.replace(/^\d+\.?\s+/, ''); })
                .filter(Boolean);
        }
        var firstQuestion = questionsItems.length ? questionsItems[0] : '';
        return {
            main: decorateHeadings(mainText),
            mitigationsItems: mitigationsItems,
            questionsItems: questionsItems,
            firstQuestion: firstQuestion,
        };
    }, [analysis]);
    var normalizedTags = (0, react_1.useMemo)(function () {
        var tags = new Set();
        tags.add('angle-risk');
        tags.add('analysis');
        if (mode)
            tags.add(mode.toLowerCase());
        if (setup.toLowerCase().includes('360'))
            tags.add('surrounded');
        if (focusText.toLowerCase().includes('reset'))
            tags.add('reset');
        if (focusText.toLowerCase().includes('angle') || focusText.toLowerCase().includes('sight'))
            tags.add('angles');
        if (focusText.toLowerCase().includes('timing'))
            tags.add('timing');
        return Array.from(tags).slice(0, 10);
    }, [focusText, mode, setup]);
    var toggleKeyMoment = function (m) {
        setKeyMoments(function (prev) { return (prev.includes(m) ? prev.filter(function (x) { return x !== m; }) : __spreadArray(__spreadArray([], prev, true), [m], false)); });
    };
    var appendFocusChip = function (t) {
        setFocusText(function (prev) {
            var trimmed = prev.trim();
            if (!trimmed)
                return t;
            if (trimmed.toLowerCase().includes(t.toLowerCase()))
                return prev;
            return "".concat(trimmed, "\n").concat(t);
        });
    };
    var handleAnalyze = function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: 
                // Keep the main Analyze button behavior centralized so the refinement loop
                // and initial run always use the same prompt builder.
                return [4 /*yield*/, runAnalysis()];
                case 1:
                    // Keep the main Analyze button behavior centralized so the refinement loop
                    // and initial run always use the same prompt builder.
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); };
    var handleSaveIdea = function () { return __awaiter(_this, void 0, void 0, function () {
        var e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!analysis.trim())
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, (0, ideasService_1.saveIdea)({
                            type: 'text',
                            title: "Angle/Risk: ".concat(routineName.trim() || 'Routine'),
                            content: "Routine: ".concat(routineName, "\nMode: ").concat(mode, "\nAudience: ").concat(setup, "\n\nFocus:\n").concat(focusText || '(none)', "\n\n---\n\n").concat(analysis),
                            tags: normalizedTags,
                        })];
                case 2:
                    _a.sent();
                    toast.showToast('Saved to My Ideas', 'success');
                    onIdeaSaved === null || onIdeaSaved === void 0 ? void 0 : onIdeaSaved();
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    console.error(e_1);
                    toast.showToast('Could not save idea.', 'error');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    // Phase 6D: Primary CTA - convert this analysis into a Show Planner item.
    var handleSaveToShowPlanner = function () { return __awaiter(_this, void 0, void 0, function () {
        var title, show, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!analysis.trim())
                        return [2 /*return*/];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    title = routineName.trim() ? "Angle/Risk \u2014 ".concat(routineName.trim()) : 'Angle/Risk — Routine';
                    return [4 /*yield*/, (0, showsService_1.createShow)(title, 'Created from Angle/Risk Analysis')];
                case 2:
                    show = _a.sent();
                    return [4 /*yield*/, (0, showsService_1.addTaskToShow)(show.id, {
                            title: 'Review Angle/Risk Notes',
                            notes: analysis,
                            priority: 'High',
                            status: 'To-Do',
                        })];
                case 3:
                    _a.sent();
                    toast.showToast('Saved to Show Planner', 'success');
                    if (onDeepLinkShowPlanner) {
                        onDeepLinkShowPlanner(show.id);
                    }
                    else {
                        // Fallback: if the parent doesn’t provide a deep-link handler, at least navigate.
                        onNavigate === null || onNavigate === void 0 ? void 0 : onNavigate('show-planner');
                    }
                    return [3 /*break*/, 5];
                case 4:
                    e_2 = _a.sent();
                    console.error(e_2);
                    toast.showToast('Could not save to Show Planner.', 'error');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    // Helper used by both the initial analysis and the refinement loop.
    // Allows a one-off focus override without changing overall data flow.
    var runAnalysis = function (focusOverride) { return __awaiter(_this, void 0, void 0, function () {
        var focusToUse, prompt, text, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!canAnalyze || isLoading)
                        return [2 /*return*/];
                    setIsLoading(true);
                    setAnalysis('');
                    focusToUse = (focusOverride !== null && focusOverride !== void 0 ? focusOverride : focusText).trim();
                    prompt = [
                        "You are an expert stagecraft and rehearsal coach for magicians.",
                        "Task: Provide an Angle/Risk Analysis for the routine named: \"".concat(routineName.trim(), "\"."),
                        "Context: Performance mode = ".concat(mode, ". Audience setup = ").concat(setup, "."),
                        "Venue context: venue type = ".concat(venueType, "; lighting = ").concat(lighting, "; audience distance = ").concat(audienceDistance, "."),
                        routineSteps.trim() ? "Routine phases / structure:\n".concat(routineSteps.trim()) : null,
                        propsText.trim() ? "Props/Setup Notes: ".concat(propsText.trim()) : null,
                        keyMoments.length ? "Key moments to protect: ".concat(keyMoments.join(', '), ".") : null,
                        focusToUse ? "User focus requests: ".concat(focusToUse) : null,
                        '',
                        "Rules (important):",
                        "- Do NOT expose methods, secret gimmicks, sleights, or step-by-step instructions.",
                        "- Give performance-safe guidance: blocking, sightlines, timing, misdirection, handling tells, reset and pocket management.",
                        "- If something depends on method details you cannot know, say what to watch for in general (non-exposure).",
                        '',
                        "Output format (use headings):",
                        "1) Overview (1 short paragraph)",
                        "2) Sightline & Angle Risks (bullets)",
                        "3) Reset & Pocket/Prop Management Risks (bullets)",
                        "4) Handling/Body-Language Tells (bullets)",
                        "5) Critical Exposure Points (3-5 bullets that name the vulnerable moment, why it is exposed, and the safer adjustment)",
                        "6) Professional Coaching Notes (3-5 concise bullets on blocking, posture, timing, and audience management)",
                        "7) Mitigations (3\u20137 actionable steps, written as checklist items)",
                        "8) Questions to refine this analysis (3\u20136 targeted questions)",
                    ].filter(Boolean).join('\n');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, (0, geminiService_1.generateResponse)(prompt, constants_1.ANGLE_RISK_ANALYSIS_SYSTEM_INSTRUCTION, user)];
                case 2:
                    text = _a.sent();
                    setAnalysis(text);
                    return [3 /*break*/, 5];
                case 3:
                    e_3 = _a.sent();
                    console.error(e_3);
                    toast.showToast('Angle/Risk analysis failed. Please try again.', 'error');
                    return [3 /*break*/, 5];
                case 4:
                    setIsLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleRefineWithAI = function () { return __awaiter(_this, void 0, void 0, function () {
        var prompt, text, e_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!analysis.trim() || isLoading)
                        return [2 /*return*/];
                    prompt = [
                        'You are a rehearsal coach for a magician. Help refine this routine WITHOUT exposing method.',
                        routineName.trim() ? "Routine: ".concat(routineName.trim()) : null,
                        "Mode: ".concat(mode, ". Audience setup: ").concat(setup, "."),
                        focusText.trim() ? "Focus: ".concat(focusText.trim()) : null,
                        '',
                        'Angle/Risk Analysis Notes:',
                        analysis.trim(),
                        '',
                        'Task: Propose a revised blocking and handling plan that reduces exposure risk. Provide 3-7 actionable rehearsal drills.',
                    ].filter(Boolean).join('\n');
                    // Preferred: hand off to the parent (AI Assistant) so the user can continue iterating there.
                    if (onAiSpark) {
                        onAiSpark({ kind: 'angle-risk-refine', prompt: prompt, routineName: routineName.trim() });
                        onNavigate === null || onNavigate === void 0 ? void 0 : onNavigate('ai-assistant');
                        return [2 /*return*/];
                    }
                    // Fallback: if no parent handler exists, run the refinement on this page.
                    setIsLoading(true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 4, 5]);
                    return [4 /*yield*/, (0, geminiService_1.generateResponse)(prompt, constants_1.ANGLE_RISK_ANALYSIS_SYSTEM_INSTRUCTION, user)];
                case 2:
                    text = _a.sent();
                    setAnalysis(text);
                    toast.showToast('Refinement generated', 'success');
                    return [3 /*break*/, 5];
                case 3:
                    e_4 = _a.sent();
                    console.error(e_4);
                    toast.showToast('Refinement failed. Please try again.', 'error');
                    return [3 /*break*/, 5];
                case 4:
                    setIsLoading(false);
                    return [7 /*endfinally*/];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleRefineFromQuestions = function () {
        var _a;
        var q = (_a = decoratedOutput === null || decoratedOutput === void 0 ? void 0 : decoratedOutput.firstQuestion) === null || _a === void 0 ? void 0 : _a.trim();
        if (!q)
            return;
        // Pre-fill focus field with the first refinement question and bring the user back to inputs.
        setFocusText(q);
        // Smooth scroll + focus + automatically rerun analysis with the new focus.
        setTimeout(function () {
            var _a, _b;
            (_a = focusRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: 'smooth', block: 'center' });
            (_b = focusRef.current) === null || _b === void 0 ? void 0 : _b.focus();
            // Run immediately using the override (state updates are async).
            void runAnalysis(q);
        }, 0);
    };
    var handleRunVideoRehearsal = function () {
        if (onNavigate) {
            onNavigate('video-rehearsal');
            return;
        }
        toast.showToast('Video Rehearsal navigation is not available in this build.', 'info');
    };
    // Phase 6D: utility CTAs
    var handleShare = function () { return __awaiter(_this, void 0, void 0, function () {
        var shareText, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!analysis.trim())
                        return [2 /*return*/];
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    shareText = "Angle/Risk Analysis \u2014 ".concat(routineName.trim() || 'Routine', "\nMode: ").concat(mode, " | Audience: ").concat(setup, "\n\n").concat(analysis);
                    return [4 /*yield*/, navigator.clipboard.writeText(shareText)];
                case 2:
                    _b.sent();
                    toast.showToast('Copied share text to clipboard', 'success');
                    return [3 /*break*/, 4];
                case 3:
                    _a = _b.sent();
                    toast.showToast('Could not copy to clipboard.', 'error');
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    }); };
    var loadDemoPreset = function () {
        setRoutineName('Zombie Ball');
        setMode('Parlor');
        setSetup('Seated (front)');
        setVenueType('Parlor room');
        setLighting('Mixed / uneven');
        setAudienceDistance('3–10 ft');
        setKeyMoments(['Load', 'Secret action', 'Reset']);
        setPropsText('Floating sphere, foulard cloth, side table, limited backstage space.');
        setRoutineSteps(['Introduction with cloth display', 'Secret setup under the foulard', 'Floating sequence and audience focus shifts', 'Reveal and applause cue', 'Cleanup and reset before next piece'].join('\n'));
        setFocusText('Watch right-side exposure during the float, posture tells during the secret setup, and reset safety between routines.');
        toast.showToast('Demo routine loaded', 'success');
        setTimeout(function () { var _a; return (_a = routineNameRef.current) === null || _a === void 0 ? void 0 : _a.focus(); }, 0);
    };
    var handleStartOver = function () {
        setAnalysis('');
        setIsLoading(false);
        setRoutineName('');
        setMode('Close-up');
        setSetup('Seated (front)');
        setVenueType('Close-up table');
        setLighting('Bright / direct');
        setAudienceDistance('1–3 ft');
        setPropsText('');
        setKeyMoments([]);
        setFocusText('');
        setRoutineSteps(DEFAULT_ROUTINE_STEPS.join('\n'));
        toast.showToast('Ready for a new analysis', 'info');
        setTimeout(function () { var _a; return (_a = routineNameRef.current) === null || _a === void 0 ? void 0 : _a.focus(); }, 0);
    };
    return (<div className="flex flex-col lg:flex-row gap-6 p-6">
      {/* Left: Inputs */}
      <div className="w-full lg:w-[420px]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-400/20 bg-purple-500/15 text-purple-200">
              <icons_1.ShieldIcon className="h-5 w-5"/>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Angle/Risk Analysis</h2>
              <p className="mt-1 text-sm text-white/65">Analyze sightline exposure, posture tells, blocking pressure points, and reset vulnerabilities.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={loadDemoPreset} className="rounded-full border border-purple-400/30 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-100 hover:bg-purple-500/20">
              Load Demo Routine
            </button>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Routine name</label>
              <input ref={routineNameRef} value={routineName} onChange={function (e) { return setRoutineName(e.target.value); }} placeholder="e.g., Zombie Ball (floating sphere)" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"/>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Performance mode</label>
                <select value={mode} onChange={function (e) { return setMode(e.target.value); }} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                  {['Close-up', 'Parlor', 'Stage', 'Walkaround'].map(function (m) { return (<option key={m} value={m}>{m}</option>); })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Audience setup</label>
                <select value={setup} onChange={function (e) { return setSetup(e.target.value); }} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                  {['Seated (front)', 'Standing (close-up)', 'Surrounded / 360°', 'Stage (wide)'].map(function (s) { return (<option key={s} value={s}>{s}</option>); })}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Venue type</label>
                <select value={venueType} onChange={function (e) { return setVenueType(e.target.value); }} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                  {['Close-up table', 'Walk-around floor', 'Parlor room', 'Theater stage', 'Street / outdoor'].map(function (v) { return (<option key={v} value={v}>{v}</option>); })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Lighting</label>
                <select value={lighting} onChange={function (e) { return setLighting(e.target.value); }} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                  {['Bright / direct', 'Mixed / uneven', 'Dim / low light'].map(function (v) { return (<option key={v} value={v}>{v}</option>); })}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Audience distance</label>
                <select value={audienceDistance} onChange={function (e) { return setAudienceDistance(e.target.value); }} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40">
                  {['1–3 ft', '3–10 ft', '10+ ft'].map(function (v) { return (<option key={v} value={v}>{v}</option>); })}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Routine phases</label>
              <textarea value={routineSteps} onChange={function (e) { return setRoutineSteps(e.target.value); }} rows={5} placeholder="List the key phases in order so the AI can analyze the weak points more precisely" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"/>
              <p className="mt-2 text-xs text-white/55">One phase per line works best. This gives the analysis a real routine map instead of forcing it to guess.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Key moments to protect <span className="text-white/50">(where exposure is most likely)</span></label>
              <div className="flex flex-wrap gap-2">
                {DEFAULT_KEY_MOMENTS.map(function (m) { return (<button key={m} type="button" onClick={function () { return toggleKeyMoment(m); }} className={"rounded-full border px-3 py-1.5 text-xs font-medium transition ".concat(keyMoments.includes(m)
                ? 'border-purple-400/40 bg-purple-500/20 text-purple-100'
                : 'border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/[0.05]', "\n                    ")}>
                    {m}
                  </button>); })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Props / constraints (optional)</label>
              <textarea value={propsText} onChange={function (e) { return setPropsText(e.target.value); }} rows={3} placeholder="e.g., table height is low; black backdrop; foulard cloth; limited pocket space" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"/>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">Focus (optional)</label>
              <textarea ref={focusRef} value={focusText} onChange={function (e) { return setFocusText(e.target.value); }} rows={3} placeholder="e.g., angles during steals, reset risk between tables, posture tells during secret actions" className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/40"/>
              <p className="mt-2 text-xs text-white/55">Use this to bias the analysis (e.g., angles, handling tells, reset safety).</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {FOCUS_CHIPS.map(function (t) { return (<button key={t} type="button" onClick={function () { return appendFocusChip(t); }} className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.05]">
                    {t}
                  </button>); })}
              </div>
            </div>

            <button onClick={handleAnalyze} disabled={!canAnalyze || isLoading} className="mt-1 w-full rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {isLoading ? 'Analyzing…' : 'Analyze Routine Risk'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Output */}
      <div className="flex-1">
        <div className="h-full min-h-[520px] rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          {!analysis && !isLoading && (<div className="h-full flex flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-white/70">
                <icons_1.ShieldIcon className="h-6 w-6"/>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">Ready to analyze this routine</h3>
              <p className="mt-1 max-w-md text-sm text-white/60">Enter the routine details and click <span className="text-white/75">Analyze Routine Risk</span>. The AI will score angles, posture, blocking, timing, and reset pressure points.</p>

              <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
                {['Posture', 'Blocking', 'Timing', 'Angles'].map(function (t) { return (<div key={t} className="rounded-xl border border-white/10 bg-black/10 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{t}</p>
                      <div className="h-2 w-16 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full w-1/2 bg-white/20 animate-pulse"/>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="h-2 rounded bg-white/10 animate-pulse"/>
                      <div className="h-2 w-5/6 rounded bg-white/10 animate-pulse"/>
                      <div className="h-2 w-2/3 rounded bg-white/10 animate-pulse"/>
                    </div>
                  </div>); })}
              </div>
            </div>)}

          {isLoading && (<div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"/>
              <div className="text-white/80 font-semibold">Analyzing angle and risk…</div>
              <div className="mt-2 text-sm text-white/55">Looking for sightlines, reset pressure points, and tells.</div>
            </div>)}

          {!!analysis && !isLoading && (<div className="flex h-full flex-col">
              <div className="flex-1 overflow-auto pr-1">
                {riskProfile && (<div className="mb-4 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-white">Risk Profile</p>
                          <p className="mt-1 text-xs text-white/60">Fast scannable scoring so this page feels like a real rehearsal analysis system.</p>
                        </div>
                        <div className="lg:text-right">
                          <div className="text-sm text-white/85">
                            Overall Risk: <span className="font-semibold">{riskProfile.overall.dot} {riskProfile.overall.label}</span>
                          </div>
                          <div className="mt-1 text-xs text-white/60">Top pressure points: <span className="text-white/75">{riskProfile.topRisks.join(', ')}</span></div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                        {riskProfile.metrics.map(function (metric) { return (<div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-white">{metric.label}</p>
                              <span className="text-xs font-semibold text-white/70">{metric.level}</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                              <div className="h-full rounded-full bg-purple-400/80" style={{ width: "".concat(metric.score, "%") }}/>
                            </div>
                            <div className="mt-2 text-xs text-white/50">{metric.score}/100</div>
                          </div>); })}
                      </div>
                    </div>

                    {(criticalExposurePoints.length > 0 || coachingNotes.length > 0) && (<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                          <div className="flex items-center gap-2">
                            <icons_1.EyeIcon className="h-4 w-4 text-purple-200"/>
                            <p className="text-sm font-semibold text-white">Critical Exposure Points</p>
                          </div>
                          <p className="mt-1 text-xs text-white/60">The moments most likely to flash, feel suspicious, or create reset pressure.</p>
                          <ul className="mt-3 space-y-2">
                            {criticalExposurePoints.length ? criticalExposurePoints.map(function (item, idx) { return (<li key={"".concat(idx, "-").concat(item.slice(0, 12))} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/80">{item}</li>); }) : <li className="text-sm text-white/50">No critical points were extracted from this report.</li>}
                          </ul>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                          <div className="flex items-center gap-2">
                            <icons_1.ShieldIcon className="h-4 w-4 text-purple-200"/>
                            <p className="text-sm font-semibold text-white">Professional Coaching Notes</p>
                          </div>
                          <p className="mt-1 text-xs text-white/60">Quick rehearsal coaching notes you can actually act on during practice.</p>
                          <ul className="mt-3 space-y-2">
                            {coachingNotes.length ? coachingNotes.map(function (item, idx) { return (<li key={"".concat(idx, "-").concat(item.slice(0, 12))} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-white/80">{item}</li>); }) : <li className="text-sm text-white/50">No coaching notes were extracted from this report.</li>}
                          </ul>
                        </div>
                      </div>)}
                  </div>)}

                {/* Phase 6B: Decorated headings + actionable Mitigations checklist */}
                {decoratedOutput ? (<>
                    {!!decoratedOutput.main.trim() && <FormattedText_1.default text={decoratedOutput.main}/>}

                    {decoratedOutput.mitigationsItems.length > 0 && (<div className="my-4 rounded-xl border border-purple-400/20 bg-purple-500/10 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">🛡 Mitigations</p>
                            <p className="mt-1 text-xs text-white/60">Actionable steps to reduce exposure risk and improve control.</p>
                          </div>
                        </div>

                        <ul className="mt-3 space-y-2">
                          {decoratedOutput.mitigationsItems.slice(0, 12).map(function (item, idx) {
                        // Emphasize a leading verb/phrase (best-effort) without changing the model output.
                        var m = item.match(/^([A-Za-z][A-Za-z'’\-]+(?:\s+[A-Za-z][A-Za-z'’\-]+){0,2})([:—\-])\s*(.*)$/);
                        var lead = m ? m[1] : item.split(/\s+/)[0];
                        var rest = m ? m[3] : item.slice(lead.length).trim();
                        return (<li key={"".concat(idx, "-").concat(lead)} className="flex gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                                <div className="mt-0.5 h-5 w-5 flex items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-white/60">
                                  ✓
                                </div>
                                <div className="text-sm text-white/85 leading-relaxed">
                                  <strong className="text-white">{lead}</strong>{rest ? " \u2014 ".concat(rest) : ''}
                                </div>
                              </li>);
                    })}
                        </ul>
                      </div>)}

                    {decoratedOutput.questionsItems.length > 0 && (<div className="my-4 rounded-xl border border-white/10 bg-black/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">Want even more precision?</p>
                            <p className="mt-1 text-xs text-white/60">Answer the first question to refine your focus, then rerun the analysis.</p>
                          </div>
                          <button onClick={handleRefineFromQuestions} className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/[0.07]">
                            Refine this analysis
                          </button>
                        </div>

                        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/80">
                          {decoratedOutput.questionsItems.slice(0, 8).map(function (q, i) { return (<li key={"".concat(i, "-").concat(q.slice(0, 12))} className="leading-relaxed">{q}</li>); })}
                        </ol>
                      </div>)}
                  </>) : (<FormattedText_1.default text={analysis}/>)}
              </div>
              {/* Phase 6D: clearer CTA footer with primary "Next Steps" + de-emphasized utilities */}
              <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="flex-1">
                    <p className="text-xs font-semibold tracking-wide text-white/60">Next Steps</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button onClick={handleSaveToShowPlanner} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-700">
                        <icons_1.SaveIcon className="h-4 w-4"/>
                        Save to Show Planner
                      </button>
                      <button onClick={handleRefineWithAI} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.07]">
                        <icons_1.WandIcon className="h-4 w-4"/>
                        Refine with AI
                      </button>
                      <button onClick={handleRunVideoRehearsal} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/[0.07]">
                        <icons_1.VideoIcon className="h-4 w-4"/>
                        Run Video Rehearsal
                      </button>
                    </div>
                  </div>

                  <div className="lg:text-right">
                    <p className="text-xs font-semibold tracking-wide text-white/50">Utilities</p>
                    <div className="mt-2 flex flex-wrap gap-2 lg:justify-end">
                      <button onClick={handleSaveIdea} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]">
                        <icons_1.SaveIcon className="h-4 w-4"/>
                        Save Idea
                      </button>
                      <button onClick={handleShare} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]">
                        <icons_1.ShareIcon className="h-4 w-4"/>
                        Share
                      </button>
                      <button onClick={handleStartOver} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/[0.05]">
                        Start Over
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>)}
        </div>
      </div>
    </div>);
}
