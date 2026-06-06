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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listUsersForAdmin = listUsersForAdmin;
exports.createUserByAdmin = createUserByAdmin;
exports.updateUserByAdmin = updateUserByAdmin;
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("util");
const accountService_1 = require("./accountService");
const scryptAsync = (0, util_1.promisify)(crypto_1.default.scrypt);
function hashPassword(plain) {
    return __awaiter(this, void 0, void 0, function* () {
        const salt = crypto_1.default.randomBytes(16).toString('hex');
        const buf = (yield scryptAsync(plain, salt, 64));
        return `${salt}:${buf.toString('hex')}`;
    });
}
function toListItem(record) {
    const { passwordHash: _ } = record, rest = __rest(record, ["passwordHash"]);
    const pub = (0, accountService_1.enrichPublicAccount)(rest);
    return {
        id: pub.id,
        username: pub.username,
        displayName: pub.displayName,
        avatar: pub.avatar,
        role: pub.role,
        orgId: pub.orgId,
        orgName: pub.orgName,
        className: pub.className,
        studentNo: pub.studentNo,
        realName: pub.realName,
        gender: pub.gender,
        managedOrgIds: pub.managedOrgIds,
        allowSchoolTranscriptView: pub.allowSchoolTranscriptView,
        createdAt: pub.createdAt
    };
}
function listUsersForAdmin() {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield (0, accountService_1.loadAccounts)();
        return data.users.map(toListItem).sort((a, b) => a.username.localeCompare(b.username));
    });
}
function createUserByAdmin(payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const u = payload.username.trim().toLowerCase();
        if (u.length < 3 || u.length > 24) {
            return { ok: false, error: '用户名需 3～24 位' };
        }
        if (payload.password.length < 6) {
            return { ok: false, error: '密码至少 6 位' };
        }
        if (!['student', 'counselor', 'admin'].includes(payload.role)) {
            return { ok: false, error: '无效的角色' };
        }
        const data = yield (0, accountService_1.loadAccounts)();
        if (data.users.some((x) => x.username === u)) {
            return { ok: false, error: '用户名已存在' };
        }
        const orgId = ((_a = payload.orgId) === null || _a === void 0 ? void 0 : _a.trim()) || 'cs-demo';
        if (!(0, accountService_1.getCollegeById)(orgId)) {
            return { ok: false, error: '院系无效' };
        }
        const record = {
            id: `acc_${crypto_1.default.randomBytes(8).toString('hex')}`,
            username: u,
            passwordHash: yield hashPassword(payload.password),
            displayName: (payload.displayName || u).trim().slice(0, 32),
            avatar: payload.role === 'counselor' ? '🧑‍🏫' : payload.role === 'admin' ? '🛡️' : '🎓',
            role: payload.role,
            orgId,
            managedOrgIds: payload.role === 'counselor' || payload.role === 'admin'
                ? ((_b = payload.managedOrgIds) === null || _b === void 0 ? void 0 : _b.length)
                    ? payload.managedOrgIds
                    : [orgId]
                : undefined,
            createdAt: new Date().toISOString()
        };
        data.users.push(record);
        (0, accountService_1.saveAllAccounts)(data.users);
        return { ok: true, user: toListItem(record) };
    });
}
function updateUserByAdmin(adminId, targetId, updates) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const data = yield (0, accountService_1.loadAccounts)();
        const idx = data.users.findIndex((x) => x.id === targetId);
        if (idx < 0)
            return { ok: false, error: '用户不存在' };
        const record = data.users[idx];
        if (updates.role !== undefined) {
            if (!['student', 'counselor', 'admin'].includes(updates.role)) {
                return { ok: false, error: '无效的角色' };
            }
            if (targetId === adminId && updates.role !== 'admin') {
                return { ok: false, error: '不能修改自己的管理员角色' };
            }
            record.role = updates.role;
            if (updates.role === 'counselor' || updates.role === 'admin') {
                record.managedOrgIds = ((_a = updates.managedOrgIds) === null || _a === void 0 ? void 0 : _a.length)
                    ? updates.managedOrgIds
                    : ((_b = record.managedOrgIds) === null || _b === void 0 ? void 0 : _b.length)
                        ? record.managedOrgIds
                        : [record.orgId || 'cs-demo'];
            }
            else {
                record.managedOrgIds = undefined;
            }
        }
        if (updates.managedOrgIds !== undefined && (record.role === 'counselor' || record.role === 'admin')) {
            record.managedOrgIds = updates.managedOrgIds;
        }
        if (updates.orgId !== undefined) {
            const orgId = updates.orgId.trim();
            if (!(0, accountService_1.getCollegeById)(orgId))
                return { ok: false, error: '院系无效' };
            record.orgId = orgId;
        }
        if (updates.displayName !== undefined) {
            const name = updates.displayName.trim();
            if (name.length < 1 || name.length > 20)
                return { ok: false, error: '昵称 1–20 字' };
            record.displayName = name;
        }
        if (updates.className !== undefined)
            record.className = updates.className.trim() || undefined;
        if (updates.studentNo !== undefined)
            record.studentNo = updates.studentNo.trim() || undefined;
        if (updates.allowSchoolTranscriptView !== undefined && record.role === 'student') {
            record.allowSchoolTranscriptView = updates.allowSchoolTranscriptView;
        }
        if (updates.newPassword !== undefined) {
            if (updates.newPassword.length < 6)
                return { ok: false, error: '新密码至少 6 位' };
            record.passwordHash = yield hashPassword(updates.newPassword);
        }
        data.users[idx] = record;
        (0, accountService_1.saveAllAccounts)(data.users);
        return { ok: true, user: toListItem(record) };
    });
}
