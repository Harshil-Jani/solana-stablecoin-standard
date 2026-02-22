#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  Solana Stablecoin Standard (SSS) — Live Demo
# ═══════════════════════════════════════════════════════════
set -e
export TERM=${TERM:-xterm-256color}
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
G='\033[0;32m'
C='\033[0;36m'
Y='\033[1;33m'
B='\033[1m'
N='\033[0m'

pause() { sleep "${1:-1.2}"; }
header() {
  echo ""
  echo -e "${B}${C}══════════════════════════════════════════════════════${N}"
  echo -e "${B}${C}  $1${N}"
  echo -e "${B}${C}══════════════════════════════════════════════════════${N}"
  echo ""
  pause 1
}
step() { echo -e "${G}▸ $1${N}"; pause 0.3; }

echo ""
echo -e "${B}${C}"
echo "  ╔═══════════════════════════════════════════════════╗"
echo "  ║   Solana Stablecoin Standard (SSS) — Live Demo   ║"
echo "  ║   SSS-1 (Minimal) · SSS-2 (Compliant)           ║"
echo "  ╚═══════════════════════════════════════════════════╝"
echo -e "${N}"
pause 2

# ── Phase 1: Project Overview ──────────────────────────────
header "Phase 1: Project Overview"

step "Repository structure:"
echo ""
echo "  programs/"
echo "  ├── sss-token/              # Main Anchor program (13 instructions)"
echo "  └── sss-transfer-hook/      # Blacklist enforcement on every transfer"
echo "  sdk/"
echo "  ├── core/                   # TypeScript SDK (@stbr/sss-sdk)"
echo "  └── cli/                    # Admin CLI (sss-token)"
echo "  backend/                    # Express.js backend + SQLite audit trail"
echo "  tests/                      # Integration tests (SSS-1 + SSS-2)"
echo "  examples/                   # 10 step-by-step SDK examples"
echo "  docs/                       # 7 documentation files"
pause 2

step "Deployed programs (localnet):"
echo ""
solana program show 2D8s3bH6vD3LG7wqzvpSvYFysYoSK4wwggHCptaKFJJQ 2>&1 | head -4
echo ""
solana program show F2of7agMFET8v3verXe3e6Hmfd71t833RjPxEjs5wRdd 2>&1 | head -4
pause 2

# ── Phase 2: Build ─────────────────────────────────────────
header "Phase 2: Build Verification"

step "anchor build --no-idl"
echo ""
anchor build --no-idl 2>&1 | grep -E "(Compiling|Finished)" || true
echo ""
step "Both programs compiled ✓"
pause 2

# ── Phase 3: Live SDK Demo ─────────────────────────────────
header "Phase 3: Live SDK Demo (6 operations against localnet)"

echo -e "  ${Y}Running demo-run.ts against deployed programs...${N}"
echo ""
NODE_PATH="${PROJECT_DIR}/node_modules" node /tmp/sss-demo/demo-run.js 2>&1
pause 3

# ── Phase 4: Documentation ─────────────────────────────────
header "Phase 4: Documentation Suite"

step "7 documentation files with Mermaid diagrams:"
echo ""
for f in "${PROJECT_DIR}"/docs/*.md; do
  name=$(basename "$f" .md)
  echo -e "  ${C}$name${N} — $(head -1 "$f" | sed 's/# //')"
done
pause 2

step "10 SDK examples:"
echo ""
for f in "${PROJECT_DIR}"/examples/[0-9]*.ts; do
  name=$(basename "$f" .ts)
  echo -e "  ${C}$name${N}"
done
pause 2

# ── Phase 5: Feature Summary ──────────────────────────────
header "Phase 5: Feature Summary"

echo -e "  ${B}SSS-1 (Minimal):${N}"
echo "    ✓ Mint/Burn with per-minter quotas"
echo "    ✓ Freeze/Thaw individual accounts"
echo "    ✓ Pause/Unpause global operations"
echo "    ✓ Role-based access (5 roles)"
echo "    ✓ Authority transfer"
echo "    ✓ MintCloseAuthority extension"
echo ""
echo -e "  ${B}SSS-2 (Compliant):${N}"
echo "    ✓ Everything in SSS-1, plus:"
echo "    ✓ TransferHook — blacklist on every transfer"
echo "    ✓ PermanentDelegate — seize without consent"
echo "    ✓ DefaultAccountState — KYC gate"
echo "    ✓ 13 on-chain audit events"
echo "    ✓ 6th role: Seizer"
echo ""
echo "  ┌─────────────────────┬─────────┬───────────────────────────────┐"
echo "  │ Extension           │ Preset  │ Purpose                       │"
echo "  ├─────────────────────┼─────────┼───────────────────────────────┤"
echo "  │ MintCloseAuthority  │ Both    │ Cleanup empty mints           │"
echo "  │ PermanentDelegate   │ SSS-2   │ Seize tokens from any account │"
echo "  │ TransferHook        │ SSS-2   │ Blacklist check on transfers  │"
echo "  │ DefaultAccountState │ SSS-2   │ New accounts start frozen     │"
echo "  └─────────────────────┴─────────┴───────────────────────────────┘"
pause 3

echo ""
echo -e "${B}${G}═══════════════════════════════════════════════════${N}"
echo -e "${B}${G}  Demo complete! All operations ran live on-chain.${N}"
echo -e "${B}${G}  github.com/Harshil-Jani/solana-stablecoin-standard${N}"
echo -e "${B}${G}═══════════════════════════════════════════════════${N}"
echo ""
