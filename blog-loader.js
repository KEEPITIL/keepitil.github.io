/**
 * KEEP IT IL — Dynamic Blog Loader
 * Fetches published articles from Supabase blog_articles table
 * and renders them into the existing .blog-grid element.
 * Depends on global `supa` client set by index.html main script.
 */
(function () {
  var DEFAULT_IMG = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80';
  var CAT_COLORS = {
    news: '#00b4ff',
    events: '#b400ff',
    artists: '#ff0080',
    culture: '#00ffb4',
    gear: '#ffb400'
  };

  function slugToLabel(cat) {
    return cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'News';
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function renderCards(articles, grid) {
    if (!articles || articles.length === 0) return; // keep static fallback
    grid.innerHTML = '';
    articles.forEach(function (a) {
      var cat = a.category || 'news';
      var color = CAT_COLORS[cat] || '#00b4ff';
      var img = a.image_url || DEFAULT_IMG;
      var tags = (a.tags || []).slice(0, 3).map(function (t) {
        return '<span class="tag">' + t + '</span>';
      }).join('');

      var card = document.createElement('div');
      card.className = 'blog-card reveal';
      card.setAttribute('data-cat', cat);
      card.innerHTML =
        '<div style="height:180px;background:url(\'' + img + '\') center/cover no-repeat;margin:-32px -32px 20px;border-bottom:2px solid ' + color + ';"></div>' +
        '<span style="font-size:11px;font-weight:700;letter-spacing:.1em;color:' + color + ';text-transform:uppercase;">' + slugToLabel(cat) + '</span>' +
        '<h3>' + (a.title || '') + '</h3>' +
        '<p>' + (a.excerpt || '') + '</p>' +
        '<div class="article-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
          '<span style="font-size:11px;color:#666;">' + formatDate(a.published_at) + '</span>' +
          tags +
        '</div>';

      card.addEventListener('click', function () {
        if (a.source_url) window.open(a.source_url, '_blank');
      });

      grid.appendChild(card);
    });
  }

  function init() {
    var grid = document.querySelector('.blog-grid');
    if (!grid) return;

    // If no global supa client yet, retry after 500ms (race condition)
    if (typeof supa === 'undefined') {
      setTimeout(init, 500);
      return;
    }

    supa
      .from('blog_articles')
      .select('title,slug,excerpt,category,tags,image_url,source_url,published_at')
      .eq('published', true)
      .order('published_at', { ascending: false })
      .limit(9)
      .then(function (res) {
        if (res.error) {
          console.warn('[blog-loader] Supabase error:', res.error.message);
          return;
        }
        if (res.data && res.data.length > 0) {
          renderCards(res.data, grid);
          // Sync filter tabs with new cards
          if (typeof filterBlog === 'function') filterBlog('all', null);
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
