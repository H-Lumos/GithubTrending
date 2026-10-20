/**
 * DeepSeek 中文文案生成
 *
 * 设计要点：
 * - 只对「人工表里没有、AI 缓存里也没有/已过期」的仓库调用，避免重复花钱
 * - 返回严格 JSON，字段不合法就当失败（绝不用半成品污染数据）
 * - 无 API Key 时静默跳过，整个流程照常跑（回落英文）
 */
const { postJson } = require('./http.js');

const BASE = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const TTL_DAYS = Number(process.env.ZH_AUTO_TTL_DAYS || 90);

const SYSTEM = [
  '你是一名中文技术编辑，为 GitHub 热门项目写简短中文简介。',
  '硬性要求：',
  '1. 只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块。',
  '2. 字段：purpose（字符串）、detail（字符串）、tags（字符串数组，2~4 个）。',
  '3. purpose 是一句话，40 个汉字以内，说清「给谁用、解决什么问题」，不要复述英文。',
  '4. detail 是 2~4 句，说明用途、关键特点、适合谁；不要营销文案、不要感叹号。',
  '5. 只能基于给定信息推断，禁止编造未提及的功能、公司、数据。',
  '6. 如果给了 README 摘录，就以 README 为主要依据来概括，不要再说信息不足。',
  '7. 只有当「描述和 README 都为空」时，purpose 才写「信息不足，建议进仓库查看」，detail 说明仓库未提供任何说明。'
].join('\n');

function buildUserPrompt(item) {
  const lines = ['仓库：' + item.fullName, '主语言：' + (item.language || '未知')];
  if (item.topics && item.topics.length) lines.push('标签：' + item.topics.join(', '));
  lines.push('GitHub 官方描述：' + (item.descEn || '（仓库没有填写描述）'));
  if (item.readmeExcerpt) {
    lines.push('', 'README 摘录（用于概括用途）：', item.readmeExcerpt);
  }
  lines.push('', '请按要求输出 JSON。');
  return lines.join('\n');
}

function isValidEntry(e) {
  return (
    e &&
    typeof e.purpose === 'string' &&
    e.purpose.trim().length >= 4 &&
    typeof e.detail === 'string' &&
    e.detail.trim().length >= 8 &&
    Array.isArray(e.tags)
  );
}

function isFresh(entry, now) {
  if (!entry || !entry.generatedAt) return false;
  return now - Number(entry.generatedAt) < TTL_DAYS * 86400000;
}

/**
 * 生成一条
 * @returns {Promise<{purpose,detail,tags,generatedAt,model}|null>}
 */
async function generateOne(apiKey, item) {
  const payload = {
    model: MODEL,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: buildUserPrompt(item) }
    ]
  };

  const res = await postJson(
    BASE + '/chat/completions',
    { Authorization: 'Bearer ' + apiKey },
    payload
  );

  const text = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  if (!text) throw new Error('返回里没有 content');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    // 模型偶尔会包一层 ```json，兜一下
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('返回不是 JSON：' + text.slice(0, 120));
    parsed = JSON.parse(m[0]);
  }

  if (!isValidEntry(parsed)) throw new Error('字段不合法：' + JSON.stringify(parsed).slice(0, 160));

  return {
    purpose: parsed.purpose.trim().slice(0, 60),
    detail: parsed.detail.trim().slice(0, 600),
    tags: parsed.tags.slice(0, 4).map((t) => String(t).trim()).filter(Boolean),
    generatedAt: Date.now(),
    model: MODEL
  };
}

/**
 * 批量生成（串行，失败不影响其它条目）
 * @param {string} apiKey
 * @param {Array} items
 * @param {{limit:number, onResult?:Function}} opts
 */
async function generateMany(apiKey, items, opts) {
  const limit = (opts && opts.limit) || 12;
  const todo = items.slice(0, limit);
  const ok = {};
  const failed = [];

  for (const it of todo) {
    try {
      const entry = await generateOne(apiKey, it);
      ok[it.id] = entry;
      if (opts && opts.onResult) opts.onResult(it, entry, null);
    } catch (e) {
      failed.push({ id: it.id, error: e.message });
      if (opts && opts.onResult) opts.onResult(it, null, e);
    }
  }

  return { ok: ok, failed: failed, skipped: Math.max(0, items.length - todo.length) };
}

module.exports = { generateOne, generateMany, isFresh, isValidEntry, buildUserPrompt, SYSTEM, MODEL, TTL_DAYS };

