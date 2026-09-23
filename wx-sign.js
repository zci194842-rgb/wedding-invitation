/*
 * 微信 JS-SDK 签名服务（Node.js 单文件，零第三方依赖）
 * ============================================================
 * 用途：为 H5 婚礼邀请函提供 wx.config 所需的签名参数
 * 部署：放到你的服务器上，node wx-sign.js 启动（默认 3000 端口）
 * 调用：前端请求  /wx-sign?url=<页面完整URL>
 * 返回：{ appId, timestamp, nonceStr, signature }
 *
 * 使用前请填写下方 APPID / APPSECRET，并注意：
 * 1. AppSecret 只能保存在服务器，绝不能放进前端页面
 * 2. 在公众号后台「IP白名单」中加入本服务器的公网出口 IP
 * 3. 签名接口需与 H5 页面同域名（或配置 CORS），微信要求页面 URL
 *    与 JS接口安全域名一致，签名用的 url 参数必须是页面最终 URL（不含 #）
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');

/* ===== 在这里填写你的公众号信息 ===== */
const APPID = '你的AppID';          // 公众号 AppID
const APPSECRET = '你的AppSecret';  // 公众号 AppSecret（请保密）

/* access_token 与 jsapi_ticket 的内存缓存（微信有效期 7200 秒） */
let tokenCache = { value: '', expire: 0 };
let ticketCache = { value: '', expire: 0 };

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getAccessToken() {
  if (tokenCache.value && tokenCache.expire > Date.now() + 60000) return tokenCache.value;
  const j = await getJson(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
  );
  if (j.errcode) throw new Error('获取 access_token 失败: ' + JSON.stringify(j));
  tokenCache = { value: j.access_token, expire: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function getJsapiTicket() {
  if (ticketCache.value && ticketCache.expire > Date.now() + 60000) return ticketCache.value;
  const token = await getAccessToken();
  const j = await getJson(
    `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${token}&type=jsapi`
  );
  if (j.errcode) throw new Error('获取 jsapi_ticket 失败: ' + JSON.stringify(j));
  ticketCache = { value: j.ticket, expire: Date.now() + j.expires_in * 1000 };
  return j.ticket;
}

async function signUrl(pageUrl) {
  const ticket = await getJsapiTicket();
  const nonceStr = Math.random().toString(36).slice(2);
  const timestamp = Math.floor(Date.now() / 1000);
  const raw = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${pageUrl}`;
  const signature = crypto.createHash('sha1').update(raw).digest('hex');
  return { appId: APPID, timestamp: String(timestamp), nonceStr, signature };
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const u = new URL(req.url, 'http://localhost');
    if (u.pathname === '/wx-sign') {
      const pageUrl = u.searchParams.get('url') || '';
      if (!pageUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ errcode: 400, errmsg: '缺少 url 参数' }));
        return;
      }
      const data = await signUrl(pageUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('sign error: ' + e.message);
  }
}).listen(3000, () => {
  console.log('微信 JS-SDK 签名服务已启动: http://localhost:3000/wx-sign?url=你的页面地址');
});
