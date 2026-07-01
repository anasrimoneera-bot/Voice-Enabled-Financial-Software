#!/usr/bin/env bash
# 一键部署财务 App 代码更新。
# 只做两件事：① 覆盖 finance.py 与 templates/app.html  ② 重启 finance 服务。
# 绝不触碰 finance.db / users.json / ai_config.json / asr_config.json，
# 也绝不影响你的其他应用（app:5000 / erp:5500 / Nginx 其它站点）。
#
# 用法（在服务器上）：
#   cd /var/www/finance.b2bsxlj.com && git pull
#   bash deploy/deploy_finance.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/www/finance.b2bsxlj.com}"
APP_DIR="${APP_DIR:-/opt/finance_app}"

SRC_PY="$REPO_DIR/finance_app/finance.py"
SRC_HTML="$REPO_DIR/finance_app/templates/app.html"

# 前置检查，任何不对就中止，绝不误伤
[ -f "$SRC_PY" ]   || { echo "✗ 找不到 $SRC_PY，请先在 $REPO_DIR 执行 git pull"; exit 1; }
[ -f "$SRC_HTML" ] || { echo "✗ 找不到 $SRC_HTML"; exit 1; }
[ -d "$APP_DIR" ]  || { echo "✗ 找不到应用目录 $APP_DIR"; exit 1; }
[ -f "$APP_DIR/finance.py" ] || { echo "✗ $APP_DIR/finance.py 不存在，目录不对？"; exit 1; }

ts=$(date +%Y%m%d_%H%M%S)
echo "==> 备份当前代码 -> *.bak.$ts"
cp "$APP_DIR/finance.py"          "$APP_DIR/finance.py.bak.$ts"
cp "$APP_DIR/templates/app.html"  "$APP_DIR/templates/app.html.bak.$ts"

echo "==> 覆盖 finance.py 与 templates/app.html（仅这两个文件）"
cp "$SRC_PY"   "$APP_DIR/finance.py"
cp "$SRC_HTML" "$APP_DIR/templates/app.html"

echo "==> 语法自检 finance.py"
if ! python3 -m py_compile "$APP_DIR/finance.py"; then
  echo "✗ finance.py 语法错误，自动回滚"
  cp "$APP_DIR/finance.py.bak.$ts" "$APP_DIR/finance.py"
  exit 1
fi

echo "==> 仅重启 finance 服务"
systemctl restart finance
sleep 1
if systemctl is-active --quiet finance; then
  echo "✅ 部署完成：finance 运行中。数据与其他应用未受影响。"
else
  echo "✗ finance 未起来，自动回滚 finance.py 并重启"
  cp "$APP_DIR/finance.py.bak.$ts" "$APP_DIR/finance.py"
  cp "$APP_DIR/templates/app.html.bak.$ts" "$APP_DIR/templates/app.html"
  systemctl restart finance || true
  echo "已回滚。请查看日志：tail -50 /var/log/finance_app.log"
  exit 1
fi
