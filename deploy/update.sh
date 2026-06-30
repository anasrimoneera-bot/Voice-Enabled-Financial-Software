#!/usr/bin/env bash
# 服务器端一键更新：拉取最新代码 -> 重载 Nginx -> 重启同步后端（如已配置）
# 用法：bash /var/www/app.b2bsxlj.com/deploy/update.sh
set -e

SITE_DIR="${SITE_DIR:-/var/www/app.b2bsxlj.com}"

echo "==> 进入站点目录：$SITE_DIR"
cd "$SITE_DIR"

echo "==> 拉取最新代码（main 分支）"
git pull origin main

echo "==> 校验并重载 Nginx"
nginx -t && nginx -s reload

# 若部署了云同步后端（systemd 服务名 voice-finance-sync），则重启之
if systemctl list-unit-files 2>/dev/null | grep -q '^voice-finance-sync\.service'; then
  echo "==> 重启云同步后端"
  systemctl restart voice-finance-sync
fi

echo "==> 更新完成 ✅"
