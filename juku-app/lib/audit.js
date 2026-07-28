'use strict';
/**
 * 監査ログ。相談・メッセージ・時間割変更・個人情報の閲覧など、
 * 重要操作の記録を残す。個人情報の中身そのものは残さず、対象IDのみ記録する。
 */
const crypto = require('crypto');
const store = require('./store');

function record(user, action, targetType, targetId, meta) {
  const d = store.db();
  if (!d) return;
  d.auditLogs.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: user ? user.id : null,
    role: user ? user.role : null,
    action,
    targetType: targetType || null,
    targetId: targetId || null,
    meta: meta || null,
  });
  if (d.auditLogs.length > 5000) d.auditLogs.splice(0, d.auditLogs.length - 5000);
  store.saveSoon();
}

module.exports = { record };
