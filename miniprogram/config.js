/**
 * 全局配置
 * MODE 四种运行模式：
 *   'snapshot' 读本地官方榜单快照（data/snapshot.json），内容与 github.com/trending 逐条一致，
 *              不需要云开发、不需要网络。缺点：数据是生成快照那一刻的，不会自动更新。
 *              重新生成：node scripts/snapshot.js
 *   'cloud'    走微信云开发云函数 getTrending（正式方案：实时 + 中文生成 + star 趋势 + 名次变化）
 *   'http'     走你自己部署的 HTTP 接口（config.API_BASE）
 *   'mock'     内置 24 条演示数据（纯 UI 联调 / 断网演示，内容与真实榜单无关）
 */
module.exports = {
  APP_NAME: 'GithubTrending',
  VERSION: '0.2.0',

  MODE: 'snapshot',

  // MODE = 'cloud' 时填云开发环境 ID；留空则用 DYNAMIC_CURRENT_ENV
  CLOUD_ENV: '',

  // MODE = 'http' 时填你的服务地址，例如 'https://api.yourdomain.com'
  API_BASE: '',

  // 榜单周期
  PERIODS: [
    { value: 'daily', label: '今日', unit: '今日新增' },
    { value: 'weekly', label: '本周', unit: '本周新增' },
    { value: 'monthly', label: '本月', unit: '本月新增' }
  ],

  // 前端缓存时效（毫秒）
  CACHE_TTL: 5 * 60 * 1000,

  // 列表页每期展示条数
  PAGE_SIZE: 25
};
