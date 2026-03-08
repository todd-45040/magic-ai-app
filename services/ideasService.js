"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSavedIdeas = getSavedIdeas;
exports.getRehearsalSessions = getRehearsalSessions;
exports.saveIdea = saveIdea;
exports.updateIdea = updateIdea;
exports.deleteIdea = deleteIdea;
var supabase_1 = require("../supabase");
function mapRowToIdea(row) {
    var _a;
    var ts = row.created_at ? Date.parse(row.created_at) : Date.now();
    return {
        id: row.id,
        type: row.type,
        title: (_a = row.title) !== null && _a !== void 0 ? _a : undefined,
        content: row.content,
        // DB schema enforces tags NOT NULL (default '{}'), but older rows or stale
        // schema cache can still yield null. Normalize to an array for safety.
        tags: Array.isArray(row.tags) ? row.tags : [],
        timestamp: Number.isFinite(ts) ? ts : Date.now(),
    };
}
/**
 * ideasService.ts
 *
 * Supabase table: public.ideas
 * Expected columns (minimum):
 *   - id (uuid/text PK)
 *   - user_id (uuid/text, references auth.users)
 *   - type (text)              // e.g., 'text' | 'image' | 'rehearsal'
 *   - content (text)
 *   - created_at (timestamptz, default now())
 *
 * Optional (recommended):
 *   - tags (text[], default '{}')
 */
function requireUserId() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, data, error, uid;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, supabase_1.supabase.auth.getUser()];
                case 1:
                    _a = _c.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    uid = (_b = data === null || data === void 0 ? void 0 : data.user) === null || _b === void 0 ? void 0 : _b.id;
                    if (!uid)
                        throw new Error('Not authenticated.');
                    return [2 /*return*/, uid];
            }
        });
    });
}
function getSavedIdeas() {
    return __awaiter(this, void 0, void 0, function () {
        var uid, _a, data, error;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, requireUserId()];
                case 1:
                    uid = _b.sent();
                    return [4 /*yield*/, supabase_1.supabase
                            .from('ideas')
                            .select('*')
                            .eq('user_id', uid)
                            .order('created_at', { ascending: false })];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, (data !== null && data !== void 0 ? data : []).map(function (r) { return mapRowToIdea(r); })];
            }
        });
    });
}
/**
 * Fetch only rehearsal sessions (stored as ideas with type='rehearsal').
 * Used by Live Rehearsal History UI.
 */
function getRehearsalSessions() {
    return __awaiter(this, arguments, void 0, function (limit) {
        var uid, _a, data, error;
        if (limit === void 0) { limit = 25; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, requireUserId()];
                case 1:
                    uid = _b.sent();
                    return [4 /*yield*/, supabase_1.supabase
                            .from('ideas')
                            .select('*')
                            .eq('user_id', uid)
                            .eq('type', 'rehearsal')
                            .order('created_at', { ascending: false })
                            .limit(limit)];
                case 2:
                    _a = _b.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, (data !== null && data !== void 0 ? data : []).map(function (r) { return mapRowToIdea(r); })];
            }
        });
    });
}
function saveIdea(a, b, c, d) {
    return __awaiter(this, void 0, void 0, function () {
        var uid, payload, _a, data, error;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0: return [4 /*yield*/, requireUserId()];
                case 1:
                    uid = _c.sent();
                    payload = typeof a === 'string'
                        ? { type: a, content: b !== null && b !== void 0 ? b : '', title: c, tags: d }
                        : a;
                    return [4 /*yield*/, supabase_1.supabase
                            .from('ideas')
                            .insert({
                            user_id: uid,
                            type: payload.type,
                            content: payload.content,
                            title: (_b = payload.title) !== null && _b !== void 0 ? _b : null,
                            // DB constraint: tags is NOT NULL. Always send an array.
                            tags: Array.isArray(payload.tags) ? payload.tags : [],
                        })
                            .select('*')
                            .single()];
                case 2:
                    _a = _c.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, mapRowToIdea(data)];
            }
        });
    });
}
/**
 * Update a single idea row and return the updated row.
 * IMPORTANT: This throws on Supabase errors (including RLS denial).
 */
function updateIdea(id, updates) {
    return __awaiter(this, void 0, void 0, function () {
        var dbUpdates, _a, data, error;
        var _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!id)
                        throw new Error('updateIdea: missing id');
                    return [4 /*yield*/, requireUserId()];
                case 1:
                    _c.sent();
                    dbUpdates = {};
                    if (typeof updates.type !== 'undefined')
                        dbUpdates.type = updates.type;
                    if (typeof updates.title !== 'undefined')
                        dbUpdates.title = (_b = updates.title) !== null && _b !== void 0 ? _b : null;
                    if (typeof updates.content !== 'undefined')
                        dbUpdates.content = updates.content;
                    if (typeof updates.tags !== 'undefined') {
                        dbUpdates.tags = Array.isArray(updates.tags) ? updates.tags : [];
                    }
                    return [4 /*yield*/, supabase_1.supabase
                            .from('ideas')
                            .update(dbUpdates)
                            .eq('id', id)
                            .select('*')
                            .single()];
                case 2:
                    _a = _c.sent(), data = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    return [2 /*return*/, mapRowToIdea(data)];
            }
        });
    });
}
function deleteIdea(id) {
    return __awaiter(this, void 0, void 0, function () {
        var error;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!id)
                        throw new Error('deleteIdea: missing id');
                    return [4 /*yield*/, requireUserId()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, supabase_1.supabase.from('ideas').delete().eq('id', id)];
                case 2:
                    error = (_a.sent()).error;
                    if (error)
                        throw error;
                    return [2 /*return*/];
            }
        });
    });
}
