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
exports.getCollegeById = void 0;
exports.saveAllAccounts = saveAllAccounts;
exports.getPermissionsForRole = getPermissionsForRole;
exports.verifyPassword = verifyPassword;
exports.maskStudentDisplay = maskStudentDisplay;
exports.enrichPublicAccount = enrichPublicAccount;
exports.loadAccounts = loadAccounts;
exports.registerAccount = registerAccount;
exports.updateStudentProfile = updateStudentProfile;
exports.verifyLogin = verifyLogin;
exports.getUserById = getUserById;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const util_1 = require("util");
const orgService_1 = require("./orgService");
Object.defineProperty(exports, "getCollegeById", { enumerable: true, get: function () { return orgService_1.getCollegeById; } });
const paths_1 = require("../../config/paths");
const accountStore_1 = require("../../db/accountStore");
const scryptAsync = (0, util_1.promisify)(crypto_1.default.scrypt);
const resolveDataPath = () => (0, paths_1.resolveDataFile)('accounts.json');
const dataPath = resolveDataPath();
const USE_JSON_ONLY = process.env.PSYQA_USE_JSON_STORAGE === '1';
function readFile() {
    try {
        const raw = fs_1.default.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(raw);
        if (!Array.isArray(data.users))
            return { users: [] };
        return data;
    }
    catch (_a) {
        return { users: [] };
    }
}
function writeFile(data) {
    const dir = path_1.default.dirname(dataPath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    fs_1.default.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}
function persistAccounts(data) {
    if (USE_JSON_ONLY) {
        writeFile(data);
        return;
    }
    (0, accountStore_1.writeAllAccountsToDb)(data.users);
    try {
        writeFile(data);
    }
    catch (_a) {
        /* JSON backup is best-effort */
    }
}
function saveAllAccounts(users) {
    persistAccounts({ users });
}
function readAccountsRaw() {
    if (USE_JSON_ONLY) {
        return readFile();
    }
    const fromDb = (0, accountStore_1.readAllAccountsFromDb)();
    if (fromDb.length > 0) {
        return { users: fromDb };
    }
    return readFile();
}
function mergeJsonOnlyUsers(data) {
    if (USE_JSON_ONLY)
        return data;
    const jsonData = readFile();
    if (jsonData.users.length === 0)
        return data;
    const known = new Set(data.users.map((u) => u.username));
    const merged = [...data.users];
    let added = false;
    for (const u of jsonData.users) {
        if (!known.has(u.username)) {
            merged.push(normalizeAccount(u));
            known.add(u.username);
            added = true;
        }
    }
    return added ? { users: merged } : data;
}
function hashPassword(plain) {
    return __awaiter(this, void 0, void 0, function* () {
        const salt = crypto_1.default.randomBytes(16).toString('hex');
        const buf = (yield scryptAsync(plain, salt, 64));
        return `${salt}:${buf.toString('hex')}`;
    });
}
function getPermissionsForRole(role) {
    if (role === 'admin')
        return ['admin:*'];
    if (role === 'counselor')
        return ['school:read', 'school:write'];
    return ['student:self'];
}
function verifyPassword(plain, stored) {
    return __awaiter(this, void 0, void 0, function* () {
        const [salt, keyHex] = stored.split(':');
        if (!salt || !keyHex)
            return false;
        const buf = (yield scryptAsync(plain, salt, 64));
        const key = Buffer.from(keyHex, 'hex');
        if (key.length !== buf.length)
            return false;
        return crypto_1.default.timingSafeEqual(key, buf);
    });
}
const normalizeUsername = (u) => u.trim().toLowerCase();
function isValidUsername(username) {
    const t = username.trim();
    if (t.length < 3 || t.length > 24)
        return false;
    return /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(t);
}
function isValidPassword(password) {
    return password.length >= 6 && password.length <= 128;
}
function normalizeAccount(record) {
    return Object.assign(Object.assign({}, record), { role: record.role || 'student', orgId: record.orgId || 'cs-demo' });
}
function maskStudentDisplay(displayName, studentNo) {
    if (displayName && displayName.length >= 2) {
        return `${displayName[0]}**`;
    }
    if (studentNo && studentNo.length >= 4) {
        return `${studentNo.slice(0, 2)}****`;
    }
    return '学生**';
}
function enrichPublicAccount(record) {
    const org = (0, orgService_1.resolveOrgDisplay)(record.orgId);
    return Object.assign(Object.assign({}, record), { orgName: org.collegeName, schoolName: org.schoolName, permissions: getPermissionsForRole(record.role) });
}
function ensureSeedUsers(data) {
    return __awaiter(this, void 0, void 0, function* () {
        let changed = false;
        const nextUsers = data.users.map((u) => {
            const normalized = normalizeAccount(u);
            if (normalized.role !== u.role || normalized.orgId !== u.orgId)
                changed = true;
            return normalized;
        });
        const ensure = (username, password, fields) => __awaiter(this, void 0, void 0, function* () {
            const u = normalizeUsername(username);
            const existing = nextUsers.find((x) => x.username === u);
            if (existing)
                return;
            nextUsers.push(Object.assign(Object.assign({}, fields), { username: u, passwordHash: yield hashPassword(password), createdAt: new Date().toISOString() }));
            changed = true;
        });
        yield ensure('demo', 'demo123', {
            id: 'acc_demo',
            displayName: '演示学生',
            avatar: '👤',
            role: 'student',
            orgId: 'cs-demo',
            studentNo: '20240001'
        });
        yield ensure('counselor', 'counselor123', {
            id: 'acc_counselor',
            displayName: '张老师',
            avatar: '🧑‍🏫',
            role: 'counselor',
            orgId: 'cs-demo',
            managedOrgIds: ['cs-demo']
        });
        yield ensure('admin', 'admin123', {
            id: 'acc_admin',
            displayName: '系统管理员',
            avatar: '🛡️',
            role: 'admin',
            orgId: 'cs-demo',
            managedOrgIds: ['cs-demo']
        });
        return {
            data: { users: nextUsers },
            changed: changed || nextUsers.length !== data.users.length
        };
    });
}
function loadAccounts() {
    return __awaiter(this, void 0, void 0, function* () {
        const dbWasEmpty = !USE_JSON_ONLY && (0, accountStore_1.readAllAccountsFromDb)().length === 0;
        let data = readAccountsRaw();
        const beforeMerge = data.users.length;
        data = mergeJsonOnlyUsers(data);
        const merged = data.users.length !== beforeMerge;
        const seeded = yield ensureSeedUsers(data);
        data = seeded.data;
        if (dbWasEmpty && data.users.length > 0) {
            persistAccounts(data);
        }
        else if (merged || seeded.changed) {
            persistAccounts(data);
        }
        return data;
    });
}
function registerAccount(username, password, displayName) {
    return __awaiter(this, void 0, void 0, function* () {
        const u = normalizeUsername(username);
        if (!isValidUsername(u)) {
            return { ok: false, error: '用户名需 3～24 位，仅含字母、数字、下划线或中文' };
        }
        if (!isValidPassword(password)) {
            return { ok: false, error: '密码长度为 6～128 个字符' };
        }
        let data = yield loadAccounts();
        if (data.users.some((x) => x.username === u)) {
            return { ok: false, error: '该用户名已被注册' };
        }
        const id = `acc_${crypto_1.default.randomBytes(8).toString('hex')}`;
        const name = (displayName || username).trim().slice(0, 32) || username;
        const record = normalizeAccount({
            id,
            username: u,
            passwordHash: yield hashPassword(password),
            displayName: name,
            avatar: '🙂',
            role: 'student',
            orgId: 'cs-demo',
            createdAt: new Date().toISOString()
        });
        data.users.push(record);
        persistAccounts(data);
        const { passwordHash } = record, rest = __rest(record, ["passwordHash"]);
        return { ok: true, user: enrichPublicAccount(rest) };
    });
}
function updateStudentProfile(userId, updates) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield loadAccounts();
        const idx = data.users.findIndex((x) => x.id === userId);
        if (idx < 0)
            return { ok: false, error: '账号不存在' };
        const record = data.users[idx];
        if (record.role !== 'student') {
            return { ok: false, error: '仅学生可修改个人资料' };
        }
        if (updates.displayName !== undefined) {
            const name = updates.displayName.trim();
            if (name.length < 1 || name.length > 32) {
                return { ok: false, error: '昵称 1–32 字' };
            }
            record.displayName = name;
        }
        if (updates.avatar !== undefined) {
            const avatar = updates.avatar.trim();
            if (avatar.length < 1 || avatar.length > 8) {
                return { ok: false, error: '头像无效' };
            }
            record.avatar = avatar;
        }
        if (updates.orgId !== undefined) {
            const orgId = updates.orgId.trim();
            if (orgId && !(0, orgService_1.getCollegeById)(orgId)) {
                return { ok: false, error: '院系无效' };
            }
            record.orgId = orgId || record.orgId;
        }
        if (updates.className !== undefined) {
            record.className = updates.className.trim() || undefined;
        }
        if (updates.studentNo !== undefined) {
            record.studentNo = updates.studentNo.trim() || undefined;
        }
        if (updates.realName !== undefined) {
            record.realName = updates.realName.trim() || undefined;
        }
        if (updates.gender !== undefined) {
            record.gender = updates.gender.trim() || undefined;
        }
        if (updates.allowSchoolTranscriptView !== undefined) {
            record.allowSchoolTranscriptView = updates.allowSchoolTranscriptView;
        }
        data.users[idx] = record;
        persistAccounts(data);
        const { passwordHash } = record, rest = __rest(record, ["passwordHash"]);
        return { ok: true, user: enrichPublicAccount(rest) };
    });
}
function verifyLogin(username, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const u = normalizeUsername(username);
        const data = yield loadAccounts();
        const found = data.users.find((x) => x.username === u);
        if (!found) {
            return { ok: false, error: '用户名或密码错误' };
        }
        const match = yield verifyPassword(password, found.passwordHash);
        if (!match) {
            return { ok: false, error: '用户名或密码错误' };
        }
        const _a = normalizeAccount(found), { passwordHash } = _a, rest = __rest(_a, ["passwordHash"]);
        return { ok: true, user: enrichPublicAccount(rest) };
    });
}
function getUserById(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = yield loadAccounts();
        const found = data.users.find((x) => x.id === userId);
        if (!found) {
            return null;
        }
        const _a = normalizeAccount(found), { passwordHash } = _a, rest = __rest(_a, ["passwordHash"]);
        return enrichPublicAccount(rest);
    });
}
