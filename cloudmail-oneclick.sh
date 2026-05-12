#!/usr/bin/env bash
# 使用方式: chmod +x ./cloudmail-oneclick.sh && bash ./cloudmail-oneclick.sh
set -euo pipefail

if [[ -t 1 ]]; then
  R=$'\033[0;31m'; G=$'\033[0;32m'; Y=$'\033[1;33m'; B=$'\033[0;34m'; C=$'\033[0;36m'; NC=$'\033[0m'
else
  R=''; G=''; Y=''; B=''; C=''; NC=''
fi

info() { printf "${B}[INFO]${NC} %s\n" "$1"; }
warn() { printf "${Y}[WARN]${NC} %s\n" "$1"; }
error() { printf "${R}[ERROR]${NC} %s\n" "$1" >&2; }
ok() { printf "${G}[OK]${NC} %s\n" "$1"; }

APP_NAME="cloudmail-web"
DEFAULT_REPO_URL="https://github.com/tztmr/takeover_cloudmail.git"
DEFAULT_BRANCH="main"
DEFAULT_INSTALL_DIR="/opt/cloudmail"
DEFAULT_WEB_ROOT="/var/www/cloudmail"
STATE_DIR="${HOME}/.cloudmail-oneclick"
STATE_FILE="${STATE_DIR}/state.env"
NGINX_CONF_FILE=""

trim() {
  local v="${1:-}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then "$@"; return $?; fi
  if command_exists sudo; then sudo "$@"; return $?; fi
  return 1
}

ensure_root_capability() {
  if [[ "$(id -u)" -eq 0 ]]; then return 0; fi
  if ! command_exists sudo; then
    error "请使用 root 运行，或先安装 sudo"
    exit 1
  fi
  if ! sudo -n true 2>/dev/null; then
    error "当前账号需要 sudo 免密或交互授权后再运行"
    exit 1
  fi
}

prompt_default() {
  local prompt="$1" def="${2:-}" val=""
  if [[ -n "$def" ]]; then
    printf '%s [%s]: ' "$prompt" "$def" >&2
  else
    printf '%s: ' "$prompt" >&2
  fi
  read -r val
  val="$(trim "$val")"
  [[ -z "$val" ]] && val="$def"
  printf '%s' "$val"
}

ask_yes_no() {
  local prompt="$1" def="${2:-y}" ans="" hint="[Y/n]"
  [[ "$def" == "n" ]] && hint="[y/N]"
  while true; do
    printf '%s %s: ' "$prompt" "$hint" >&2
    read -r ans
    ans="$(trim "$ans")"
    [[ -z "$ans" ]] && ans="$def"
    ans="$(printf '%s' "$ans" | tr '[:upper:]' '[:lower:]')"
    case "$ans" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "请输入 y 或 n" ;;
    esac
  done
}

ensure_state_dir() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR" 2>/dev/null || true
}

save_state() {
  local install_dir="$1" repo_url="$2" branch="$3" web_root="$4" domain="${5:-}"
  ensure_state_dir
  cat > "$STATE_FILE" <<EOF
INSTALL_DIR='${install_dir}'
REPO_URL='${repo_url}'
BRANCH='${branch}'
WEB_ROOT='${web_root}'
DOMAIN='${domain}'
EOF
  chmod 600 "$STATE_FILE" 2>/dev/null || true
}

load_state() {
  [[ -f "$STATE_FILE" ]] || return 1
  set +u
  source "$STATE_FILE"
  set -u
  [[ -n "${INSTALL_DIR:-}" && -n "${REPO_URL:-}" && -n "${BRANCH:-}" && -n "${WEB_ROOT:-}" ]]
}

detect_pkg_manager() {
  if command_exists apt-get; then
    printf 'apt'
  elif command_exists dnf; then
    printf 'dnf'
  elif command_exists yum; then
    printf 'yum'
  else
    printf ''
  fi
}

install_git_if_needed() {
  command_exists git && return 0
  info "检测到未安装 Git，开始自动安装"
  case "$(detect_pkg_manager)" in
    apt)
      run_root apt-get update -y -qq
      run_root apt-get install -y -qq git
      ;;
    dnf)
      run_root dnf install -y -q git
      ;;
    yum)
      run_root yum install -y -q git
      ;;
    *)
      error "不支持的系统包管理器，请手动安装 Git"
      return 1
      ;;
  esac
  ok "Git 安装完成"
}

install_curl_if_needed() {
  command_exists curl && return 0
  info "检测到未安装 curl，开始自动安装"
  case "$(detect_pkg_manager)" in
    apt)
      run_root apt-get update -y -qq
      run_root apt-get install -y -qq curl ca-certificates
      ;;
    dnf)
      run_root dnf install -y -q curl ca-certificates
      ;;
    yum)
      run_root yum install -y -q curl ca-certificates
      ;;
    *)
      error "不支持的系统包管理器，请手动安装 curl"
      return 1
      ;;
  esac
}

ensure_nodejs() {
  if command_exists node && command_exists npm; then
    ok "检测到 Node.js $(node -v) 和 npm $(npm -v)"
    return 0
  fi

  info "检测到未安装 Node.js，开始自动安装 Node.js 20"
  install_curl_if_needed
  case "$(detect_pkg_manager)" in
    apt)
      run_root apt-get update -y -qq
      run_root apt-get install -y -qq ca-certificates curl gnupg
      curl -fsSL https://deb.nodesource.com/setup_20.x | run_root bash
      run_root apt-get install -y -qq nodejs
      ;;
    dnf)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | run_root bash
      run_root dnf install -y -q nodejs
      ;;
    yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | run_root bash
      run_root yum install -y -q nodejs
      ;;
    *)
      error "不支持的系统包管理器，请手动安装 Node.js 20+"
      return 1
      ;;
  esac
  ok "Node.js 安装完成"
}

install_nginx_if_needed() {
  command_exists nginx && return 0
  info "检测到未安装 Nginx，开始自动安装"
  case "$(detect_pkg_manager)" in
    apt)
      run_root apt-get update -y -qq
      run_root apt-get install -y -qq nginx
      ;;
    dnf)
      run_root dnf install -y -q nginx
      ;;
    yum)
      run_root yum install -y -q nginx
      ;;
    *)
      error "无法自动安装 Nginx，请手动安装后重试"
      return 1
      ;;
  esac
  run_root systemctl enable nginx
  run_root systemctl start nginx
  ok "Nginx 安装完成"
}

install_certbot_if_needed() {
  command_exists certbot && return 0
  case "$(detect_pkg_manager)" in
    apt)
      run_root apt-get update -y -qq
      run_root apt-get install -y -qq certbot python3-certbot-nginx
      ;;
    dnf)
      run_root dnf install -y -q certbot python3-certbot-nginx || run_root dnf install -y -q certbot-nginx
      ;;
    yum)
      run_root yum install -y -q certbot python3-certbot-nginx || run_root yum install -y -q certbot-nginx
      ;;
    *)
      error "无法自动安装 certbot，请手动安装后重试"
      return 1
      ;;
  esac
}

allow_firewall_port() {
  local port="$1"
  if command_exists ufw; then
    if ufw status 2>/dev/null | grep -q "Status: active"; then
      run_root ufw allow "${port}/tcp" >/dev/null 2>&1 || true
      ok "UFW 已放行 ${port}/tcp"
    fi
  fi
  if command_exists firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
    run_root firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null 2>&1 || true
    run_root firewall-cmd --reload >/dev/null 2>&1 || true
    ok "firewalld 已放行 ${port}/tcp"
  fi
}

clone_or_update_repo() {
  local install_dir="$1" repo_url="$2" branch="$3"
  if [[ -d "${install_dir}/.git" ]]; then
    info "检测到已有代码，开始更新"
    git -C "$install_dir" fetch origin "$branch"
    git -C "$install_dir" checkout "$branch"
    git -C "$install_dir" pull --ff-only origin "$branch"
  else
    run_root mkdir -p "$(dirname "$install_dir")"
    git clone --branch "$branch" "$repo_url" "$install_dir"
  fi
}

build_project() {
  local install_dir="$1"
  info "开始安装依赖并构建前端"
  (
    cd "$install_dir"
    npm install
    npm run build
  )
  [[ -d "${install_dir}/dist-cf" ]] || {
    error "构建完成但未找到 dist-cf 目录"
    return 1
  }
  ok "前端构建完成"
}

sync_static_files() {
  local install_dir="$1" web_root="$2"
  info "开始发布静态文件到 ${web_root}"
  run_root mkdir -p "$web_root"
  if command_exists rsync; then
    run_root rsync -a --delete "${install_dir}/dist-cf/" "${web_root}/"
  else
    run_root find "$web_root" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    run_root cp -R "${install_dir}/dist-cf/." "${web_root}/"
  fi
  ok "静态文件发布完成"
}

nginx_conf_dir() {
  if [[ -d /etc/nginx/conf.d ]]; then
    printf '/etc/nginx/conf.d'
  else
    printf '/etc/nginx/sites-available'
  fi
}

detect_nginx_conf_file() {
  local domain="$1"
  local conf_dir
  conf_dir="$(nginx_conf_dir)"
  if [[ -n "$domain" ]]; then
    printf '%s/%s.conf' "$conf_dir" "$domain"
  else
    printf '%s/%s.conf' "$conf_dir" "$APP_NAME"
  fi
}

write_nginx_site_conf() {
  local conf_file="$1" server_name="$2" web_root="$3"
  local tmp_file
  tmp_file="$(mktemp)"
  cat > "$tmp_file" <<EOF
server {
    listen 80;
    server_name ${server_name};
    root ${web_root};
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location = /favicon.ico {
        log_not_found off;
        access_log off;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public, max-age=604800, immutable";
        try_files \$uri =404;
    }
}
EOF
  run_root install -m 0644 "$tmp_file" "$conf_file"
  rm -f "$tmp_file"
}

enable_nginx_conf_if_needed() {
  local conf_file="$1"
  if [[ -d /etc/nginx/sites-enabled ]]; then
    run_root ln -sf "$conf_file" "/etc/nginx/sites-enabled/$(basename "$conf_file")"
  fi
}

reload_nginx() {
  run_root nginx -t
  run_root systemctl reload nginx 2>/dev/null || run_root nginx -s reload
}

configure_nginx_site() {
  local domain="$1" web_root="$2"
  local server_name conf_file
  [[ -n "$domain" ]] && server_name="$domain" || server_name="_"
  conf_file="$(detect_nginx_conf_file "$domain")"
  write_nginx_site_conf "$conf_file" "$server_name" "$web_root"
  enable_nginx_conf_if_needed "$conf_file"
  reload_nginx
  NGINX_CONF_FILE="$conf_file"
  ok "Nginx 站点配置完成"
}

deploy() {
  ensure_root_capability
  install_git_if_needed
  ensure_nodejs
  install_nginx_if_needed

  local install_dir repo_url branch web_root domain
  install_dir="$(prompt_default "源码部署目录" "$DEFAULT_INSTALL_DIR")"
  repo_url="$(prompt_default "Git 仓库地址" "$DEFAULT_REPO_URL")"
  branch="$(prompt_default "分支名" "$DEFAULT_BRANCH")"
  web_root="$(prompt_default "静态文件目录" "$DEFAULT_WEB_ROOT")"
  domain="$(prompt_default "绑定域名（可留空，直接用服务器IP访问）" "")"

  clone_or_update_repo "$install_dir" "$repo_url" "$branch"
  build_project "$install_dir"
  sync_static_files "$install_dir" "$web_root"
  configure_nginx_site "$domain" "$web_root"
  allow_firewall_port 80
  save_state "$install_dir" "$repo_url" "$branch" "$web_root" "$domain"

  local server_ip access_url
  server_ip="$(curl -s --connect-timeout 5 ifconfig.me 2>/dev/null || true)"
  [[ -z "$server_ip" ]] && server_ip="服务器IP"
  access_url="http://${server_ip}"
  [[ -n "$domain" ]] && access_url="http://${domain}"

  echo
  ok "CloudMail Web 部署完成"
  echo "访问地址: ${access_url}"
  echo "源码目录: ${install_dir}"
  echo "静态目录: ${web_root}"
  [[ -n "$NGINX_CONF_FILE" ]] && echo "Nginx 配置: ${NGINX_CONF_FILE}"
  echo
}

setup_nginx_ssl() {
  load_state || { error "未找到部署记录，请先执行部署"; return 1; }
  ensure_root_capability
  install_nginx_if_needed
  install_certbot_if_needed

  local domain email
  domain="$(prompt_default "绑定域名（必须已解析到当前服务器）" "${DOMAIN:-}")"
  [[ -z "$domain" ]] && { error "域名不能为空"; return 1; }

  configure_nginx_site "$domain" "$WEB_ROOT"
  allow_firewall_port 80
  allow_firewall_port 443

  email="$(prompt_default "证书邮箱" "admin@${domain}")"
  run_root certbot --nginx -d "$domain" --redirect -m "$email" --agree-tos --non-interactive
  save_state "$INSTALL_DIR" "$REPO_URL" "$BRANCH" "$WEB_ROOT" "$domain"
  ok "HTTPS 已配置完成"
  echo "访问地址: https://${domain}"
}

status_app() {
  load_state || { error "未找到部署记录，请先执行部署"; return 1; }
  local conf_file
  conf_file="$(detect_nginx_conf_file "${DOMAIN:-}")"
  echo "应用名称: ${APP_NAME}"
  echo "源码目录: ${INSTALL_DIR}"
  echo "静态目录: ${WEB_ROOT}"
  echo "仓库地址: ${REPO_URL}"
  echo "分支: ${BRANCH}"
  echo "域名: ${DOMAIN:-未配置}"
  echo "Nginx 配置: ${conf_file}"
  echo
  run_root systemctl status nginx --no-pager || true
}

logs_app() {
  install_nginx_if_needed
  local error_log access_log
  error_log="/var/log/nginx/error.log"
  access_log="/var/log/nginx/access.log"
  info "开始跟踪 Nginx 日志，按 Ctrl+C 退出"
  if [[ -f "$error_log" && -f "$access_log" ]]; then
    run_root tail -f "$error_log" "$access_log"
  elif [[ -f "$error_log" ]]; then
    run_root tail -f "$error_log"
  else
    warn "未找到标准 Nginx 日志文件"
  fi
}

restart_app() {
  install_nginx_if_needed
  run_root systemctl restart nginx
  ok "Nginx 已重启"
}

update_app() {
  load_state || { error "未找到部署记录，请先执行部署"; return 1; }
  ensure_root_capability
  install_git_if_needed
  ensure_nodejs
  install_nginx_if_needed

  clone_or_update_repo "$INSTALL_DIR" "$REPO_URL" "$BRANCH"
  build_project "$INSTALL_DIR"
  sync_static_files "$INSTALL_DIR" "$WEB_ROOT"
  configure_nginx_site "${DOMAIN:-}" "$WEB_ROOT"
  ok "代码更新并重新发布完成"
}

uninstall_app() {
  load_state || { error "未找到部署记录，请先执行部署"; return 1; }
  ensure_root_capability

  local conf_file
  conf_file="$(detect_nginx_conf_file "${DOMAIN:-}")"
  warn "将删除 Nginx 站点配置，默认保留源码目录 ${INSTALL_DIR}"
  if ask_yes_no "确认继续卸载" "n"; then
    if [[ -f "$conf_file" ]]; then
      run_root rm -f "$conf_file"
    fi
    if [[ -d /etc/nginx/sites-enabled ]]; then
      run_root rm -f "/etc/nginx/sites-enabled/$(basename "$conf_file")"
    fi
    reload_nginx || true

    if ask_yes_no "是否同时删除静态目录 ${WEB_ROOT}" "n"; then
      run_root rm -rf "$WEB_ROOT"
      ok "静态目录已删除"
    fi
    if ask_yes_no "是否同时删除源码目录 ${INSTALL_DIR}" "n"; then
      run_root rm -rf "$INSTALL_DIR"
      ok "源码目录已删除"
    fi
    rm -f "$STATE_FILE"
    ok "卸载完成"
  fi
}

print_menu() {
  echo
  echo "=========== CloudMail 一键部署脚本 ==========="
  echo "1) 一键部署（Node + Nginx）"
  echo "2) 查看状态"
  echo "3) 查看日志"
  echo "4) 重启 Nginx"
  echo "5) 更新代码并重新发布"
  echo "6) 配置 HTTPS"
  echo "7) 卸载"
  echo "0) 退出"
  echo "=============================================="
}

main() {
  while true; do
    print_menu
    printf '请选择 [0-7]: ' >&2
    read -r choice
    choice="$(trim "${choice}")"
    case "$choice" in
      1) deploy ;;
      2) status_app ;;
      3) logs_app ;;
      4) restart_app ;;
      5) update_app ;;
      6) setup_nginx_ssl ;;
      7) uninstall_app ;;
      0) exit 0 ;;
      *) warn "无效选项" ;;
    esac
  done
}

main "$@"
