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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readJsonFile = readJsonFile;
exports.writeJsonFile = writeJsonFile;
exports.readJsonFileSync = readJsonFileSync;
exports.writeJsonFileSync = writeJsonFileSync;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const locks = new Map();
function acquireLock(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const key = path_1.default.resolve(filePath);
        const prev = (_a = locks.get(key)) !== null && _a !== void 0 ? _a : Promise.resolve();
        let release;
        const next = new Promise((resolve) => {
            release = resolve;
        });
        locks.set(key, prev.then(() => next));
        yield prev;
        return () => {
            release();
            if (locks.get(key) === next) {
                locks.delete(key);
            }
        };
    });
}
function readJsonFile(filePath, fallback) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield acquireLock(filePath);
        try {
            if (!fs_1.default.existsSync(filePath)) {
                return fallback;
            }
            const raw = fs_1.default.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
        catch (_a) {
            return fallback;
        }
        finally {
            release();
        }
    });
}
function writeJsonFile(filePath, data) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield acquireLock(filePath);
        try {
            const dir = path_1.default.dirname(filePath);
            fs_1.default.mkdirSync(dir, { recursive: true });
            const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
            fs_1.default.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
            fs_1.default.renameSync(tmp, filePath);
        }
        finally {
            release();
        }
    });
}
function readJsonFileSync(filePath, fallback) {
    try {
        if (!fs_1.default.existsSync(filePath))
            return fallback;
        return JSON.parse(fs_1.default.readFileSync(filePath, 'utf8'));
    }
    catch (_a) {
        return fallback;
    }
}
function writeJsonFileSync(filePath, data) {
    const dir = path_1.default.dirname(filePath);
    fs_1.default.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs_1.default.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs_1.default.renameSync(tmp, filePath);
}
