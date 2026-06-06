import { getUserHistory } from '../common/historyManager';
import { isReportPendingText, REPORT_PENDING_MARKER } from '../common/reportQueue';

export interface InsightsStatus {
  ready: boolean;
  reportPending: boolean;
  portraitPending: boolean;
  dialogTime?: string;
}

export function getInsightsStatusForUser(userId: string): InsightsStatus {
  const hist = getUserHistory(userId);
  const last = hist?.dialogs[hist.dialogs.length - 1];
  if (!last) {
    return { ready: true, reportPending: false, portraitPending: false };
  }
  const reportPending = !last.report || isReportPendingText(last.report);
  const portraitPending =
    !last.portrait?.summary || last.portrait.summary.includes('生成中');
  return {
    ready: !reportPending && !portraitPending,
    reportPending,
    portraitPending,
    dialogTime: last.time
  };
}

export { REPORT_PENDING_MARKER };
