#!/usr/bin/env python3
"""
KEEPITIL FUNCTIONAL LINK & ASSET AUDIT  (static layer)
=======================================================
Catches the classes of bug that the template/conformance audits MISS:
  1. Broken internal links     — <a href> pointing to a page that doesn't exist on disk
  2. Missing images/assets      — <img src>, <script src>, <link href>, css url() to a file that doesn't exist
  3. Runtime-redirect RISK      — pages that call location.replace/assign/href gated on URL params
                                  (this is the exact class as the crew.html->own-profile bug: an href is
                                   'valid' but the destination page bounces the visitor elsewhere in JS)

Runs fully offline against the local repo mirror. Pair with the Chrome-MCP live
smoke test (FUNCTIONAL-SMOKE-TEST.md) which actually follows JS redirects in a browser.

Usage:  python3 _scripts/audit/functional_link_audit.py
Writes: _reports/FUNCTIONAL-LINK-AUDIT-<date>.md   (exit code 1 if any broken link/asset)
"""
import os, re, sys, datetime, glob

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE_DIRS = ['v3', '.']            # scan /v3 and repo root
IGNORE_DIRS = ('_archive', '_beta-test', '_previews', '_tmp', '_build', 'node_modules', '.git')

def is_ignored(path):
    return any(seg in path for seg in IGNORE_DIRS)

def all_html():
    out = []
    for base in SITE_DIRS:
        for f in glob.glob(os.path.join(ROOT, base, '*.html')):
            if not is_ignored(f):
                out.append(f)
    return sorted(set(out))

def resolve(ref, from_file):
    """Map an internal URL ref to a local file path, or None if external/unresolvable."""
    ref = ref.strip().strip('"\'')
    if not ref: return None
    low = ref.lower()
    if low.startswith(('http://','https://','//','mailto:','tel:','data:','javascript:','#')):
        return None                      # external or in-page — not our job here
    ref = ref.split('#')[0].split('?')[0]
    if not ref: return None
    if ref.startswith('/'):
        return os.path.join(ROOT, ref.lstrip('/'))
    return os.path.normpath(os.path.join(os.path.dirname(from_file), ref))

def exists_gh(path):
    """GitHub-Pages-aware existence: '/culture' also resolves to culture.html or culture/index.html."""
    if os.path.exists(path): return True
    if os.path.exists(path + '.html'): return True
    if os.path.isdir(path) and os.path.exists(os.path.join(path, 'index.html')): return True
    if os.path.exists(os.path.join(path, 'index.html')): return True
    return False

LINK_RE   = re.compile(r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', re.I)
IMG_RE    = re.compile(r'<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', re.I)
SCRIPT_RE = re.compile(r'<script\b[^>]*\bsrc\s*=\s*["\']([^"\']+)["\']', re.I)
LINKHREF  = re.compile(r'<link\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', re.I)
REDIRECT_RE = re.compile(r'location\.(replace|assign|href\s*=)', re.I)
PARAM_RE    = re.compile(r'URLSearchParams|location\.search|[?&](a|slug|e|t)=', re.I)

def main():
    broken_links, missing_assets, redirect_risk = [], [], []
    files = all_html()
    for f in files:
        rel = os.path.relpath(f, ROOT)
        try:
            h = open(f, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        # 1) internal <a href> targets
        for m in LINK_RE.findall(h):
            if "'+" in m or '"+' in m or '${' in m: continue   # templated href
            p = resolve(m, f)
            if p and not exists_gh(p):
                broken_links.append((rel, m))
        # 2) assets: img/script/link
        for rex in (IMG_RE, SCRIPT_RE, LINKHREF):
            for m in rex.findall(h):
                p = resolve(m, f)
                # skip dynamic templated srcs like "'+a.slug+'"
                if p and ("'+" in m or '"+' in m or '${' in m): continue
                if p and not exists_gh(p):
                    missing_assets.append((rel, m))
        # 3) runtime-redirect risk
        if REDIRECT_RE.search(h) and PARAM_RE.search(h):
            redirect_risk.append(rel)

    date = datetime.date.today().isoformat()
    outp = os.path.join(ROOT, '_reports', f'FUNCTIONAL-LINK-AUDIT-{date}.md')
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    L = []
    L.append(f'# KEEPITIL Functional Link & Asset Audit — {date}\n')
    L.append(f'Scanned **{len(files)}** HTML files. Static layer — pair with the live Chrome-MCP smoke test for JS-redirect behavior.\n')
    L.append(f'**Broken links:** {len(broken_links)} · **Missing assets:** {len(missing_assets)} · **Redirect-risk pages:** {len(redirect_risk)}\n')

    L.append('\n## 🔴 Broken internal links (href → nonexistent page)')
    if broken_links:
        for rel, ref in sorted(set(broken_links)): L.append(f'- `{rel}` → `{ref}`')
    else: L.append('- none ✅')

    L.append('\n## 🟠 Missing images / assets (src/href → nonexistent file)')
    if missing_assets:
        for rel, ref in sorted(set(missing_assets)): L.append(f'- `{rel}` → `{ref}`')
    else: L.append('- none ✅')

    L.append('\n## 🟡 Runtime-redirect RISK (needs live functional check)')
    L.append('_These pages redirect based on URL params/session. Verify each ENTRY param lands correctly in a real browser (this is the crew.html→own-profile bug class)._')
    if redirect_risk:
        for rel in sorted(set(redirect_risk)): L.append(f'- `{rel}`')
    else: L.append('- none')

    open(outp, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    print(f'files:{len(files)} broken_links:{len(broken_links)} missing_assets:{len(missing_assets)} redirect_risk:{len(redirect_risk)}')
    print('report:', outp)
    return 1 if (broken_links or missing_assets) else 0

if __name__ == '__main__':
    sys.exit(main())
