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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findShowByTitle = exports.toggleSubtask = exports.deleteTaskFromShow = exports.updateTaskInShow = exports.addTasksToShow = exports.addTaskToShow = exports.deleteShow = exports.updateShow = exports.addShow = exports.createShow = exports.getShowById = exports.getShows = void 0;
var supabase_1 = require("../supabase");
// Helpers
var getUserIdOrThrow = function () { return __awaiter(void 0, void 0, void 0, function () {
    var _a, data, error, userId;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, supabase_1.supabase.auth.getUser()];
            case 1:
                _a = _c.sent(), data = _a.data, error = _a.error;
                if (error)
                    throw error;
                userId = (_b = data === null || data === void 0 ? void 0 : data.user) === null || _b === void 0 ? void 0 : _b.id;
                if (!userId)
                    throw new Error('Not authenticated');
                return [2 /*return*/, userId];
        }
    });
}); };
var toIsoOrNull = function (value) {
    if (value === undefined || value === null || value === '')
        return null;
    var d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
// Normalize timestamps coming back from Supabase.
// Some rows use `created_at`/`updated_at` ISO strings, while the UI expects `createdAt`/`updatedAt` numbers.
var toTsOrNow = function (value) {
    if (value === undefined || value === null || value === '')
        return Date.now();
    if (typeof value === 'number')
        return value;
    var d = new Date(value);
    var ts = d.getTime();
    return Number.isNaN(ts) ? Date.now() : ts;
};
var toTsOrNull = function (value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'number')
        return value;
    var d = new Date(value);
    var ts = d.getTime();
    return Number.isNaN(ts) ? undefined : ts;
};
// Ensure subtasks is always an array (older rows/environments might return null, object, or stringified JSON).
var normalizeSubtasks = function (value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    if (typeof value === 'string') {
        try {
            var parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch (_a) {
            return [];
        }
    }
    return [];
};
// Normalize priority values coming from UI/DB to the canonical set used by the app.
// Protects against older data like "high"/"LOW" or labels like "High Priority".
var normalizePriority = function (value) {
    var raw = String(value !== null && value !== void 0 ? value : '').trim();
    if (!raw)
        return 'Medium';
    var lowered = raw.toLowerCase();
    if (lowered.startsWith('high'))
        return 'High';
    if (lowered.startsWith('low'))
        return 'Low';
    if (lowered.startsWith('med'))
        return 'Medium';
    // fallback (keeps UI stable)
    return 'Medium';
};
// Read priority from whichever column exists (schema drift safe)
var getPriorityFromRow = function (t) {
    var _a, _b;
    return normalizePriority((_b = (_a = t === null || t === void 0 ? void 0 : t.priority) !== null && _a !== void 0 ? _a : t === null || t === void 0 ? void 0 : t.taskPriority) !== null && _b !== void 0 ? _b : t === null || t === void 0 ? void 0 : t.priorityLevel);
};
var mapTaskToDb = function (showId, userId, task) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    // Support a few possible field names that exist in your app over time.
    var title = (_b = (_a = task.title) !== null && _a !== void 0 ? _a : task.taskTitle) !== null && _b !== void 0 ? _b : '';
    var notes = (_f = (_e = (_d = (_c = task.notes) !== null && _c !== void 0 ? _c : task.patter) !== null && _d !== void 0 ? _d : task.notesPatter) !== null && _e !== void 0 ? _e : task.notes_patter) !== null && _f !== void 0 ? _f : '';
    // Priority sometimes arrives in different shapes (older UI fields, differing casing).
    // Normalize to the canonical values used by the board filters.
    var priority = normalizePriority((_h = (_g = task.priority) !== null && _g !== void 0 ? _g : task.taskPriority) !== null && _h !== void 0 ? _h : task.priorityLevel);
    var dueDate = (_k = (_j = task.dueDate) !== null && _j !== void 0 ? _j : task.due_date) !== null && _k !== void 0 ? _k : null;
    var musicCue = (_m = (_l = task.musicCue) !== null && _l !== void 0 ? _l : task.music_cue) !== null && _m !== void 0 ? _m : '';
    // The planner UI expects 'To-Do' or 'Completed'. Default to 'To-Do' so new tasks appear immediately.
    var status = (_o = task.status) !== null && _o !== void 0 ? _o : 'To-Do';
    var subtasks = (_p = task.subtasks) !== null && _p !== void 0 ? _p : [];
    var durationMinutes = (_r = (_q = task.durationMinutes) !== null && _q !== void 0 ? _q : task.duration_minutes) !== null && _r !== void 0 ? _r : null;
    var resetMinutes = (_t = (_s = task.resetMinutes) !== null && _s !== void 0 ? _s : task.reset_minutes) !== null && _t !== void 0 ? _t : null;
    var energyLevel = (_v = (_u = task.energyLevel) !== null && _u !== void 0 ? _u : task.energy_level) !== null && _v !== void 0 ? _v : null;
    var participationLevel = (_x = (_w = task.participationLevel) !== null && _w !== void 0 ? _w : task.participation_level) !== null && _x !== void 0 ? _x : null;
    // Build payload cautiously: some deployments may not have newer columns (e.g., subtasks, music_cue)
    // and Supabase will throw schema-cache errors. We'll retry inserts/updates with reduced payloads.
    var payload = __assign(__assign(__assign(__assign(__assign({ show_id: showId, user_id: userId, title: title, notes: notes, priority: priority, due_date: toIsoOrNull(dueDate), music_cue: musicCue || null, status: status }, (Array.isArray(subtasks) && subtasks.length ? { subtasks: subtasks } : {})), (durationMinutes !== null && durationMinutes !== undefined ? { duration_minutes: Number(durationMinutes) } : {})), (resetMinutes !== null && resetMinutes !== undefined ? { reset_minutes: Number(resetMinutes) } : {})), (energyLevel ? { energy_level: String(energyLevel) } : {})), (participationLevel ? { participation_level: String(participationLevel) } : {}));
    return payload;
};
// If a column doesn't exist in the current Supabase schema cache, retry without it.
// Protects against schema drift (e.g., some envs missing "subtasks" or "music_cue").
var safeInsert = function (table, payload) { return __awaiter(void 0, void 0, void 0, function () {
    var current, _loop_1, i, state_1;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                current = Array.isArray(payload) ? payload.map(function (p) { return (__assign({}, p)); }) : __assign({}, payload);
                _loop_1 = function (i) {
                    var error, msg, m, missingCol, missingTable, removed_1;
                    return __generator(this, function (_d) {
                        switch (_d.label) {
                            case 0: return [4 /*yield*/, supabase_1.supabase.from(table).insert(current)];
                            case 1:
                                error = (_d.sent()).error;
                                if (!error)
                                    return [2 /*return*/, { value: void 0 }];
                                msg = String((_b = (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : error) !== null && _b !== void 0 ? _b : '');
                                m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
                                missingCol = m === null || m === void 0 ? void 0 : m[1];
                                missingTable = m === null || m === void 0 ? void 0 : m[2];
                                if (missingCol && (!missingTable || missingTable === table)) {
                                    if (Array.isArray(current)) {
                                        removed_1 = false;
                                        current = current.map(function (row) {
                                            if (row && Object.prototype.hasOwnProperty.call(row, missingCol)) {
                                                var next = __assign({}, row);
                                                delete next[missingCol];
                                                removed_1 = true;
                                                return next;
                                            }
                                            return row;
                                        });
                                        if (removed_1)
                                            return [2 /*return*/, "continue"];
                                    }
                                    else if (Object.prototype.hasOwnProperty.call(current, missingCol)) {
                                        delete current[missingCol];
                                        return [2 /*return*/, "continue"];
                                    }
                                }
                                throw error;
                        }
                    });
                };
                i = 0;
                _c.label = 1;
            case 1:
                if (!(i < 6)) return [3 /*break*/, 4];
                return [5 /*yield**/, _loop_1(i)];
            case 2:
                state_1 = _c.sent();
                if (typeof state_1 === "object")
                    return [2 /*return*/, state_1.value];
                _c.label = 3;
            case 3:
                i++;
                return [3 /*break*/, 1];
            case 4: throw new Error("Insert into ".concat(table, " failed after retries (schema drift)."));
        }
    });
}); };
var safeUpdate = function (table, payload, match) { return __awaiter(void 0, void 0, void 0, function () {
    var current, _loop_2, i, state_2;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                current = __assign({}, payload);
                _loop_2 = function (i) {
                    var q, _i, _d, _e, k, v, error, msg, m, missingCol, missingTable, removed_2;
                    return __generator(this, function (_f) {
                        switch (_f.label) {
                            case 0:
                                q = supabase_1.supabase.from(table).update(current);
                                for (_i = 0, _d = Object.entries(match); _i < _d.length; _i++) {
                                    _e = _d[_i], k = _e[0], v = _e[1];
                                    q = q.eq(k, v);
                                }
                                return [4 /*yield*/, q];
                            case 1:
                                error = (_f.sent()).error;
                                if (!error)
                                    return [2 /*return*/, { value: void 0 }];
                                msg = String((_b = (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : error) !== null && _b !== void 0 ? _b : '');
                                m = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
                                missingCol = m === null || m === void 0 ? void 0 : m[1];
                                missingTable = m === null || m === void 0 ? void 0 : m[2];
                                if (missingCol && (!missingTable || missingTable === table)) {
                                    if (Array.isArray(current)) {
                                        removed_2 = false;
                                        current = current.map(function (row) {
                                            if (row && Object.prototype.hasOwnProperty.call(row, missingCol)) {
                                                var _a = row, _b = missingCol, _omit = _a[_b], rest = __rest(_a, [typeof _b === "symbol" ? _b : _b + ""]);
                                                removed_2 = true;
                                                return rest;
                                            }
                                            return row;
                                        });
                                        if (removed_2)
                                            return [2 /*return*/, "continue"];
                                    }
                                    else if (Object.prototype.hasOwnProperty.call(current, missingCol)) {
                                        delete current[missingCol];
                                        return [2 /*return*/, "continue"];
                                    }
                                }
                                throw error;
                        }
                    });
                };
                i = 0;
                _c.label = 1;
            case 1:
                if (!(i < 6)) return [3 /*break*/, 4];
                return [5 /*yield**/, _loop_2(i)];
            case 2:
                state_2 = _c.sent();
                if (typeof state_2 === "object")
                    return [2 /*return*/, state_2.value];
                _c.label = 3;
            case 3:
                i++;
                return [3 /*break*/, 1];
            case 4: throw new Error("Update ".concat(table, " failed after retries (schema drift)."));
        }
    });
}); };
var getShows = function () { return __awaiter(void 0, void 0, void 0, function () {
    var userId, _a, data, error;
    var _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _c.sent();
                return [4 /*yield*/, supabase_1.supabase
                        .from('shows')
                        .select("\n      *,\n      tasks (*)\n    ")
                        .eq('user_id', userId)
                        .order('created_at', { ascending: false })
                        .order('created_at', { foreignTable: 'tasks', ascending: true })];
            case 2:
                _a = _c.sent(), data = _a.data, error = _a.error;
                if (error)
                    throw error;
                // Normalize task/show fields to keep UI stable across schema drift and older rows.
                // The UI expects camelCase timestamps and arrays (e.g., subtasks), while Supabase returns snake_case/ISO.
                return [2 /*return*/, ((_b = data) !== null && _b !== void 0 ? _b : []).map(function (show) {
                        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
                        var normalizedTasks = Array.isArray(show.tasks)
                            ? show.tasks.map(function (t) {
                                var _a, _b, _c, _d, _e;
                                var createdAt = toTsOrNow((_a = t.createdAt) !== null && _a !== void 0 ? _a : t.created_at);
                                var dueDate = toTsOrNull((_b = t.dueDate) !== null && _b !== void 0 ? _b : t.due_date);
                                return __assign(__assign({}, t), { 
                                    // Canonicalize priority/status used by board filters
                                    priority: getPriorityFromRow(t), status: (_c = t.status) !== null && _c !== void 0 ? _c : 'To-Do', 
                                    // Canonicalize timestamps expected by UI
                                    createdAt: createdAt, dueDate: dueDate, 
                                    // Canonicalize optional fields
                                    musicCue: (_e = (_d = t.musicCue) !== null && _d !== void 0 ? _d : t.music_cue) !== null && _e !== void 0 ? _e : undefined, subtasks: normalizeSubtasks(t.subtasks) });
                            })
                            : [];
                        return __assign(__assign({}, show), { 
                            // Canonicalize timestamps expected by UI
                            createdAt: toTsOrNow((_a = show.createdAt) !== null && _a !== void 0 ? _a : show.created_at), updatedAt: toTsOrNow((_b = show.updatedAt) !== null && _b !== void 0 ? _b : show.updated_at), venue: (_e = (_d = (_c = show.venue) !== null && _c !== void 0 ? _c : show.location) !== null && _d !== void 0 ? _d : show.show_venue) !== null && _e !== void 0 ? _e : undefined, status: (_g = (_f = show.status) !== null && _f !== void 0 ? _f : show.show_status) !== null && _g !== void 0 ? _g : undefined, performanceDate: toTsOrNull((_j = (_h = show.performanceDate) !== null && _h !== void 0 ? _h : show.performance_date) !== null && _j !== void 0 ? _j : show.show_date), rehearsals: (_l = (_k = show.rehearsals) !== null && _k !== void 0 ? _k : show.rehearsal_sessions) !== null && _l !== void 0 ? _l : undefined, clientId: (_m = show.clientId) !== null && _m !== void 0 ? _m : show.client_id, tasks: normalizedTasks });
                    })];
        }
    });
}); };
exports.getShows = getShows;
var getShowById = function (id) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, _a, data, error;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _b.sent();
                return [4 /*yield*/, supabase_1.supabase
                        .from('shows')
                        .select("\n      *,\n      tasks (*)\n    ")
                        .eq('id', id)
                        .eq('user_id', userId)
                        .single()];
            case 2:
                _a = _b.sent(), data = _a.data, error = _a.error;
                if (error)
                    throw error;
                return [2 /*return*/, data];
        }
    });
}); };
exports.getShowById = getShowById;
var createShow = function (title, description, clientId) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, payloadBase, payload, _a, data, error, msg;
    var _b;
    var _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _e.sent();
                payloadBase = {
                    user_id: userId,
                    title: String(title !== null && title !== void 0 ? title : '').trim(),
                    description: description !== null && description !== void 0 ? description : null,
                    // Keep finances in a single JSON object (safe for current schema)
                    finances: {
                        performanceFee: 0,
                        expenses: [],
                        income: []
                    },
                    updated_at: new Date().toISOString()
                };
                if (!payloadBase.title)
                    throw new Error('Show title required');
                payload = __assign(__assign({}, payloadBase), (clientId ? { client_id: clientId } : {}));
                return [4 /*yield*/, supabase_1.supabase.from('shows').insert(payload).select('*').single()];
            case 2:
                _a = _e.sent(), data = _a.data, error = _a.error;
                if (!error) return [3 /*break*/, 4];
                msg = String((_d = (_c = error === null || error === void 0 ? void 0 : error.message) !== null && _c !== void 0 ? _c : error) !== null && _d !== void 0 ? _d : '');
                if (!(clientId && /Could not find the 'client_id' column of 'shows' in the schema cache/i.test(msg))) return [3 /*break*/, 4];
                return [4 /*yield*/, supabase_1.supabase.from('shows').insert(payloadBase).select('*').single()];
            case 3:
                (_b = _e.sent(), data = _b.data, error = _b.error);
                _e.label = 4;
            case 4:
                if (error)
                    throw error;
                return [2 /*return*/, data];
        }
    });
}); };
exports.createShow = createShow;
var addShow = function (show) { return __awaiter(void 0, void 0, void 0, function () {
    var title, description, clientId;
    var _a, _b, _c, _d, _e, _f;
    return __generator(this, function (_g) {
        switch (_g.label) {
            case 0:
                title = (_b = (_a = show.title) !== null && _a !== void 0 ? _a : show.showTitle) !== null && _b !== void 0 ? _b : '';
                description = (_d = (_c = show.description) !== null && _c !== void 0 ? _c : show.show_description) !== null && _d !== void 0 ? _d : null;
                clientId = (_f = (_e = show.clientId) !== null && _e !== void 0 ? _e : show.client_id) !== null && _f !== void 0 ? _f : null;
                return [4 /*yield*/, (0, exports.createShow)(String(title !== null && title !== void 0 ? title : ''), description, clientId)];
            case 1:
                _g.sent();
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.addShow = addShow;
var updateShow = function (id, updates) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, payload;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _a.sent();
                payload = __assign(__assign({}, updates), { updated_at: new Date().toISOString() });
                // Prevent accidentally writing tasks array into shows row (tasks live in tasks table)
                delete payload.tasks;
                // Use schema-drift safe update so optional/newer columns (like `contract`) don't break builds
                // across environments that haven't applied the latest DB migrations yet.
                return [4 /*yield*/, safeUpdate('shows', payload, { id: id, user_id: userId })];
            case 2:
                // Use schema-drift safe update so optional/newer columns (like `contract`) don't break builds
                // across environments that haven't applied the latest DB migrations yet.
                _a.sent();
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.updateShow = updateShow;
var deleteShow = function (id) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _a.sent();
                // Delete tasks first (in case FK cascade is not enabled)
                return [4 /*yield*/, supabase_1.supabase.from('tasks').delete().eq('show_id', id).eq('user_id', userId)];
            case 2:
                // Delete tasks first (in case FK cascade is not enabled)
                _a.sent();
                return [4 /*yield*/, supabase_1.supabase.from('shows').delete().eq('id', id).eq('user_id', userId)];
            case 3:
                error = (_a.sent()).error;
                if (error)
                    throw error;
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.deleteShow = deleteShow;
var addTaskToShow = function (showId, task) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, payload;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _a.sent();
                payload = mapTaskToDb(showId, userId, task);
                if (!payload.title || !String(payload.title).trim()) {
                    throw new Error('Task title required');
                }
                return [4 /*yield*/, safeInsert('tasks', payload)];
            case 2:
                _a.sent();
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.addTaskToShow = addTaskToShow;
var addTasksToShow = function (showId, tasks) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, payloads, error, msg, _i, payloads_1, p;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _c.sent();
                payloads = tasks
                    .map(function (t) { return mapTaskToDb(showId, userId, t); })
                    .filter(function (p) { return p.title && String(p.title).trim(); });
                if (payloads.length === 0)
                    return [2 /*return*/, (0, exports.getShows)()];
                return [4 /*yield*/, supabase_1.supabase.from('tasks').insert(payloads)];
            case 2:
                error = (_c.sent()).error;
                if (!error) return [3 /*break*/, 8];
                msg = String((_b = (_a = error === null || error === void 0 ? void 0 : error.message) !== null && _a !== void 0 ? _a : error) !== null && _b !== void 0 ? _b : '');
                if (!/Could not find the '.+?' column of 'tasks' in the schema cache/i.test(msg)) return [3 /*break*/, 7];
                _i = 0, payloads_1 = payloads;
                _c.label = 3;
            case 3:
                if (!(_i < payloads_1.length)) return [3 /*break*/, 6];
                p = payloads_1[_i];
                return [4 /*yield*/, safeInsert('tasks', p)];
            case 4:
                _c.sent();
                _c.label = 5;
            case 5:
                _i++;
                return [3 /*break*/, 3];
            case 6: return [3 /*break*/, 8];
            case 7: throw error;
            case 8: return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.addTasksToShow = addTasksToShow;
var updateTaskInShow = function (showId, taskId, updates) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, dbUpdates, p, p, p;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _a.sent();
                dbUpdates = {};
                if (updates.title !== undefined)
                    dbUpdates.title = updates.title;
                if (updates.notes !== undefined)
                    dbUpdates.notes = updates.notes;
                if (updates.patter !== undefined)
                    dbUpdates.notes = updates.patter;
                if (updates.priority !== undefined) {
                    p = normalizePriority(updates.priority);
                    dbUpdates.priority = p;
                }
                if (updates.taskPriority !== undefined) {
                    p = normalizePriority(updates.taskPriority);
                    dbUpdates.priority = p;
                }
                if (updates.priorityLevel !== undefined) {
                    p = normalizePriority(updates.priorityLevel);
                    dbUpdates.priority = p;
                }
                if (updates.musicCue !== undefined)
                    dbUpdates.music_cue = updates.musicCue;
                if (updates.status !== undefined)
                    dbUpdates.status = updates.status;
                if (updates.subtasks !== undefined)
                    dbUpdates.subtasks = updates.subtasks;
                if (updates.dueDate !== undefined) {
                    dbUpdates.due_date = toIsoOrNull(updates.dueDate);
                }
                if (updates.due_date !== undefined) {
                    dbUpdates.due_date = toIsoOrNull(updates.due_date);
                }
                return [4 /*yield*/, safeUpdate('tasks', dbUpdates, { id: taskId, show_id: showId, user_id: userId })];
            case 2:
                _a.sent();
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.updateTaskInShow = updateTaskInShow;
var deleteTaskFromShow = function (showId, taskId) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, error;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _a.sent();
                return [4 /*yield*/, supabase_1.supabase.from('tasks').delete().eq('id', taskId).eq('show_id', showId).eq('user_id', userId)];
            case 2:
                error = (_a.sent()).error;
                if (error)
                    throw error;
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.deleteTaskFromShow = deleteTaskFromShow;
var toggleSubtask = function (showId, taskId, subtaskId) { return __awaiter(void 0, void 0, void 0, function () {
    var userId, _a, data, error, subtasks, updated, updErr;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, getUserIdOrThrow()];
            case 1:
                userId = _b.sent();
                return [4 /*yield*/, supabase_1.supabase
                        .from('tasks')
                        .select('subtasks')
                        .eq('id', taskId)
                        .eq('show_id', showId)
                        .eq('user_id', userId)
                        .single()];
            case 2:
                _a = _b.sent(), data = _a.data, error = _a.error;
                if (error)
                    throw error;
                subtasks = Array.isArray(data === null || data === void 0 ? void 0 : data.subtasks) ? data.subtasks : [];
                updated = subtasks.map(function (st) { return (st.id === subtaskId ? __assign(__assign({}, st), { completed: !st.completed }) : st); });
                return [4 /*yield*/, supabase_1.supabase
                        .from('tasks')
                        .update({ subtasks: updated })
                        .eq('id', taskId)
                        .eq('show_id', showId)
                        .eq('user_id', userId)];
            case 3:
                updErr = (_b.sent()).error;
                if (updErr)
                    throw updErr;
                return [2 /*return*/, (0, exports.getShows)()];
        }
    });
}); };
exports.toggleSubtask = toggleSubtask;
// Convenience helper used by a few UX flows (e.g., SaveActionBar “Add to Show” shortcuts)
// to find an existing show by title without requiring callers to re-fetch + filter.
var findShowByTitle = function (title) { return __awaiter(void 0, void 0, void 0, function () {
    var needle, shows;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                needle = String(title !== null && title !== void 0 ? title : '').trim().toLowerCase();
                if (!needle)
                    return [2 /*return*/, undefined];
                return [4 /*yield*/, (0, exports.getShows)()];
            case 1:
                shows = _a.sent();
                return [2 /*return*/, shows.find(function (s) { var _a; return String((_a = s === null || s === void 0 ? void 0 : s.title) !== null && _a !== void 0 ? _a : '').trim().toLowerCase() === needle; })];
        }
    });
}); };
exports.findShowByTitle = findShowByTitle;
