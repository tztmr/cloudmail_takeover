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
      // 优先处理 SPA 路由：如果路径包含 @（邮箱地址），或者不是静态资源文件，直接返回 index.html
      // 注意：decodeURIComponent 用于处理被编码的路径，例如 %40
      const decodedPath = decodeURIComponent(url.pathname);
      const isApi = url.pathname.startsWith('/api-proxy');
      const isFile = url.pathname.split('/').pop().includes('.');

      if (!isApi && (decodedPath.includes('@') || !isFile)) {
        const indexUrl = new URL('/index.html', request.url);
        return env.ASSETS.fetch(new Request(indexUrl, request));
      }

      // 尝试获取静态资源
      // 注意：如果前面的 SPA 逻辑没有拦截到（例如看似文件但其实不是），这里可能会返回 404
      return await env.ASSETS.fetch(request);
    }
    
    return new Response("Not found", { status: 404 });
  }
}
