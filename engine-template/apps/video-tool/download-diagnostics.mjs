export function downloadError(raw){
 raw=String(raw||'');
 if(/WinError\s*10013|WSAEACCES|EACCES.*(?:connect|socket)|EPERM.*connect/i.test(raw))return {code:'network_permission',message:'当前运行环境禁止下载器联网，请在允许联网的正常桌面环境中重新打开应用。应用不会解除系统或 Agent 的网络限制。'};
 if(/could not copy.*cookie|failed to decrypt|DPAPI|app.bound|cookie database.*locked|permission denied.*cookies/i.test(raw))return {code:'browser_session_unavailable',message:'无法读取所选浏览器的登录状态：文件可能正在占用，或系统不允许解密。可关闭该浏览器后重试，或选择另一已登录的浏览器。应用不会更改浏览器安全保护。'};
 if(/CERTIFICATE_VERIFY_FAILED|certificate verify failed|certificate has expired/i.test(raw))return {code:'tls_certificate',message:'HTTPS 证书验证失败。请确认系统日期正确；若使用单位网络，请由网络管理员配置受信任证书。应用不会关闭证书验证。'};
 if(/HTTP Error 429|Too Many Requests|rate.limit/i.test(raw))return {code:'rate_limited',message:'网站暂时限制请求频率，请稍后重试；应用已停止重复请求。'};
 if(/timed out|TimeoutError|ETIMEDOUT/i.test(raw))return {code:'timeout',message:'连接视频网站超时，请检查网络后重试；这不表示缺少登录信息。'};
 if(/getaddrinfo|name resolution|ENOTFOUND|nodename nor servname/i.test(raw))return {code:'dns',message:'无法解析视频网站地址，请检查网络或 DNS 设置后重试。'};
 if(/DRM protected|DRM-protected/i.test(raw))return {code:'drm',message:'此视频受 DRM 保护，当前下载器无法处理。'};
 // A URL path or help reference alone is not proof of an authentication challenge.
 const prose=raw.replace(/https?:\/\/[^\s<>"']+/gi,'');
 if(/(?:please|must|need to|have to)\s+(?:sign\s*in|log\s*in)|(?:login|log\s*in|sign\s*in|authentication)\s+(?:is\s+)?required|(?:sign\s*in|log\s*in)\s+to\s+(?:confirm|watch|view|access)|not a bot|(?:complete|solve|requires?|required)\s+(?:a\s+|the\s+)?captcha|captcha\s+(?:challenge|required)/i.test(prose))return {code:'site_verification',message:'下载器明确提示需要登录或人工验证。请先在本机浏览器中打开原视频并完成验证，或直接点击任务旁的“在 APP 内登录并重试”，在弹出的窗口中完成登录。'};
 if(/Unsupported URL/i.test(raw)&&[...raw.matchAll(/https?:\/\/[^\s<>"']+/gi)].some(m=>{try{return /^\/(?:login|signin|sign-in|passport\/login)(?:\/|$)/i.test(new URL(m[0]).pathname);}catch{return false;}}))return {code:'login_redirect',message:'下载器最终到达了登录页面，无法将它作为视频解析；这条错误本身不代表出现了验证码。请在本机浏览器中确认原视频可播放，也可点击“在 APP 内登录并重试”；若仍失败，可能是会话失效或站点适配问题。'};
 if(/\[Douyin\]/i.test(raw)&&/HTTP Error 403/i.test(raw))return {code:'douyin_compatibility',message:'抖音接口拒绝请求（403）。解析器可能将接口兼容性问题误报成缺少 Cookie；本次无法确认是登录问题。原始日志已保留。'};
 if(/Fresh cookies|JSONDecodeError|Failed to parse JSON|returned no video details/i.test(raw))return {code:'site_compatibility',message:'下载器未取得有效视频信息，可能是站点接口变化或访问限制，不能确定是登录问题。支持的站点会自动尝试备用解析方式，无需向开发者发送日志。'};
 if(/HTTP Error (403|401)/i.test(raw))return {code:'http_denied',message:'网站拒绝了请求（401/403）。可能与登录、链接过期或站点限制有关；这不是本机联网权限错误。'};
 if(/Unsupported URL/i.test(raw))return {code:'unsupported_url',message:'解析器暂不支持此链接。请使用单条视频页面或直接媒体链接。'};
 return {code:'download_failed',message:raw};
}
export function normalizeVideoUrl(input){
 const u=new URL(input);if(!['http:','https:'].includes(u.protocol))throw Error('需要 HTTP(S) 链接');
 if(u.username||u.password)throw Error('链接不能包含账号密码');
 if(['douyin.com','www.douyin.com'].includes(u.hostname)){
  const modal=u.searchParams.get('modal_id');
  if(modal){if(!/^\d+$/.test(modal))throw Error('抖音视频 ID 无效');return 'https://www.douyin.com/video/'+modal;}
  if(u.pathname.startsWith('/user/'))throw Error('这是抖音个人主页。请先打开一条视频，再复制带 modal_id 的地址或视频分享链接。');
 }
 return u.href;
}
