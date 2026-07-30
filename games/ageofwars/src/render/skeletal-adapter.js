/* KWSkeletal — skeletal/sprite render path (Evolution Directive §4, Volume 0).
 *
 * Third branch of the renderer selector in drawRigUnit():
 *   procedural (KWRig.drawSoldier) | lite (KWRig.drawSoldierLite) | skeletal (this)
 *
 * The game keeps its animation-state contract (idle, march, run, attack, overhead,
 * fury, throw, die_kneel, die_back, die_impale — giants: idle, walk, slam, stomp,
 * roar, die). This module maps state→clip and draws either:
 *   mode "sheet"  — pre-rendered side-view atlas (Blender), fully supported here.
 *   mode "spine"  — runtime skeleton; activates only when a runtime + export are
 *                   provided per assets/skeletal/README.md (dormant until then).
 *
 * DORMANT BY DEFAULT: nothing loads unless assets/skeletal/manifest.json exists
 * and registers a class. Missing clip → idle. Missing/failed asset → the class
 * reports not-ready and the procedural rig keeps drawing it. Additive only.
 */
(function(){
  'use strict';
  const classes = Object.create(null);   // cls -> {mode, ready, sheet, meta, error}
  let manifestTried = false;

  // Fallback chain per contract: a missing clip degrades to something sensible.
  const CLIP_FALLBACK = {
    run:'march', sprint:'run', charge:'run', overhead:'attack', fury:'attack',
    throw:'attack', die_back:'die_kneel', die_impale:'die_kneel',
    walk:'march', slam:'attack', stomp:'attack', roar:'idle', die:'die_kneel'
  };

  function resolveClip(meta, st){
    let s = st, hops = 0;
    while (s && hops++ < 5){
      if (meta.clips[s]) return meta.clips[s];
      s = CLIP_FALLBACK[s];
    }
    return meta.clips.idle || null;
  }

  function loadSheetClass(cls, cfg, base){
    const entry = classes[cls] = { mode:'sheet', ready:false };
    fetch(base + cfg.meta).then(r => { if(!r.ok) throw Error('meta '+r.status); return r.json(); })
      .then(meta => new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res({ meta, img });
        img.onerror = () => rej(Error('sheet image failed'));
        img.src = base + cfg.sheet;
      }))
      .then(({ meta, img }) => { entry.meta = meta; entry.sheet = img; entry.ready = true; })
      .catch(e => { entry.error = String(e); });   // stays not-ready; procedural rig covers it
  }

  function loadSpineClass(cls, cfg, base){
    // Runtime-skeleton slot: kept dormant until the artist runtime + export exist.
    // When cfg.runtime (a vendor player script) is present it is loaded lazily and
    // must register window.KWSkeletalRuntime = { load(dir)→player, draw(...) }.
    const entry = classes[cls] = { mode:'spine', ready:false };
    if (!cfg.runtime){ entry.error = 'no runtime configured'; return; }
    const s = document.createElement('script');
    s.src = base + cfg.runtime;
    s.onload = () => {
      const rt = window.KWSkeletalRuntime;
      if (!rt || typeof rt.load !== 'function'){ entry.error = 'runtime missing KWSkeletalRuntime.load'; return; }
      Promise.resolve(rt.load(base + (cfg.dir || cls + '/')))
        .then(player => { entry.player = player; entry.ready = true; })
        .catch(e => { entry.error = String(e); });
    };
    s.onerror = () => { entry.error = 'runtime script failed to load'; };
    document.head.appendChild(s);
  }

  function init(base){
    // Auto-init runs once with the default base; an explicit base (e.g. the dev
    // preview passing '../assets/skeletal/') may always re-scan.
    if (manifestTried && !base) return; manifestTried = true;
    base = base || 'assets/skeletal/';
    fetch(base + 'manifest.json').then(r => r.ok ? r.json() : null).then(man => {
      if (!man || !man.classes) return;               // no manifest → fully dormant
      for (const [cls, cfg] of Object.entries(man.classes)){
        if (cfg.mode === 'sheet' && cfg.sheet && cfg.meta) loadSheetClass(cls, cfg, base);
        else if (cfg.mode === 'spine') loadSpineClass(cls, cfg, base);
      }
    }).catch(()=>{});                                  // offline/404 → dormant
  }

  function ready(cls){ const e = classes[cls]; return !!(e && e.ready); }

  /* Draw in drawRigUnit's local space: origin at the feet, +x facing (the caller
   * already mirrored/scaled/translated), ~150 design-units tall. `st` and `p`
   * are the state name and 0..1 progress; `opts` carries the socket toggles
   * (dropShield/dropHelmet/extra), team, era and alpha from the pose object. */
  function draw(ctx, cls, st, p, opts){
    const e = classes[cls];
    if (!e || !e.ready) return false;
    opts = opts || {};
    if (e.mode === 'sheet'){
      const meta = e.meta, clip = resolveClip(meta, st);
      if (!clip) return false;
      const n = clip.frames || 1;
      const idx = clip.loop ? Math.floor((((p % 1) + 1) % 1) * n) % n
                            : Math.min(n - 1, Math.floor(Math.max(0, Math.min(1, p)) * n));
      // Scale the frame so the figure stands designH (=150) units tall in the
      // rig's local space, preserving the frame's aspect ratio.
      const fw = meta.frameW, fh = meta.frameH, dh = meta.designH || 150, dw = fw * (dh / fh);
      ctx.save();
      if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
      ctx.drawImage(e.sheet, idx * fw, (clip.row || 0) * fh, fw, fh,
                    -dw * (meta.anchorX != null ? meta.anchorX : .5),
                    -dh * (meta.anchorY != null ? meta.anchorY : 1),
                    dw, dh);
      ctx.restore();
      return true;
    }
    if (e.mode === 'spine' && e.player && window.KWSkeletalRuntime){
      // Runtime contract: draw(ctx, player, clipName, p, sockets) — mirrors/era
      // tint are the runtime's job; socket toggles arrive resolved as booleans.
      return window.KWSkeletalRuntime.draw(ctx, e.player, st, p, {
        shield: !opts.dropShield, helmet: !opts.dropHelmet,
        weapon2: !!(opts.extra && (opts.extra.dualSword || opts.extra.rage)),
        era: opts.era || 1, team: opts.team || 1, alpha: opts.alpha
      }) !== false;
    }
    return false;
  }

  window.KWSkeletal = Object.freeze({ init, ready, draw, _classes: classes });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init());
  else init();
})();
