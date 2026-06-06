const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_API_PROXY || 'http://localhost:3001';
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    logLevel: 'warn',
    // 大模型 /ask 常需 15～120 秒，代理超时须大于客户端 ASK_TIMEOUT
    proxyTimeout: 180000,
    timeout: 180000,
    onError(err, req, res) {
      console.warn('[proxy]', req.method, req.url, '->', target, err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '后端未启动', target }));
      }
    }
  });
  app.use(['/api', '/health', '/ready'], proxy);
};
