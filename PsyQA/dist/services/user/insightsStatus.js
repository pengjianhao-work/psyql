"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REPORT_PENDING_MARKER = void 0;
exports.getInsightsStatusForUser = getInsightsStatusForUser;
const historyManager_1 = require("../common/historyManager");
const reportQueue_1 = require("../common/reportQueue");
Object.defineProperty(exports, "REPORT_PENDING_MARKER", { enumerable: true, get: function () { return reportQueue_1.REPORT_PENDING_MARKER; } });
function getInsightsStatusForUser(userId) {
    var _a;
    const hist = (0, historyManager_1.getUserHistory)(userId);
    const last = hist === null || hist === void 0 ? void 0 : hist.dialogs[hist.dialogs.length - 1];
    if (!last) {
        return { ready: true, reportPending: false, portraitPending: false };
    }
    const reportPending = !last.report || (0, reportQueue_1.isReportPendingText)(last.report);
    const portraitPending = !((_a = last.portrait) === null || _a === void 0 ? void 0 : _a.summary) || last.portrait.summary.includes('生成中');
    return {
        ready: !reportPending && !portraitPending,
        reportPending,
        portraitPending,
        dialogTime: last.time
    };
}
