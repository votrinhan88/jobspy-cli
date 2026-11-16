# Claude Code reads skills only from .claude/skills. The skills live in .agents/skills,
# which other harnesses read directly. Run this once after a clone.
$root = Split-Path -Parent $PSScriptRoot
$link = Join-Path $root ".claude\skills"
$target = Join-Path $root ".agents\skills"

if (Test-Path $link) {
    Write-Host "Already linked: $link"
    exit 0
}
New-Item -ItemType Directory -Force (Join-Path $root ".claude") | Out-Null
New-Item -ItemType Junction -Path $link -Target $target | Out-Null
Write-Host "Linked $link -> $target"
