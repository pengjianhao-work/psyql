/** 打开打印窗口，用户可选择「另存为 PDF」 */
export function printHtmlDocument(html: string, documentTitle: string): void {
  const win = window.open('', '_blank', 'noopener,noreferrer,width=820,height=1100');
  if (!win) {
    throw new Error('无法打开打印窗口，请允许弹窗后重试');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = documentTitle;
  win.focus();
  window.setTimeout(() => {
    win.print();
  }, 400);
}
