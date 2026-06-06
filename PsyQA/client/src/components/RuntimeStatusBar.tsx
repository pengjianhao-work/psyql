import React, { useCallback, useEffect, useState } from 'react';

import { fetchRuntimeHealth, RuntimeHealth } from '../api';



const MODE_LABEL: Record<RuntimeHealth['llmMode'], string> = {

  zhipu: '智谱免费版已连接',

  ollama: 'Ollama 大模型已连接',

  fallback: '大模型未就绪 · 规则兜底',

  fast: '快速模式 · 未启用大模型'

};



export const RuntimeStatusBar: React.FC = () => {

  const [health, setHealth] = useState<RuntimeHealth | null>(null);

  const [dismissed, setDismissed] = useState(false);



  const load = useCallback(() => {

    fetchRuntimeHealth()

      .then((h) => setHealth(h))

      .catch(() => {

        setHealth({

          status: 'error',

          llmMode: 'fallback',

          ollamaAvailable: false

        });

      });

  }, []);



  useEffect(() => {

    load();

    const id = window.setInterval(load, 60_000);

    return () => window.clearInterval(id);

  }, [load]);



  if (dismissed || !health) return null;



  const backendDown = health.status === 'error';

  const tone = backendDown

    ? 'runtime-error'

    : health.llmMode === 'zhipu' || health.llmMode === 'ollama'

      ? 'runtime-ok'

      : health.llmMode === 'fast'

        ? 'runtime-warn'

        : 'runtime-caution';



  return (

    <div className={`runtime-status-bar ${tone}`} role="status">

      <span className="runtime-status-dot" aria-hidden="true" />

      <span className="runtime-status-text">

        {backendDown ? (

          <>

            <strong>后端未连接</strong>

            <span className="muted"> · 请运行「心理港湾」或 npm run dev</span>

          </>

        ) : (

          <>

            <strong>{MODE_LABEL[health.llmMode]}</strong>

            {health.model && (health.llmMode === 'zhipu' || health.llmMode === 'ollama') && (

              <span className="muted"> · {health.model}</span>

            )}

            {health.llmMode === 'fallback' && (

              <span className="muted">

                {' '}

                · 请在 .env 配置 ZHIPU_API_KEY（智谱永久免费）或启用 Ollama

              </span>

            )}

            {health.llmMode === 'fast' && (

              <span className="muted"> · 规则+知识库秒回 · 完整模式请用「心理港湾」启动</span>

            )}

            {health.knowledge && !health.knowledge.embedReady && health.llmMode !== 'fast' && (

              <span className="muted"> · 知识库 {health.knowledge.knowledgeCount} 条（可运行数据处理.bat 完成向量嵌入）</span>

            )}

            {health.reportQueue && health.reportQueue.pending > 0 && (

              <span className="muted"> · 报告队列 {health.reportQueue.pending}</span>

            )}

            {health.knowledge?.chromaConnected && health.knowledge.chromaCount != null && (

              <span className="muted"> · Chroma {health.knowledge.chromaCount} 条</span>

            )}

          </>

        )}

      </span>

      {backendDown && (

        <button type="button" className="runtime-status-retry" onClick={load}>

          重试

        </button>

      )}

      <button

        type="button"

        className="runtime-status-dismiss"

        onClick={() => setDismissed(true)}

        aria-label="关闭提示"

      >

        ×

      </button>

    </div>

  );

};

