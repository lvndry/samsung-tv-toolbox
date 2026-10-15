# Remote access to the TV (off-LAN)

*Resumed from: "can I access the TV from remote or must I be on the same network?"*

The TV has no public address — off-LAN it's unreachable as things stand. Two paths:

## Path A — Tailscale natively on the TV (preferred, fully personal)
- No official Tizen app exists (Tizen ≠ Android; APK suggestions on Reddit are for Android TV).
- Experimental community app: github.com/tailscale/tailscale-tizen —
  .NET NUI app + userspace `tailscaled` subprocess (gVisor netstack, no TUN/root),
  QR-code login to a PERSONAL tailnet, optional exit node.
- Members: TV + Mac + phone. No always-on home node needed at all.
- Install = sideload a signed .tpk → needs a Samsung developer profile →
  which is exactly what our jailbreak track (sdb `install` / SVE-2025-50109)
  unlocks. So Path A is "after the exploit".

## Path B — Always-on personal node at home (no company infra)
- **Constraint (user, 2026-10-15): personal devices must not route through
  professional infrastructure (lysk-server).** A subnet route via the company
  box is therefore ruled out.
- Options, best first:
  1. **Home router as the Tailscale node** (if the router is OpenWrt/keezey
     friendly): `tailscale up` on the router, advertise 192.168.1.0/24,
     personal tailnet.
  2. **Tiny personal always-on box at home** (Pi / mini-PC on the home LAN,
     personal tailnet, `--advertise-routes=192.168.1.0/24`).
- Covers: this remote, sdb (after a cold boot), everything.

## Not recommended
- Port-forwarding 8002/26101 to the internet: 2021 Linux box with 2015-era TLS
  on the public net. If you must, VPN in front of it.
- SmartThings: official, works from anywhere, but crippled (power/volume/mute/open app only).

## State when this was written
- TV: dev mode on, dev IP 192.168.1.7, sdbd wakes after COLD boot (unplug 30s).
- remote.js + token.txt work from the Mac over LAN; sdb connects on 26101 after cold boot.
- shell:0 stubbed on this firmware; REA+Ghidra armed; firmware download blocked on CDN 403.
