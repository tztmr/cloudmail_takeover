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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.docker"
DEFAULT_BIND_IP="127.0.0.1"
DEFAULT_HOST_PORT="18080"
DEFAULT_CONTAINER_NAME="cloudmail-web"
DEFAULT_IMAGE_NAME="cloudmail-web:local"
DEFAULT_DOMAIN=""

trim() {
  local v="${1:-}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  printf '%s' "$v"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
    return $?
  fi
  if command_exists sudo; then
    sudo "$@"
    return $?
  fi
  return 1
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

require_project_files() {
  local required_files=(
    "${SCRIPT_DIR}/package.json"
    "${SCRIPT_DIR}/Dockerfile"
    "${SCRIPT_DIR}/docker-compose.yml"
    "${SCRIPT_DIR}/nginx/default.conf"
  )
  local file=""
  for file in "${required_files[@]}"; do
    [[ -f "$file" ]] || {
      error "缺少部署文件: ${file}"
      error "请确认你是在项目根目录运行脚本，并且 Docker 相关文件已同步"
      exit 1
    }
  done
}

install_curl_if_needed() {
  command_exists curl && return 0
  if command_exists apt-get; then
    run_root apt-get update -y -qq
    run_root apt-get install -y -qq curl ca-certificates
  elif command_exists dnf; then
    run_root dnf install -y -q curl ca-certificates
  elif command_exists yum; then
    run_root yum install -y -q curl ca-certificates
  else
    error "当前系统无法自动安装 curl，请先手动安装"
    exit 1
  fi
}

docker_ready() {
  if ! command_exists docker; then
    return 1
  fi
  docker info >/dev/null 2>&1 && return 0
  run_root docker info >/dev/null 2>&1
}

install_docker_if_needed() {
  if docker_ready; then
    ok "检测到 Docker 环境可用"
    return 0
  fi

  warn "未检测到可用的 Docker，准备自动安装"
  install_curl_if_needed
  curl -fsSL https://get.docker.com | run_root sh

  if command_exists systemctl; then
    run_root systemctl enable docker >/dev/null 2>&1 || true
    run_root systemctl start docker >/dev/null 2>&1 || true
  fi

  docker_ready || {
    error "Docker 安装完成后仍无法使用，请检查 docker 服务状态"
    exit 1
  }
  ok "Docker 安装完成"
}

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    run_root docker "$@"
  fi
}

compose_cmd() {
  docker_cmd compose "$@"
}

ensure_compose_available() {
  compose_cmd version >/dev/null 2>&1 && return 0
  error "未检测到 docker compose，请升级 Docker 到较新版本后重试"
  exit 1
}

ensure_executable_scripts() {
  chmod +x "${SCRIPT_DIR}/cloudmail-oneclick.sh" 2>/dev/null || true
}

validate_port() {
  local port="$1"
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  (( port >= 1 && port <= 65535 ))
}

port_in_use() {
  local port="$1"
  if command_exists lsof; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

allow_firewall_port() {
  local port="$1"
  if command_exists ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
    run_root ufw allow "${port}/tcp" >/dev/null 2>&1 || true
    ok "UFW 已放行 ${port}/tcp"
  fi
  if command_exists firewall-cmd && firewall-cmd --state >/dev/null 2>&1; then
    run_root firewall-cmd --permanent --add-port="${port}/tcp" >/dev/null 2>&1 || true
    run_root firewall-cmd --reload >/dev/null 2>&1 || true
    ok "firewalld 已放行 ${port}/tcp"
  fi
}

write_env_file() {
  local bind_ip="$1" host_port="$2" domain="$3" container_name="$4" image_name="$5"
  cat > "$ENV_FILE" <<EOF
CLOUDMAIL_BIND_IP=${bind_ip}
CLOUDMAIL_HOST_PORT=${host_port}
CLOUDMAIL_DOMAIN=${domain}
CLOUDMAIL_CONTAINER_NAME=${container_name}
CLOUDMAIL_IMAGE_NAME=${image_name}
EOF
}

print_proxy_hint() {
  local domain="$1" host_port="$2"
  local server_name="${domain:-example.com}"

  echo
  info "当前部署不会占用宿主机 443 端口"
  echo "如果服务器上已有 Nginx / Caddy / 宝塔 统一处理 HTTPS，可把 443 反代到本机 ${host_port}："
  echo
  cat <<EOF
server {
    listen 443 ssl http2;
    server_name ${server_name};

    location / {
        proxy_pass http://127.0.0.1:${host_port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  echo
}

require_env_file() {
  [[ -f "$ENV_FILE" ]] || {
    error "未找到 ${ENV_FILE}"
    error "请先执行一键部署"
    exit 1
  }
}

load_env() {
  require_env_file
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

status_app() {
  install_docker_if_needed
  ensure_compose_available
  load_env

  echo "项目目录: ${SCRIPT_DIR}"
  echo "容器名称: ${CLOUDMAIL_CONTAINER_NAME}"
  echo "镜像名称: ${CLOUDMAIL_IMAGE_NAME}"
  echo "绑定地址: ${CLOUDMAIL_BIND_IP}"
  echo "宿主机端口: ${CLOUDMAIL_HOST_PORT}"
  echo "域名: ${CLOUDMAIL_DOMAIN:-未配置}"
  echo "访问地址: http://${CLOUDMAIL_BIND_IP}:${CLOUDMAIL_HOST_PORT}"
  echo
  compose_cmd --env-file "$ENV_FILE" ps
}

logs_app() {
  install_docker_if_needed
  ensure_compose_available
  require_env_file
  info "开始跟踪容器日志，按 Ctrl+C 退出"
  compose_cmd --env-file "$ENV_FILE" logs -f
}

start_app() {
  install_docker_if_needed
  ensure_compose_available
  require_env_file
  compose_cmd --env-file "$ENV_FILE" up -d
  ok "服务已启动"
}

stop_app() {
  install_docker_if_needed
  ensure_compose_available
  require_env_file
  compose_cmd --env-file "$ENV_FILE" down
  ok "服务已停止"
}

restart_app() {
  install_docker_if_needed
  ensure_compose_available
  require_env_file
  compose_cmd --env-file "$ENV_FILE" restart
  ok "服务已重启"
}

rebuild_app() {
  install_docker_if_needed
  ensure_compose_available
  require_env_file
  info "重新构建并启动容器"
  compose_cmd --env-file "$ENV_FILE" up -d --build
  ok "重建完成"
}

update_app() {
  require_project_files
  install_docker_if_needed
  ensure_compose_available
  require_env_file

  if [[ ! -d "${SCRIPT_DIR}/.git" ]]; then
    error "当前目录不是 Git 仓库，无法自动拉取更新"
    exit 1
  fi

  info "拉取最新代码"
  git -C "$SCRIPT_DIR" pull --ff-only
  rebuild_app
}

uninstall_app() {
  install_docker_if_needed
  ensure_compose_available
  require_env_file

  warn "将停止并删除 CloudMail 容器"
  if ask_yes_no "确认继续卸载" "n"; then
    compose_cmd --env-file "$ENV_FILE" down --remove-orphans
    rm -f "$ENV_FILE"
    ok "卸载完成，镜像缓存仍保留在本机"
  fi
}

deploy() {
  require_project_files
  install_docker_if_needed
  ensure_compose_available
  ensure_executable_scripts

  local bind_ip host_port domain container_name image_name
  bind_ip="$(prompt_default "容器绑定地址（127.0.0.1 表示仅本机可访问，推荐用于反代避免 443 冲突）" "$DEFAULT_BIND_IP")"

  while true; do
    host_port="$(prompt_default "宿主机映射端口" "$DEFAULT_HOST_PORT")"
    if ! validate_port "$host_port"; then
      warn "请输入 1-65535 之间的有效端口"
      continue
    fi
    if [[ "$host_port" == "443" ]]; then
      warn "不建议直接映射 443；同机多站点时应统一由现有反代服务接管 443"
      ask_yes_no "仍然继续使用 443" "n" || continue
    fi
    if port_in_use "$host_port"; then
      warn "端口 ${host_port} 已被占用，请换一个端口"
      continue
    fi
    break
  done

  domain="$(prompt_default "域名（可留空，仅用于反代配置提示）" "$DEFAULT_DOMAIN")"
  container_name="$(prompt_default "容器名称" "$DEFAULT_CONTAINER_NAME")"
  image_name="$(prompt_default "镜像名称" "$DEFAULT_IMAGE_NAME")"

  write_env_file "$bind_ip" "$host_port" "$domain" "$container_name" "$image_name"

  info "开始构建并启动 Docker 服务"
  compose_cmd --env-file "$ENV_FILE" up -d --build

  if [[ "$bind_ip" != "127.0.0.1" ]]; then
    allow_firewall_port "$host_port"
  fi

  echo
  ok "${APP_NAME} Docker 部署完成"
  echo "项目目录: ${SCRIPT_DIR}"
  echo "容器名称: ${container_name}"
  echo "镜像名称: ${image_name}"
  echo "访问方式: http://${bind_ip}:${host_port}"
  if [[ "$bind_ip" == "127.0.0.1" ]]; then
    echo "说明: 当前仅监听本机 ${host_port}，不会与其他站点抢占 443"
    print_proxy_hint "$domain" "$host_port"
  else
    echo "说明: 当前已直接对外暴露 ${host_port}，如需 HTTPS 建议仍由现有反代统一接管 443"
  fi
  echo "后续管理: bash ./cloudmail-oneclick.sh"
  echo
}

print_menu() {
  echo
  echo "=========== CloudMail Docker 一键脚本 ==========="
  echo "1) 一键部署 / 重装"
  echo "2) 查看状态"
  echo "3) 查看日志"
  echo "4) 启动服务"
  echo "5) 停止服务"
  echo "6) 重启服务"
  echo "7) 重新构建"
  echo "8) 拉取代码并更新"
  echo "9) 输出 443 反代配置示例"
  echo "10) 卸载"
  echo "0) 退出"
  echo "================================================="
}

interactive_main() {
  while true; do
    print_menu
    printf '请选择 [0-10]: ' >&2
    read -r choice
    choice="$(trim "$choice")"
    case "$choice" in
      1) deploy ;;
      2) status_app ;;
      3) logs_app ;;
      4) start_app ;;
      5) stop_app ;;
      6) restart_app ;;
      7) rebuild_app ;;
      8) update_app ;;
      9)
        load_env
        print_proxy_hint "${CLOUDMAIL_DOMAIN:-}" "${CLOUDMAIL_HOST_PORT}"
        ;;
      10) uninstall_app ;;
      0) exit 0 ;;
      *) warn "无效选项" ;;
    esac
  done
}

main() {
  case "${1:-}" in
    deploy) deploy ;;
    status) status_app ;;
    logs) logs_app ;;
    start) start_app ;;
    stop) stop_app ;;
    restart) restart_app ;;
    rebuild) rebuild_app ;;
    update) update_app ;;
    proxy)
      load_env
      print_proxy_hint "${CLOUDMAIL_DOMAIN:-}" "${CLOUDMAIL_HOST_PORT}"
      ;;
    uninstall) uninstall_app ;;
    "") interactive_main ;;
    *)
      error "不支持的命令: $1"
      echo "可用命令: deploy | status | logs | start | stop | restart | rebuild | update | proxy | uninstall"
      exit 1
      ;;
  esac
}

main "$@"
