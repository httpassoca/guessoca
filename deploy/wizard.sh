#!/usr/bin/env bash
#
# Deploy do Guessoca no VPS: os passos que só uma pessoa faz (segredos do GitHub, DNS,
# bloco do nginx + certificado) e a prova final de que guess.passoca.dev responde com HTTPS e WebSocket.
# Gerado pelo /wizard. Rode da raiz do repo: bash deploy/wizard.sh
#
# Everything above the "STAGES" marker is the wizard library: do not hand-edit
# it. Author the per-step stages below the marker.

set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Wizard library: delightful, consistent UX, identical across every wizard.
# ──────────────────────────────────────────────────────────────────────────

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
  BOLD=$(tput bold); DIM=$(tput dim); RESET=$(tput sgr0)
  BLUE=$(tput setaf 4); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3)
else
  BOLD=""; DIM=""; RESET=""; BLUE=""; GREEN=""; YELLOW=""
fi

# Author sets this at the top of the stages section.
TOTAL_STAGES=0

_STAGE_INDEX=0
ENV_FILE="${ENV_FILE:-.env}"
WRITTEN_ENV=()    # KEYs written to ENV_FILE this run
WRITTEN_SECRET=() # secret NAMEs set this run
SKIPPED=()        # things we couldn't do (e.g. gh missing)

# _clear wipes the terminal so only the current step is on screen. No-op when
# output isn't a terminal, so piped logs stay readable.
_clear() {
  [[ -t 1 ]] || return 0
  if command -v tput >/dev/null 2>&1 && tput clear 2>/dev/null; then return 0; fi
  printf '\033[2J\033[3J\033[H'
}

# banner "Title" shows the opening frame: what this wizard does.
banner() {
  _clear
  printf '\n%s%s  %s%s\n' "$BOLD" "$BLUE" "$1" "$RESET"
  printf '%s  %s stages%s\n\n' "$DIM" "$TOTAL_STAGES" "$RESET"
  printf '%s  You drive the browser; this wizard tells you exactly what to do and\n' "$DIM"
  printf '  captures the values you copy back. Stop any time with Ctrl-C and re-run\n'
  printf '  later, since it remembers values already saved.%s\n' "$RESET"
  pause "Ready to start?"
}

# stage "Name" clears the screen, then announces a stage and shows progress.
# Clearing keeps only the current step on screen.
stage() {
  _clear
  _STAGE_INDEX=$((_STAGE_INDEX + 1))
  printf '\n%s%s▸ Stage %s/%s · %s%s\n' \
    "$BOLD" "$BLUE" "$_STAGE_INDEX" "$TOTAL_STAGES" "$1" "$RESET"
}

# say "..." prints a plain instruction line.
say()  { printf '  %s\n' "$1"; }
# step "..." is a numbered-feeling action the human takes in the browser.
step() { printf '  %s•%s %s\n' "$BLUE" "$RESET" "$1"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
warn() { printf '  %s⚠ %s%s\n' "$YELLOW" "$1" "$RESET"; }

# open_url URL opens it in the human's browser, cross-platform incl. WSL.
open_url() {
  local url="$1"
  printf '  %s↗ opening%s %s\n' "$GREEN" "$RESET" "$url"
  { if   command -v wslview     >/dev/null 2>&1; then wslview "$url"
    elif command -v explorer.exe >/dev/null 2>&1; then explorer.exe "$url"
    elif command -v xdg-open    >/dev/null 2>&1; then xdg-open "$url"
    elif command -v open        >/dev/null 2>&1; then open "$url"
    else false; fi
  } >/dev/null 2>&1 || warn "couldn't open a browser, so visit it manually: $url"
}

# pause "msg" waits for the human to confirm they've done the manual part.
pause() {
  printf '  %s%s%s ' "$DIM" "${1:-Press Enter to continue}" "$RESET"
  read -r _ || true
}

# confirm "question" is a y/N gate; returns success on yes.
confirm() {
  local reply=""
  printf '  %s? %s [y/N] ' "$YELLOW" "$1"
  read -r reply || true
  [[ "$reply" =~ ^[Yy] ]]
}

# _existing KEY: current value of KEY in ENV_FILE, if any, with write_env's single
# quotes or a plain dotenv double-quoted value undone.
_existing() {
  [[ -f "$ENV_FILE" ]] || return 1
  local line value sq="'\\''"; line=$(grep -E "^${1}=" "$ENV_FILE" | tail -n1) || return 1
  value="${line#*=}"
  if [[ "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; value="${value//"$sq"/\'}"
  elif [[ "$value" == \"*\" ]]; then
    value="${value:1:${#value}-2}"
    [[ "$value" == *[\\\$\"]* ]] && return 1   # escapes, $ or ": can't decode safely; ask again
  fi
  printf '%s' "$value"
}

# ask KEY "Prompt" reads a value into $KEY. Offers the existing .env value as
# a default on re-runs (Enter keeps it). Visible input (non-secret), edited
# with Readline. Fails at EOF with no input.
ask() {
  local key="$1" prompt="$2" current input s=$'\001' e=$'\002' p rc=0
  current=$(_existing "$key" || true)
  # Readline needs the colour codes wrapped in \001..\002 to place the cursor.
  p="  $s$BOLD$e$prompt$s$RESET$e "
  [[ -n "$current" ]] && p+="$s$DIM$e[Enter keeps current]$s$RESET$e "
  read -e -r -p "$p" input || rc=1
  if (( rc )) && [[ -z "$input" ]]; then return 1; fi
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# ask_secret KEY "Prompt" is like ask, but input is hidden.
ask_secret() {
  local key="$1" prompt="$2" current input rc=0
  current=$(_existing "$key" || true)
  if [[ -n "$current" ]]; then
    printf '  %s%s%s %s[Enter keeps current]%s ' "$BOLD" "$prompt" "$RESET" "$DIM" "$RESET"
  else
    printf '  %s%s%s ' "$BOLD" "$prompt" "$RESET"
  fi
  read -rs input || rc=1
  printf '\n'
  if (( rc )) && [[ -z "$input" ]]; then return 1; fi
  [[ -z "$input" && -n "$current" ]] && input="$current"
  printf -v "$key" '%s' "$input"
}

# write_env KEY VALUE upserts KEY='VALUE' into ENV_FILE (replaces any existing
# line) and sets $KEY. Idempotent. Creates ENV_FILE at mode 0600; writes through
# a symlink and keeps an existing file's mode.
write_env() {
  local key="$1" value="$2" tmp sq="'\\''"
  [[ -e "$ENV_FILE" ]] || (umask 077 && : > "$ENV_FILE")
  tmp=$(mktemp)
  grep -vE "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf "%s='%s'\n" "$key" "${value//\'/$sq}" >> "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
  printf -v "$key" '%s' "$value"
  WRITTEN_ENV+=("$key")
  printf '  %s✓ wrote%s %s → %s\n' "$GREEN" "$RESET" "$key" "$ENV_FILE"
}

# set_secret NAME VALUE sets a GitHub Actions repo secret via gh. Falls back
# to a warning (and records it) if gh is unavailable or unauthenticated.
set_secret() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if printf '%s' "$value" | gh secret set "$name" >/dev/null 2>&1; then
      WRITTEN_SECRET+=("$name")
      printf '  %s✓ set%s GitHub secret %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub secret $name (set it manually: gh secret set $name)")
  warn "skipped GitHub secret $name: gh not ready; set it later"
}

# set_var NAME VALUE sets a GitHub Actions repo variable (non-secret).
set_var() {
  local name="$1" value="$2"
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    if gh variable set "$name" --body "$value" >/dev/null 2>&1; then
      printf '  %s✓ set%s GitHub variable %s\n' "$GREEN" "$RESET" "$name"
      return
    fi
  fi
  SKIPPED+=("GitHub variable $name")
  warn "skipped GitHub variable $name, gh not ready; set it later"
}

# finish clears, then shows a closing summary of everything configured.
finish() {
  _clear
  printf '\n%s%s  ✓ Setup complete%s\n' "$BOLD" "$GREEN" "$RESET"
  (( ${#WRITTEN_ENV[@]} ))    && note "wrote ${#WRITTEN_ENV[@]} value(s) to $ENV_FILE: ${WRITTEN_ENV[*]}"
  (( ${#WRITTEN_SECRET[@]} )) && note "set ${#WRITTEN_SECRET[@]} GitHub secret(s): ${WRITTEN_SECRET[*]}"
  if (( ${#SKIPPED[@]} )); then
    printf '\n'; warn "still to do by hand:"
    for s in "${SKIPPED[@]}"; do note "  - $s"; done
  fi
  printf '\n'
}

# ──────────────────────────────────────────────────────────────────────────
# STAGES: author this section. One stage() per step the human takes.
# Replace the example below. Set TOTAL_STAGES to match the stages you write.
# Keep every stage inside run_wizard and the last line as is: bash then parses
# the whole file before the first prompt, so an edit mid-run can't break it.
# ──────────────────────────────────────────────────────────────────────────

run_wizard() {

TOTAL_STAGES=5
DOMAIN="guess.passoca.dev"
PORT=3003
REPO="httpassoca/guessoca"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGINX_SRC="$REPO_DIR/deploy/$DOMAIN.nginx"
cd "$REPO_DIR"

banner "Deploy do Guessoca em $DOMAIN"

# ── 1. SSH secrets ────────────────────────────────────────────────────────
stage "GitHub: os três segredos de SSH do workflow"
say "O workflow .github/workflows/deploy.yml copia a imagem para o VPS e sobe o container por SSH."
say "Ele lê SSH_HOST, SSH_USER e SSH_KEY dos segredos do repo: os mesmos valores do trucossoca e do passoca-api."
note "Se o gh estiver logado, o wizard grava os segredos; senão abre a página para colar à mão."
note "O .env do trucossoca (~/dev/trucossoca/.env) já tem esses valores, se quiser copiar de lá."
ask SSH_HOST "Host do VPS (IP ou hostname):"
ask SSH_USER "Usuário SSH nesse host:"
ask SSH_KEY_PATH "Caminho da chave privada que entra no VPS (ex.: ~/.ssh/id_ed25519):"
SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
if [[ ! -r "$SSH_KEY_PATH" ]]; then
  warn "não consegui ler $SSH_KEY_PATH; confira o caminho e rode de novo"
  exit 1
fi
write_env SSH_HOST "$SSH_HOST"
write_env SSH_USER "$SSH_USER"
write_env SSH_KEY_PATH "$SSH_KEY_PATH"
if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
  open_url "https://github.com/$REPO/settings/secrets/actions"
  step "New repository secret três vezes: SSH_HOST, SSH_USER e SSH_KEY (o conteúdo inteiro de $SSH_KEY_PATH)."
  pause "Colou os três? Enter para continuar."
fi
set_secret SSH_HOST "$SSH_HOST"
set_secret SSH_USER "$SSH_USER"
set_secret SSH_KEY "$(cat "$SSH_KEY_PATH")"$'\n'  # $(…) come a quebra final; o OpenSSH quer a chave com ela
say "Testando o acesso: ssh $SSH_USER@$SSH_HOST"
if ssh -i "$SSH_KEY_PATH" -o BatchMode=yes -o ConnectTimeout=10 "$SSH_USER@$SSH_HOST" \
  "docker --version && test -d /etc/nginx && echo nginx ok && (ss -ltn | grep -q ':$PORT ' && echo 'ATENÇÃO: a porta $PORT já está ocupada' || echo 'porta $PORT livre')" 2>&1 | sed 's/^/    /'; then
  say "${GREEN}✓${RESET} SSH, docker e nginx respondem no VPS."
else
  warn "o SSH não entrou (ou docker/nginx faltam). O deploy vai falhar até isso estar certo."
  confirm "Seguir mesmo assim?" || exit 1
fi
pause

# ── 2. DNS ────────────────────────────────────────────────────────────────
stage "DNS: $DOMAIN aponta para o VPS"
say "O certbot valida o domínio por HTTP, então o DNS precisa resolver antes do certificado."
step "No painel de DNS de passoca.dev (onde truco.passoca.dev já está), crie um registro A:"
say "    nome:  guess      tipo: A      valor: o IP do VPS (o mesmo de truco)      TTL: o menor"
note "Se truco.passoca.dev tem AAAA, crie o AAAA correspondente; senão, não crie."
pause "Criou o registro? Enter para checar a propagação."
resolved=""
for _ in 1 2 3 4 5 6; do
  resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
  [[ -n "$resolved" ]] && break
  say "ainda não resolve, esperando 10 s…"; sleep 10
done
if [[ -n "$resolved" ]]; then
  say "${GREEN}✓${RESET} $DOMAIN → $resolved"
  [[ "$resolved" != "$SSH_HOST" ]] && note "(diferente de SSH_HOST=$SSH_HOST; tudo bem se o host é um nome e não o IP)"
else
  warn "$DOMAIN ainda não resolve daqui; a propagação pode demorar. O certbot no passo 4 vai falhar até resolver."
  confirm "Seguir mesmo assim?" || exit 1
fi

# ── 3. nginx ──────────────────────────────────────────────────────────────
stage "nginx: bloco do servidor com upgrade de WebSocket"
say "O bloco está versionado em deploy/$DOMAIN.nginx (proxy para 127.0.0.1:$PORT com os headers de Upgrade)."
say "O wizard copia o arquivo para /tmp no VPS; o resto precisa de sudo, então é você quem roda."
if scp -i "$SSH_KEY_PATH" -o BatchMode=yes "$NGINX_SRC" "$SSH_USER@$SSH_HOST:/tmp/$DOMAIN" >/dev/null 2>&1; then
  say "${GREEN}✓${RESET} copiado para /tmp/$DOMAIN no VPS"
else
  warn "scp falhou; copie deploy/$DOMAIN.nginx para /tmp/$DOMAIN no VPS à mão"
fi
step "Em outro terminal: ssh $SSH_USER@$SSH_HOST e rode:"
printf '\n'
cat <<CMDS
    sudo mv /tmp/$DOMAIN /etc/nginx/sites-available/$DOMAIN
    sudo ln -sfn /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
    sudo nginx -t && sudo systemctl reload nginx
CMDS
printf '\n'
note "Mesmo layout do truco.passoca.dev (sites-available/sites-enabled)."
pause "Rodou os três comandos sem erro? Enter para checar."
http_status="$(curl -sS --max-time 10 -o /dev/null -w '%{http_code}' "http://$DOMAIN/health" 2>/dev/null || true)"
case "$http_status" in
  200) say "${GREEN}✓${RESET} nginx encaminha para o container (200)" ;;
  502|504) say "${GREEN}✓${RESET} o bloco está ativo (nginx respondeu $http_status: o container ainda não subiu, o deploy vem no fim)" ;;
  *) warn "http://$DOMAIN/health voltou '$http_status': o bloco não está ativo (symlink, nginx -t, DNS?)"
     confirm "Seguir mesmo assim?" || exit 1 ;;
esac

# ── 4. certificado ────────────────────────────────────────────────────────
stage "HTTPS: certificado do Let's Encrypt"
say "O cliente abre wss:// quando a página vem por https://, então sem certificado o WebSocket não conecta."
step "No mesmo terminal do VPS:"
printf '\n'
cat <<CMDS
    sudo certbot --nginx -d $DOMAIN
CMDS
printf '\n'
note "O certbot acrescenta o listen 443 e o redirect de 80 ao bloco, como fez com truco.passoca.dev."
pause "Certificado emitido e nginx recarregado? Enter para o deploy."

# ── 5. primeiro deploy e prova ────────────────────────────────────────────
stage "Deploy: push na main e prova de que o site responde"
say "O workflow roda a cada push na main. Se a main já está no GitHub, dá para reexecutar o último run."
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  if confirm "Disparar agora reexecutando o último run do Deploy e acompanhar?"; then
    run_id="$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
    if [[ -n "$run_id" && "$run_id" != null ]]; then
      gh run rerun "$run_id" >/dev/null 2>&1 || true
      sleep 5
      gh run watch "$run_id" --exit-status || warn "o run falhou; veja gh run view $run_id --log"
    else
      note "nenhum run ainda: faça um push na main (git push origin main) e volte."
      pause
    fi
  fi
else
  step "Faça um push na main e acompanhe em https://github.com/$REPO/actions"
  pause "Deploy verde? Enter para provar de fora."
fi

say "Provando https://$DOMAIN/health:"
if curl -fsS --max-time 10 "https://$DOMAIN/health"; then
  printf '\n'; say "${GREEN}✓${RESET} HTTPS responde"
else
  warn "https://$DOMAIN/health não respondeu"; SKIPPED+=("https://$DOMAIN/health não respondeu: veja nginx e o container")
fi
say "Provando o upgrade de WebSocket por dentro do nginx (espera HTTP 101):"
# --http1.1: com HTTP/2 negociado no 443 não existe Upgrade, e a prova acusaria o nginx sem motivo
ws_status="$(curl -sS --http1.1 --max-time 5 -o /dev/null -w '%{http_code}' \
  -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  "https://$DOMAIN/ws?room=ZZZZ&token=wizardwizard" 2>/dev/null || true)"
if [[ "$ws_status" == "101" ]]; then
  say "${GREEN}✓${RESET} WebSocket atravessa o nginx (101 Switching Protocols)"
else
  warn "o handshake voltou '$ws_status' em vez de 101: confira os headers Upgrade/Connection no bloco do nginx"
  SKIPPED+=("WebSocket em wss://$DOMAIN/ws não fez upgrade (status $ws_status)")
fi
say "Abra https://$DOMAIN, crie uma sala e entre com outra aba: se as duas se veem na sala, está no ar."
pause

finish
}

run_wizard "$@"; exit
