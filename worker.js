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
      const response = await env.ASSETS.fetch(request);
      
      // SPA 支持：如果找不到资源且不是请求文件（无扩展名），返回 index.html
      if (response.status === 404 && !url.pathname.includes('.')) {
        const indexUrl = new URL('/index.html', request.url);
        return env.ASSETS.fetch(new Request(indexUrl, request));
      }
      
      return response;
    }
    
    return new Response("Not found", { status: 404 });
  }
}
