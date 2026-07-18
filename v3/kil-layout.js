/* KEEPITIL kil-layout.js — public renderer for WBUILDER page layouts.
   READS PUBLISHED ROWS ONLY (get_page_layout_public) — drafts are invisible by construction.
   NOT YET WIRED into any live page: per Founder directive the live rendering path stays
   untouched until Publish is approved. To activate on a page later:
     <div data-kil-layout="grow.html"></div>
     <script src="/v3/kil-layout.js?v=YYYYMMDD" defer></script> */
(function(){
  var mount=document.querySelector('[data-kil-layout]');
  if(!mount) return;
  var page=mount.getAttribute('data-kil-layout');
  var bp=(window.matchMedia&&window.matchMedia('(max-width:860px)').matches)?'mobile':'desktop';
  var URL='https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function styleOf(w){
    var st=(w.props&&w.props.style)||{}; var css='';
    if(st.w)css+='width:'+st.w+';'; if(st.h)css+='height:'+st.h+';';
    if(st.pad!=null)css+='padding:'+st.pad+'px;'; if(st.margin!=null)css+='margin-bottom:'+st.margin+'px;';
    if(st.radius!=null)css+='border-radius:'+st.radius+'px;';
    if(st.align==='center')css+='margin-left:auto;margin-right:auto;';
    if(st.align==='right')css+='margin-left:auto;margin-right:0;';
    return css;
  }
  function renderW(w){
    var p=w.props||{}, st=p.style||{};
    if(w.type==='heading') return '<div style="'+styleOf(w)+'font-family:\'Bebas Neue\',Inter,sans-serif;font-size:'+(st.fs||34)+'px;font-weight:900;text-align:'+(st.textAlign||'left')+';color:'+(st.color||'#f0f0f0')+'">'+esc(p.text||'')+'</div>';
    if(w.type==='text') return '<div style="'+styleOf(w)+'font-size:'+(st.fs||15)+'px;line-height:1.6;text-align:'+(st.textAlign||'left')+';color:'+(st.color||'#c9cede')+'">'+(p.html||'')+'</div>';
    if(w.type==='image'){
      if(!p.src) return '';
      var crop=p.crop||{};
      var frame='overflow:hidden;position:relative;width:100%;'+(crop.aspect&&crop.aspect!=='free'?'aspect-ratio:'+crop.aspect+';':'height:'+(st.h||'220px')+';')+'border-radius:'+(st.radius!=null?st.radius:10)+'px;';
      return '<div style="'+styleOf(w)+frame+'"><img src="'+esc(p.src)+'" alt="'+esc(p.alt||'')+'" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover;object-position:'+(crop.ox!=null?crop.ox:50)+'% '+(crop.oy!=null?crop.oy:50)+'%;transform:scale('+((crop.zoom||100)/100)+')"></div>';
    }
    if(w.type==='button') return '<div style="'+styleOf(w)+'text-align:'+(st.textAlign||'left')+'"><a href="'+esc(p.href||'#')+'" style="display:inline-block;background:'+(st.bg||'#00b4ff')+';color:'+(st.color||'#04121b')+';font-weight:800;font-size:'+(st.fs||14)+'px;padding:'+(st.padV!=null?st.padV:11)+'px '+(st.padH!=null?st.padH:22)+'px;border-radius:'+(st.radius!=null?st.radius:999)+'px;text-decoration:none;'+(st.w?'width:'+st.w+';text-align:center;':'')+'">'+esc(p.label||'')+'</a></div>';
    if(w.type==='spacer') return '<div style="height:'+(p.h||32)+'px"></div>';
    if(w.type==='embed') return '<div style="'+styleOf(w)+'">'+(p.html||'')+'</div>';
    return '';
  }
  fetch(URL+'/rest/v1/rpc/get_page_layout_public',{
    method:'POST',
    headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},
    body:JSON.stringify({p_page:page,p_breakpoint:bp})
  }).then(function(r){return r.json();}).then(function(tree){
    if(!Array.isArray(tree)||!tree.length) return;   // no published layout -> leave the page exactly as authored
    mount.innerHTML=tree.map(function(s){
      return '<section style="background:'+((s.props&&s.props.bg)||'transparent')+';padding:'+((s.props&&s.props.pad)!=null?s.props.pad:14)+'px">'+(s.children||[]).map(renderW).join('')+'</section>';
    }).join('');
  }).catch(function(){});
})();
