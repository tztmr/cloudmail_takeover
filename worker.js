export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 处理静态资源 (Assets)
    if (env.ASSETS) {
      // 优先处理 SPA 路由：如果路径包含 @（邮箱地址），或者不是静态资源文件，直接返回 index.html
      // 注意：decodeURIComponent 用于处理被编码的路径，例如 %40
      const decodedPath = decodeURIComponent(url.pathname);
      const isFile = url.pathname.split('/').pop().includes('.');

      if (decodedPath.includes('@') || !isFile) {
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
