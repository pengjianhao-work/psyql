import React from 'react';

/** 将后端报告文本渲染为分段 HTML */
export function renderFormattedReport(text: string): React.ReactNode {
  if (!text?.trim()) {
    return <p className="report-narrative-empty">暂无详细报告内容。</p>;
  }

  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="report-narrative-list">
        {listItems.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith('【') && line.endsWith('】')) {
      flushList();
      blocks.push(
        <h4 key={`h-${key++}`} className="report-narrative-heading">
          {line.replace(/^【|】$/g, '')}
        </h4>
      );
      continue;
    }
    if (/^[一二三四五六七八九十]+、/.test(line)) {
      flushList();
      blocks.push(
        <h5 key={`h5-${key++}`} className="report-narrative-subheading">
          {line}
        </h5>
      );
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('• ')) {
      listItems.push(line.replace(/^[-•]\s*/, ''));
      continue;
    }
    if (line.startsWith('📞')) {
      flushList();
      blocks.push(
        <p key={`p-${key++}`} className="report-narrative-hotline">
          {line}
        </p>
      );
      continue;
    }
  flushList();
    blocks.push(
      <p key={`p-${key++}`} className="report-narrative-para">
        {line}
      </p>
    );
  }
  flushList();

  return <div className="report-narrative-body">{blocks}</div>;
}
