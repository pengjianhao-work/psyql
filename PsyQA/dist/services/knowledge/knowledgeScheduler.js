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
exports.readSchedulerState = readSchedulerState;
exports.triggerKnowledgeUpdate = triggerKnowledgeUpdate;
exports.startKnowledgeScheduler = startKnowledgeScheduler;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ragService_1 = require("./ragService");
const vectorDBService_1 = require("./vectorDBService");
const REPO_ROOT = path_1.default.join(__dirname, '..', '..', '..', '..');
const STATE_FILE = path_1.default.join(REPO_ROOT, 'server', 'data', 'knowledge_scheduler_state.json');
const UPDATE_SCRIPT = path_1.default.join(REPO_ROOT, '..', 'scripts', 'monthly_knowledge_update.py');
let running = false;
function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function readSchedulerState() {
    try {
        if (fs_1.default.existsSync(STATE_FILE)) {
            return JSON.parse(fs_1.default.readFileSync(STATE_FILE, 'utf-8'));
        }
    }
    catch (_a) {
        /* ignore */
    }
    return {};
}
function resolvePython() {
    return process.env.PYTHON_PATH || 'python';
}
function runPythonUpdate(force = false) {
    return new Promise((resolve) => {
        var _a, _b;
        const args = [UPDATE_SCRIPT];
        if (force)
            args.push('--force');
        const proc = (0, child_process_1.spawn)(resolvePython(), args, {
            cwd: path_1.default.join(REPO_ROOT, '..'),
            shell: process.platform === 'win32',
            env: process.env
        });
        let output = '';
        (_a = proc.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (d) => {
            output += d.toString();
        });
        (_b = proc.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (d) => {
            output += d.toString();
        });
        proc.on('close', (code) => resolve({ code: code !== null && code !== void 0 ? code : 1, output }));
    });
}
function triggerKnowledgeUpdate() {
    return __awaiter(this, arguments, void 0, function* (force = false) {
        if (running) {
            return { ok: false, message: '更新任务正在执行中', state: readSchedulerState() };
        }
        if (!fs_1.default.existsSync(UPDATE_SCRIPT)) {
            return { ok: false, message: `未找到更新脚本: ${UPDATE_SCRIPT}`, state: readSchedulerState() };
        }
        running = true;
        try {
            const { code, output } = yield runPythonUpdate(force);
            if (code === 0) {
                const kb = (0, ragService_1.reloadKnowledgeBase)();
                const vec = (0, vectorDBService_1.reloadVectorDatabase)();
                const state = readSchedulerState();
                return {
                    ok: true,
                    message: `更新成功，知识库 ${kb} 条，向量 ${vec} 条`,
                    state,
                    output: output.slice(-2000)
                };
            }
            return {
                ok: false,
                message: `更新脚本退出码 ${code}`,
                state: readSchedulerState(),
                output: output.slice(-2000)
            };
        }
        finally {
            running = false;
        }
    });
}
function shouldAutoRun() {
    const day = parseInt(process.env.KNOWLEDGE_UPDATE_DAY || '1', 10);
    const hour = parseInt(process.env.KNOWLEDGE_UPDATE_HOUR || '3', 10);
    const now = new Date();
    if (now.getDate() !== day || now.getHours() !== hour) {
        return false;
    }
    const state = readSchedulerState();
    return state.lastSuccessMonth !== monthKey(now);
}
/** 后端常驻时每月自动检查（需 KNOWLEDGE_AUTO_UPDATE=1） */
function startKnowledgeScheduler() {
    if (process.env.KNOWLEDGE_AUTO_UPDATE !== '1') {
        return;
    }
    const day = process.env.KNOWLEDGE_UPDATE_DAY || '1';
    const hour = process.env.KNOWLEDGE_UPDATE_HOUR || '3';
    console.log(`Knowledge scheduler enabled: monthly day ${day} at ${hour}:00`);
    const tick = () => __awaiter(this, void 0, void 0, function* () {
        if (!shouldAutoRun() || running)
            return;
        console.log('Running scheduled monthly knowledge update...');
        const result = yield triggerKnowledgeUpdate(false);
        console.log(result.ok ? result.message : `Knowledge update failed: ${result.message}`);
    });
    setInterval(() => {
        tick().catch((e) => console.error('Knowledge scheduler error:', e));
    }, 60 * 60 * 1000);
    setTimeout(() => {
        tick().catch((e) => console.error('Knowledge scheduler error:', e));
    }, 15000);
}
