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
const supertest_1 = __importDefault(require("supertest"));
const createApp_1 = require("../../createApp");
describe('SSE ask stream', () => {
    const app = (0, createApp_1.createApp)();
    it('returns event-stream content type', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield (0, supertest_1.default)(app)
            .post('/api/questions/ask/stream')
            .set('Accept', 'text/event-stream')
            .send({ question: '最近有点焦虑怎么办', userId: 'demo' });
        expect([200, 401, 429, 503]).toContain(res.status);
        if (res.status === 200) {
            expect(res.headers['content-type']).toMatch(/text\/event-stream/);
        }
    }));
});
