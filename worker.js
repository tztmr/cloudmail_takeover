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
    // 如果是 SPA，当找不到资源时应该返回 index.html
    const response = await env.ASSETS.fetch(request);
    
    if (response.status === 404 && !url.pathname.includes('.')) {
      // 尝试加载 index.html (SPA 支持)
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }
    
    return response;
  }
}
