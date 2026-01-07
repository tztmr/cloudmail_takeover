export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // API Proxy 逻辑
    if (url.pathname.startsWith('/api-proxy')) {
      const path = url.pathname.replace('/api-proxy', '');
      const targetUrl = `https://mail.tztright.top/api/public${path}${url.search}`;
      
      const headers = new Headers(request.headers);
      headers.set('Host', 'mail.tztright.top');
      
      const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
        redirect: 'follow',
      });

      try {
        return await fetch(newRequest);
      } catch (err) {
        return new Response(`API Proxy Error: ${err.message}`, { status: 500 });
      }
    }

    // 处理静态资源 (Assets)
    if (env.ASSETS) {
      // 尝试获取静态资源
      const response = await env.ASSETS.fetch(request);
      
      // SPA 支持：如果返回 404，且路径看起来不是静态文件（不包含扩展名，或者包含 @ 符号）
      // 则返回 index.html，让前端路由处理
      if (response.status === 404) {
        const isFile = url.pathname.split('/').pop().includes('.');
        // 如果路径中包含 @ (邮箱查询) 或者不是文件扩展名请求，则返回 index.html
        if (!isFile || url.pathname.includes('@')) {
          const indexUrl = new URL('/index.html', request.url);
          return env.ASSETS.fetch(new Request(indexUrl, request));
        }
      }
      
      return response;
    }
    
    return new Response("Not found", { status: 404 });
  }
}
