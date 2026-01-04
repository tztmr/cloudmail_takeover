export async function onRequest(context) {
  const url = new URL(context.request.url);
  
  // 从请求路径中移除 /api-proxy 前缀，提取剩余部分
  // 例如：/api-proxy/emailList -> /emailList
  const path = url.pathname.replace('/api-proxy', '');
  
  // 构建目标 URL
  const targetUrl = `https://mail.tztright.top/api/public${path}${url.search}`;

  // 复制原始请求的 headers，但可能需要调整 Host
  const headers = new Headers(context.request.headers);
  headers.set('Host', 'mail.tztright.top');
  
  // 创建新的请求对象
  const newRequest = new Request(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: context.request.body,
    redirect: 'follow',
  });

  try {
    const response = await fetch(newRequest);
    return response;
  } catch (err) {
    return new Response(`API Proxy Error: ${err.message}`, { status: 500 });
  }
}
