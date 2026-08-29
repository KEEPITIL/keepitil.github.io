/*!
 * Echo — KEEPITIL AI Assistant  v2.0
 * Floating chat widget | keepitil.com
 * Self-contained, zero dependencies.
 */
// Auto-load KEEPITIL Radio Bar on every page
(function(){if(!window.__kilRadioInit){var s=document.createElement('script');s.src='/assets/js/keepitil-radio.js?v=20260829a';document.head.appendChild(s);}})();
// Swap nav logo PNGs to extracted transparent X marks + resize (keepitil-radio.js handles this on load; this is a fallback)
(function(){
  function swapNavLogos(){
    document.querySelectorAll('a.nav-logo img, nav img').forEach(function(img){
      var src = img.getAttribute('src')||'';
      var m = src.match(/logo-(\w+)-nav\.png/i);
      if(!m) return;
      img.src = '/keepitil-x-' + m[1] + '.png';
      var st = img.getAttribute('style')||'';
      img.setAttribute('style', st.replace(/mix-blend-mode\s*:\s*\w+\s*;?/gi,''));
      img.style.mixBlendMode = '';
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',swapNavLogos);}
  else{swapNavLogos();}
})();
(function () {
  /* The §C hard-coded bail-out on profile.html is GONE.
     The owner turned chat back on there, and KIL_FLOATING in keepitil-shell.js is now the one
     place that decides which pages get the chat button and the arrow. A return here would have
     overridden that table silently: config would say chat:true for profile and the button
     still would not exist, with nothing in the config to explain why. One owner, not two. */

  'use strict';

  // ── Already loaded guard ────────────────────────────────────────────────────
  if (window.__kiloLoaded) return;
  window.__kiloLoaded = true;

  // ── Theme ────────────────────────────────────────────────────────────────────
  var C = {
    bg:      '#0f0f1a',
    panel:   '#151520',
    bubble:  '#1a1a2e',
    border:  'rgba(0,180,255,.14)',
    green:   '#00ff88',
    blue:    '#00b4ff',
    grey:    '#888',
    white:   '#e8e8f0',
    font:    "'Inter','Helvetica Neue',sans-serif",
    head:    "'Bebas Neue','Inter',sans-serif",
  };

  // ── Knowledge base ───────────────────────────────────────────────────────────
  var KB = [
    {
      id: 'events',
      kw: ['event','show','concert','festival','upcoming','tonight','weekend','week','calendar','schedule','rave','party','find event','what\'s on','whats on','where to go','going out','nightlife'],
      title: '🎉 Events',
      text: 'KEEPITIL curates music events across Southern California — concerts, club nights, festivals, raves, pop-ups, and more. Our KEEPITIL PICK badges highlight events we personally recommend. New events are added weekly.',
      links: [
        { url: 'https://keepitil.com/#events-container', label: 'Browse Upcoming Events' },
        { url: 'https://keepitil.com/culture', label: 'Culture Blog' },
      ],
      chips: ['What is a KEEPITIL PICK?', 'Events in LA', 'Events in San Diego', 'How to buy tickets'],
    },
    {
      id: 'picks',
      kw: ['pick','keepitil pick','recommended','curated','best event','top event','stamp of approval'],
      title: '⭐ KEEPITIL PICKS',
      text: 'A KEEPITIL PICK is our editorial stamp on events we personally recommend — not ads, not paid placements. We look at lineup quality, venue, production value, and community fit. If we\'d go ourselves, it gets a PICK.',
      links: [
        { url: 'https://keepitil.com/#events-container', label: 'See Current Picks' },
      ],
      chips: ['Find upcoming events', 'About KEEPITIL', 'Culture blog'],
    },
    {
      id: 'tickets',
      kw: ['ticket','buy ticket','get ticket','ticket price','how much','purchase','ga','vip','general admission'],
      title: '🎟️ Buying Tickets',
      text: 'KEEPITIL is a discovery and community platform — we don\'t sell tickets directly. For major festivals, buy tickets at the official event website. For smaller shows and club nights, check the event flyer for the Eventbrite or RA link, or DM the organizer on Instagram.',
      links: [
        { url: 'https://keepitil.com/#events-container', label: 'Browse Events on KEEPITIL' },
        { url: 'https://www.residentadvisor.net', label: 'Resident Advisor (RA)' },
      ],
      chips: ['CRSSD tickets', 'Hard Summer tickets', 'Nocturnal Wonderland', 'Escape Halloween'],
    },
    {
      id: 'crssd',
      kw: ['crssd','crssdfest'],
      title: '🌊 CRSSD Festival',
      text: 'CRSSD is a premier San Diego waterfront festival by FNGRS XRSSD. Held twice a year (spring and fall) at Waterfront Park with three stages. Known for deep house, melodic techno, and curated underground lineups. Tickets at crssdfest.com.',
      links: [
        { url: 'https://crssdfest.com', label: 'Official Tickets — crssdfest.com' },
      ],
      chips: ['San Diego events', 'Other festivals', 'What to bring'],
    },
    {
      id: 'hard-summer',
      kw: ['hard summer','hard fest','hardsummer','hardfest','hard music'],
      title: '🔥 HARD Summer',
      text: 'HARD Summer is LA\'s biggest two-day electronic music festival at Exposition Park. Multi-stage with major headliners across EDM, hip-hop, and underground. Expect 65,000+ attendees. Tickets at hardfest.com.',
      links: [
        { url: 'https://hardfest.com', label: 'Official Tickets — hardfest.com' },
      ],
      chips: ['Other LA events', 'Festival packing tips', 'What is HARD Summer'],
    },
    {
      id: 'nocturnal',
      kw: ['nocturnal','nocturnal wonderland','nocturnalwonderland','nocturnal fest'],
      title: '🌙 Nocturnal Wonderland',
      text: 'Nocturnal Wonderland is Insomniac\'s flagship camping festival at Glen Helen Amphitheatre in San Bernardino. Multi-day immersive event over Labor Day weekend. Rich production with multiple themed stages. Tickets at Insomniac.com.',
      links: [
        { url: 'https://www.insomniac.com/music-festivals/nocturnal-wonderland', label: 'Official Tickets' },
      ],
      chips: ['Camping festivals', 'Insomniac events', 'What to bring to a festival'],
    },
    {
      id: 'escape',
      kw: ['escape','escape halloween','escape psycho','psycho circus','halloween event','halloween rave','halloween festival'],
      title: '🎃 Escape Halloween',
      text: 'Escape: Psycho Circus is Insomniac\'s massive Halloween festival at NOS Events Center, San Bernardino. Two nights of elaborate production, costumes, and haunted house elements across multiple stages. Always sells out. Tickets at Insomniac.com.',
      links: [
        { url: 'https://www.insomniac.com/music-festivals/escape-halloween', label: 'Official Tickets' },
      ],
      chips: ['Halloween costume tips', 'Other Insomniac events', 'What to bring'],
    },
    {
      id: 'artists',
      kw: ['artist','dj','producer','who is','find artist','artist profile','music','mix','set','performer','discover','underground dj'],
      title: '🎧 Artists & DJs',
      text: 'KEEPITIL profiles artists across the SoCal music scene — DJs, producers, live acts, bands, and performers of all genres. Each profile includes bio, music samples, social links, and direct booking info. Artists get exposure to organizers and brands actively looking to book talent.',
      links: [
        { url: 'https://keepitil.com/artist/', label: 'Browse All Artists' },
      ],
      chips: ['Book an artist', 'Rising artists', 'How to get profiled', 'Brands & labels'],
    },
    {
      id: 'book',
      kw: ['book','booking','hire dj','hire artist','how to book','book a dj','book an artist','dj rate','fee','price','contact artist'],
      title: '📋 Booking an Artist',
      text: 'Ready to book a DJ or live act for your event? Here\'s the KEEPITIL approach:\n\n1. Browse the artist directory and find someone who fits your vibe\n2. Hit their profile — every page has booking contact info (email or Instagram)\n3. Reach out with: date, venue, event type, expected crowd size, and your budget\n4. Be upfront about your budget — DJs appreciate directness\n5. Confirm in writing, even just via DM\n\nFor newer artists, rates are often negotiable. Established acts have set fees — ask for a quote.',
      links: [
        { url: 'https://keepitil.com/artist/', label: 'Browse Artist Directory' },
      ],
      chips: ['What info to include', 'DJ rates', 'Work with organizers', 'Market your event'],
    },
    {
      id: 'booking-info',
      kw: ['booking info','what to include','booking request','booking email','how to contact','reach out to dj'],
      title: '📝 What to Include in a Booking Request',
      text: 'When reaching out to book an artist, include:\n\n• Event date and time (set time if known)\n• Venue name and location\n• Event type (festival, club night, private, etc.)\n• Expected attendance\n• Your budget or "what\'s your rate?"\n• A link to your past events or Instagram\n\nKeep it short and professional. Artists get a lot of DMs — lead with the date and budget.',
      links: [],
      chips: ['DJ rates in SoCal', 'How to organize an event', 'Market your event'],
    },
    {
      id: 'brands',
      kw: ['brand','sponsor','sponsorship','brand deal','brand collab','brand partnership','brand profile','clothing','apparel','merch','label','record label'],
      title: '🏷️ Brand Partnerships',
      text: 'KEEPITIL connects brands with the SoCal music community. Whether you\'re a clothing brand, beverage company, gear manufacturer, record label, or lifestyle brand looking to reach event-goers, artists, and organizers — this is your direct lane into the scene.\n\nBrands get profiled alongside the artists and events their audience is already following.',
      links: [
        { url: 'https://keepitil.com/brand/', label: 'Browse Brand Directory' },
        { url: 'https://keepitil.com/signup.html', label: 'Get Listed on KEEPITIL' },
      ],
      chips: ['How to partner with organizers', 'Brand visibility tips', 'Get brand profiled', 'How artists promote brands'],
    },
    {
      id: 'brand-strategy',
      kw: ['brand strategy','promote brand','brand visibility','brand in music','brand marketing','partnership strategy','how brands work with djs','how brands work with events'],
      title: '📣 Brand Strategy for SoCal Events',
      text: 'Brands that win in the SoCal music scene do it by showing up, not just writing checks:\n\n• Partner with artists who genuinely use or believe in your product\n• Sponsor events that match your brand\'s vibe and audience\n• Show up physically — activations, pop-ups, merch tables, flyers\n• Build relationships with organizers first, before asking for logo placement\n• Let community members create content — authentic beats scripted every time\n• Use KEEPITIL to identify the right artists, organizers, and events to align with\n\nThe music community rewards brands that are real. Avoid: generic decks, paid post packages that feel like ads, and mismatched audiences.',
      links: [
        { url: 'https://keepitil.com/brand/', label: 'Brand Directory' },
        { url: 'https://keepitil.com/organizer/', label: 'Find Organizers to Partner With' },
      ],
      chips: ['Find organizers', 'Artist partnerships', 'How to promote an event'],
    },
    {
      id: 'organizers',
      kw: ['organizer','promoter','event organizer','event promoter','put on event','throw a party','throw a rave','produce event','organizer directory','find promoter'],
      title: '🗂️ Organizers & Promoters',
      text: 'KEEPITIL features event organizers and promoters across Southern California — from club nights and warehouse crews to festival producers and corporate event planners. The directory connects organizers with artists to book and brands to partner with.',
      links: [
        { url: 'https://keepitil.com/organizer/', label: 'Organizer Directory' },
        { url: 'https://keepitil.com/organizers-directory.html', label: 'Full Organizer List' },
      ],
      chips: ['How to work with organizers', 'How to organize an event', 'Market your event', 'Book an artist'],
    },
    {
      id: 'organize-event',
      kw: ['how to organize','how to throw','how to promote event','throwing event','producing event','start throwing','put on show','plan event','event planning','venue','venue booking','event budget'],
      title: '🎪 How to Organize an Event in SoCal',
      text: 'Whether it\'s a club night, festival, brand activation, or private event — the fundamentals are the same:\n\n1. Start with your audience: who\'s coming, what do they expect?\n2. Lock your venue first — clubs, warehouses, rooftops, art spaces, outdoor venues\n3. Secure permits or confirm the venue is handling it\n4. Book your artist EARLY — 4–8 weeks minimum, longer for touring or headliner acts\n5. Partner with a brand for sponsorship to offset costs\n6. Build a flyer and launch promotion 3–4 weeks out\n7. Ticket through Eventbrite, RA, or your own page\n8. Use Instagram + KEEPITIL for promotion to reach the right audience\n\nUse KEEPITIL\'s artist directory to find talent and the organizer directory to connect with crews who can help.',
      links: [
        { url: 'https://keepitil.com/organizer/', label: 'Organizer Directory' },
      ],
      chips: ['Sound system guide', 'How to book a DJ', 'Promote your event', 'Event budget tips'],
    },
    {
      id: 'promote-event',
      kw: ['promote event','market event','event marketing','flyer','flyer design','promotion strategy','how to get people','selling tickets','ticket sales','build buzz','social media event','instagram event'],
      title: '📢 Promoting Your Event',
      text: 'Underground event promotion in 2026:\n\n• Instagram is still king — post the flyer, then reels of past events, then countdown stories\n• Get the artist to repost — their audience is already qualified\n• RA (Resident Advisor) listing is a must for any serious event\n• Local Facebook groups for dance music communities still drive real turnout\n• Flyer in person at other events — people who go out, go out again\n• Reach out to KEEPITIL for potential editorial coverage\n\nTiming: soft announce 4 weeks out, push 1 week before, final story blast day-of.',
      links: [
        { url: 'https://keepitil.com/signup.html', label: 'List Your Event on KEEPITIL' },
      ],
      chips: ['Flyer design tips', 'Instagram for DJs', 'Sound system guide', 'Work with organizers'],
    },
    {
      id: 'dj-career',
      kw: ['dj career','become dj','learn dj','start djing','dj skill','music career','how to get gigs','get booked','first gig','dj set','dj mix','how to get started','music industry'],
      title: '🎚️ Building a DJ Career',
      text: 'Real talk on building a DJ career in the SoCal underground:\n\n• Learn properly — mixing is a skill, not just pressing play. Practice beatmatching manually before relying on sync\n• Record your sets and post them consistently — even if the crowd is your bedroom\n• Play for free at first: open decks, small house parties, afterparties\n• Build relationships in the scene — promoters book people they like and trust\n• Find your sound. Don\'t try to play everything. Specificity builds a following\n• Network at events genuinely — don\'t just hand out cards, connect as a music person\n• Have a bio, a promo mix, and a social page ready before you ask for bookings',
      links: [
        { url: 'https://keepitil.com/artist/', label: 'Artist Directory' },
      ],
      chips: ['Equipment guide', 'DJ Instagram tips', 'How to get booked', 'Networking guide'],
    },
    {
      id: 'equipment',
      kw: ['equipment','gear','controller','cdj','pioneer','mixer','setup','dj setup','turntable','technics','serato','rekordbox','traktor','laptop dj','hardware','speakers','sound system'],
      title: '🎛️ DJ Equipment',
      text: 'A breakdown of the key equipment decisions for DJs:\n\n• CDJs (Pioneer CDJ-2000NXS2 / CDJ-3000): Club standard. Learn these for serious gigs.\n• Controllers (Pioneer DDJ-400, DDJ-REV7): Great for home and smaller gigs. Not club standard but excellent to learn on.\n• Turntables (Technics 1200): Vinyl DJs still use these. Less common in underground clubs but iconic.\n• Mixer: A good mixer matters. Pioneer DJM-900NXS2 is the club standard.\n• Software: Rekordbox for preparing tracks for CDJs. Serato if you\'re using a controller.\n\nFor production: Ableton Live is the dominant DAW in electronic music. Start with the intro version.',
      links: [],
      chips: ['Mixing techniques', 'DJ career tips', 'Bedroom producer guide', 'Equipment for events'],
    },
    {
      id: 'production',
      kw: ['produce','producer','music production','ableton','fl studio','logic','daw','make music','make beats','bedroom producer','synthesis','sample','plugin','vst','how to produce','sound design'],
      title: '🎹 Music Production',
      text: 'Getting started with electronic music production:\n\n• Pick one DAW and stick to it. Ableton Live is standard for electronic music. Logic Pro is excellent on Mac. FL Studio has a strong community.\n• Learn music theory basics — you don\'t need to master it, but understanding key and scale will accelerate everything\n• Study tracks you love: load them into your DAW and analyze the structure\n• Finish tracks, even bad ones. Completion teaches more than abandoning 40% of projects\n• SoundCloud and Bandcamp for releasing early work\n• Give yourself 2+ years of serious practice before expecting quality results',
      links: [],
      chips: ['DJ career tips', 'Equipment guide', 'Music industry knowledge', 'Submit music to KEEPITIL'],
    },
    {
      id: 'party-tips',
      kw: ['tips','going out','rave tips','festival tips','first rave','first festival','what to wear','what to bring','dress code','safety','rave safety','rave culture','etiquette','rave etiquette','behave','how to act'],
      title: '🪩 Party & Rave Tips',
      text: 'New to the underground scene? Here\'s what you need to know:\n\n• Arrive at a reasonable time — the best sets aren\'t always headliners\n• Dress for the music, not the \'gram. Dark clothes, comfortable shoes. You\'ll be on your feet for hours.\n• Know the etiquette: respect the dancefloor, don\'t talk loudly over the music, don\'t block views\n• Take breaks — find a quiet spot, drink water, step outside briefly\n• Look out for your people and those around you. This community takes care of each other.\n• Phones on the dancefloor: keep it minimal. Be present. Record a little, experience a lot.',
      links: [],
      chips: ['Festival packing list', 'Find events near me', 'Rave safety', 'Rave culture history'],
    },
    {
      id: 'packing',
      kw: ['packing','what to bring','packing list','bag','backpack','festival bag','essentials','what do i need','festival preparation','prepare for festival','gear for festival'],
      title: '🎒 Festival Packing Guide',
      text: 'SoCal festival essentials:\n\n✓ Fanny pack or small bag (keep it light)\n✓ ID + card + some cash\n✓ Water bottle (many festivals have refill stations)\n✓ Portable phone charger\n✓ Earplugs — protect your hearing, you\'ll still hear everything\n✓ Comfortable shoes (you\'ll walk 15,000+ steps)\n✓ Light jacket for late nights — even summer desert nights get cold\n✓ Sunscreen if it\'s a daytime event\n✓ Mints, snacks\n\nLeave at home: heavy bags, laptops, valuables you can\'t replace.',
      links: [],
      chips: ['Rave etiquette', 'Rave tips', 'Find events near me'],
    },
    {
      id: 'history',
      kw: ['history','origin','where did','how did','house music history','techno history','rave history','california rave','underground history','electronic music history','genre','garage','drum and bass','dnb','uk garage'],
      title: '📚 Music History',
      text: 'KEEPITIL\'s culture blog covers the history of the genres that built underground electronic music — from Chicago house to Berlin techno, Detroit to Bristol, and the California rave scene.',
      links: [],
      chips: ['Techno subgenres', 'House music subgenres', 'UK garage scene', 'SoCal underground scene'],
    },
    {
      id: 'socal-scene',
      kw: ['socal','southern california','los angeles','la','orange county','oc','san diego','sd','inland empire','ie','local scene','underground scene','local events','local dj'],
      title: '🌴 SoCal Underground Scene',
      text: 'The SoCal underground electronic music scene is one of the most active in the country, spanning:\n\n• Orange County: smaller club nights, house music focus, tight-knit community\n• Los Angeles: massive reach, warehouse raves, major touring acts, every subgenre\n• San Diego: festival culture strong (CRSSD), strong house and tech house scene\n• Inland Empire: growing underground warehouse scene, large outdoor raves\n\nKEEPITIL covers it all.',
      links: [],
      chips: ['Events near me', 'Find underground raves', 'Local DJs', 'Local organizers'],
    },
    {
      id: 'subscribe',
      kw: ['subscribe','newsletter','email','sign up','signup','notify','alert','updates','mailing list','follow'],
      title: '📬 Stay in the Loop',
      text: 'Subscribe to KEEPITIL for curated event picks, new artist profiles, and underground music news delivered to your inbox. No spam — just the good stuff.',
      links: [
        { url: 'https://keepitil.com/signup.html', label: 'Subscribe to KEEPITIL' },
      ],
      chips: ['Find upcoming events', 'About KEEPITIL', 'Culture blog'],
    },
    {
      id: 'about',
      kw: ['about','what is keepitil','who runs','who are you','what do you do','keepitil','platform','mission','community','underground'],
      title: '🔊 About KEEPITIL',
      text: 'KEEPITIL is a music marketing and management platform for Southern California — built to promote artists, connect organizers with talent, and match brands with events that reach their audience.\n\nThink of it as a SoCal-focused marketplace: artists get exposure and bookings, organizers find talent and brand partners, and brands activate inside the music community.\n\nFounded in the underground, we cover the full SoCal scene — electronic, hip-hop, R&B, live music, and everything in between. As the community grows, KEEPITIL expands — our goal is to eventually cover every region in the US, starting right here.',
      links: [
        { url: 'https://keepitil.com', label: 'KEEPITIL Home' },
        { url: 'https://keepitil.com/culture', label: 'Culture Blog' },
        { url: 'https://keepitil.com/signup.html', label: 'Subscribe' },
      ],
      chips: ['Browse events', 'Artist directory', 'Organizer directory', 'Get listed'],
    },
    {
      id: 'get-listed',
      kw: ['get listed','submit','list my event','add my event','feature','profile','artist profile','brand profile','organizer profile','submit event','apply','partnership','collab','collaborate'],
      title: '✅ Get Listed on KEEPITIL',
      text: 'Want to be on KEEPITIL? Here\'s how each type gets listed:\n\n• Artists & DJs: Get profiled — we feature artists active in the SoCal scene. Your profile includes bio, music, booking info, and social links so organizers and brands can find you.\n• Organizers & Promoters: Join the directory — connect with artists to book and brands looking to sponsor.\n• Brands: Partner with the community — get listed alongside the events and artists your audience already follows.\n• Events: Submit for consideration and KEEPITIL PICK review.\n\nReach out via Instagram or the subscribe page to get started.',
      links: [
        { url: 'https://keepitil.com/signup.html', label: 'Contact & Subscribe' },
        { url: 'https://www.instagram.com/keepitil', label: 'DM Us on Instagram' },
      ],
      chips: ['About KEEPITIL', 'Subscribe', 'Browse events'],
    },
    {
      id: 'networking',
      kw: ['network','networking','connect','meet people','industry','scene','make connections','meet djs','collaboration','collab','build relationship','who to know','meet organizer','scene access'],
      title: '🤝 Networking in the Scene',
      text: 'The SoCal music industry runs on relationships. Whether you\'re an artist, organizer, or brand — here\'s how to build them:\n\n• Show up to events consistently — presence builds recognition faster than anything online\n• Introduce yourself genuinely. Lead with the music, not the pitch.\n• For artists: volunteer at events, support other artists\' nights, share their work\n• For organizers: connect with brands before you need their money — build the relationship first\n• For brands: reach out to artists and organizers who fit your product naturally, not transactionally\n• Use KEEPITIL\'s directories to identify the right people to connect with\n• DM on Instagram with specific, genuine messages — "loved your set at X" beats "let\'s collab"\n\nSoCal is big but the music scene is a community. Your reputation travels.',
      links: [
        { url: 'https://keepitil.com/#events-container', label: 'Find Events to Attend' },
      ],
      chips: ['How to get gigs', 'Work with organizers', 'Find events to attend'],
    },
    {
      id: 'instagram',
      kw: ['instagram','ig','social media','social','content','posts','reels','stories','tiktok','online presence','brand yourself','personal brand','online','social strategy'],
      title: '📱 Building Your Presence Online',
      text: 'For artists, organizers, and brands in electronic music, Instagram is still the primary platform. What works in 2026:\n\n• Post consistently — 3–5x per week\n• Reels get more reach than static posts — use them for event recaps, studio clips, gear content\n• Stories for real-time: announcements, behind the scenes, polls\n• Your bio should say who you are and where you operate (DJ | OC/LA, for example)\n• Tag venues and artists in your posts\n• Your link should go somewhere useful — KEEPITIL profile, SoundCloud, or a link-in-bio\n\nTikTok: growing in the scene, worth being on, but Instagram still books gigs.',
      links: [],
      chips: ['DJ career tips', 'Promote your event', 'Brand partnerships'],
    },
  ];

  // ── Quick chip suggestions shown at welcome ──────────────────────────────────
  /* ── §C — CHAT IS THE PRIMARY ACTION SURFACE ─────────────────────────────────────────
     With the + FAB deleted, this is how anything gets created, and it is now the only route
     to your own profile. The directive is exact: EXACTLY TWO options on open, not "including"
     these two. Signed out that is Log in · Create; signed in the first slot becomes Profile,
     because offering a signed-in user a login they don't need while still stranding them from
     their profile is the failure this replaces.

     These are ACTIONS, not prompts — they navigate. A chip that merely asks the bot to talk
     about creating an event is not a create path. */
  function kilSignedIn(){
    /* Supabase stores its session under sb-<project-ref>-auth-token. Reading the key is enough;
       we never touch the token itself. */
    try{
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && /^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true;
      }
    }catch(e){}
    return false;
  }

  /* The public create path. NOT /create-event.html — that is admin-only and bounces everyone
     else, dropping query params on the way. */
  var KIL_CREATE_URL = '/submit-event.html';

  function welcomeActions(){
    return kilSignedIn()
      ? [{ label:'Profile', href:'/profile.html' }, { label:'Create', href:KIL_CREATE_URL }]
      : [{ label:'Log in',  href:'/apply.html'   }, { label:'Create', href:KIL_CREATE_URL }];
  }

  var WELCOME_CHIPS = [];   /* kept for the renderer; the two actions are rendered separately */

  // ── Match intent from user text ──────────────────────────────────────────────
  function matchIntent(text) {
    var q = text.toLowerCase().trim();
    var best = null, bestScore = 0;
    for (var i = 0; i < KB.length; i++) {
      var item = KB[i];
      var score = 0;
      for (var j = 0; j < item.kw.length; j++) {
        if (q.indexOf(item.kw[j]) !== -1) {
          score += item.kw[j].length; // longer keyword match = higher score
        }
      }
      if (score > bestScore) { bestScore = score; best = item; }
    }
    return bestScore > 0 ? best : null;
  }

  // ── CSS injection ────────────────────────────────────────────────────────────
  function injectStyles() {
    var css = [
      /* Resized 2026-08-22 (Founder, floating-button editor): 40px button, 20px glyph, matched to
         keepitil-shell.js so the button does not paint at one size and then jump to another.
         This existed ONLY in the root copy of this script; carried over in the 2026-08-26
         consolidation so the newer sizing is not lost along with the file it came from. */
      '#kilo-btn{position:fixed;bottom:66px;right:24px;z-index:99998;width:40px;height:40px;border-radius:50%;',
      'background:linear-gradient(135deg,#00b4ff,#00ff88);border:none;cursor:pointer;',
      'box-shadow:0 4px 24px rgba(0,180,255,.35),0 0 0 0 rgba(0,180,255,.4);',
      'display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;',
      'animation:kilo-pulse 3s ease-in-out infinite;}',
      '#kilo-btn:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(0,180,255,.5);}',
      '#kilo-btn svg{width:20px;height:20px;fill:#0f0f1a;}',
      '#kilo-badge{position:absolute;top:-3px;right:-3px;background:#00ff88;color:#0f0f1a;',
      'font-size:10px;font-weight:800;width:18px;height:18px;border-radius:50%;',
      "font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;}",
      '@keyframes kilo-pulse{0%,100%{box-shadow:0 4px 24px rgba(0,180,255,.35),0 0 0 0 rgba(0,180,255,.4);}',
      '50%{box-shadow:0 4px 24px rgba(0,180,255,.35),0 0 0 8px rgba(0,180,255,0);}}',

      '#kilo-panel{position:fixed;bottom:134px;right:24px;z-index:99999;width:360px;max-width:calc(100vw - 32px);',
      'height:520px;max-height:calc(100vh - 150px);',
      'background:#0f0f1a;border:1px solid rgba(0,180,255,.18);border-radius:16px;',
      'display:flex;flex-direction:column;overflow:hidden;',
      'box-shadow:0 20px 60px rgba(0,0,0,.7),0 0 0 1px rgba(0,180,255,.08);',
      'transform:translateY(20px) scale(.96);opacity:0;pointer-events:none;',
      'transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;}',
      '#kilo-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:all;}',

      '#kilo-header{display:flex;align-items:center;gap:10px;padding:14px 16px;',
      'background:linear-gradient(90deg,rgba(0,180,255,.08),rgba(0,255,136,.05));',
      'border-bottom:1px solid rgba(0,180,255,.12);}',
      '#kilo-avatar{width:34px;height:34px;border-radius:50%;',
      'background:linear-gradient(135deg,#00b4ff,#00ff88);',
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;}',
      '#kilo-avatar svg{width:18px;height:18px;fill:#0f0f1a;}',
      '#kilo-hinfo{flex:1;}',
      '#kilo-hname{font-size:.78rem;font-weight:800;letter-spacing:.12em;',
      "color:#e8e8f0;font-family:'Bebas Neue','Inter',sans-serif;font-size:1rem;line-height:1;}",
      '#kilo-hsub{font-size:.68rem;color:#00b4ff;letter-spacing:.06em;margin-top:1px;}',
      /* ── CHO SHELL (§24/§46/§47/§48) ───────────────────────────────────────────────────
         Two locked rows, a scrolling conversation, a pinned composer. The panel is a flex
         column and ONLY #kilo-msgs is allowed to scroll — that is what keeps the header from
         drifting and the composer from being pushed off-screen when the keyboard opens. */
      '#kilo-panel{display:flex;flex-direction:column;}',
      /* ⚠ COLUMN, NOT ROW. The original #kilo-header rule above is display:flex with the
         default row direction, from when the header held avatar + name + buttons on ONE
         line. With two row elements inside it that laid ROW 2 beside ROW 1 — measured:
         both rows reported top:51, and LOGIN rendered next to the close X. */
      '#kilo-header{flex:0 0 auto;display:block;padding:0;}',
      '#kilo-msgs{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;}',
      '#kilo-input-row{flex:0 0 auto;}',
      '#kilo-row1{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 6px;}',
      '#kilo-hname{font:800 .95rem/1 Inter,system-ui,sans-serif;letter-spacing:.14em;color:#fff;}',
      '#kilo-row2{display:flex;gap:8px;padding:0 12px 10px;}',
      '.kilo-r2{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;',
        'height:34px;border-radius:9px;text-decoration:none;',
        'font:800 .68rem Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;',
        'color:#cfd3df;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);}',
      '.kilo-r2:hover{background:rgba(0,180,255,.16);color:#fff;}',
      /* ── OPTIONS MENU (§25) ─────────────────────────────────────────────────────────────
         Anchored to the launcher, above it, so it never covers the bottom navigation. */
      '#kilo-options{position:fixed;bottom:112px;right:24px;z-index:99999;display:flex;',
        'flex-direction:column;gap:6px;padding:8px;border-radius:12px;min-width:150px;',
        'background:rgba(16,16,26,.98);border:1px solid rgba(255,255,255,.12);',
        'box-shadow:0 10px 34px rgba(0,0,0,.6);backdrop-filter:blur(12px);}',
      '#kilo-options a,#kilo-options button{display:flex;align-items:center;justify-content:center;',
        'height:38px;border-radius:9px;cursor:pointer;text-decoration:none;',
        'font:800 .7rem Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;',
        'color:#cfd3df;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);}',
      '#kilo-options a:hover,#kilo-options button:hover{background:rgba(0,180,255,.18);color:#fff;}',
      '@media(max-width:480px){#kilo-options{right:16px;bottom:112px;}}',
      '#kilo-close{background:none;border:none;cursor:pointer;color:#666;',
      'width:28px;height:28px;display:flex;align-items:center;justify-content:center;',
      'border-radius:50%;transition:background .15s,color .15s;padding:0;}',
      '#kilo-close:hover{background:rgba(255,255,255,.07);color:#e8e8f0;}',
      '#kilo-close svg{width:16px;height:16px;stroke:currentColor;fill:none;}',
      '#kilo-fb{background:none;border:none;cursor:pointer;color:#666;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;transition:background .15s,color .15s;padding:0;}',
      '#kilo-fb:hover{background:rgba(0,180,255,.12);color:#00b4ff;}',
      '#kilo-fb svg{width:17px;height:17px;}',

      '#kilo-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;}',
      '#kilo-msgs::-webkit-scrollbar{width:4px;}',
      '#kilo-msgs::-webkit-scrollbar-track{background:transparent;}',
      '#kilo-msgs::-webkit-scrollbar-thumb{background:rgba(0,180,255,.2);border-radius:2px;}',

      '.kilo-msg{display:flex;flex-direction:column;gap:6px;max-width:88%;}',
      '.kilo-msg.user{align-self:flex-end;align-items:flex-end;}',
      '.kilo-msg.bot{align-self:flex-start;}',
      '.kilo-bubble{padding:10px 14px;border-radius:14px;font-size:.83rem;line-height:1.55;',
      "color:#e8e8f0;font-family:'Inter',sans-serif;white-space:pre-wrap;word-break:break-word;}",
      '.kilo-msg.user .kilo-bubble{background:linear-gradient(135deg,rgba(0,180,255,.25),rgba(0,255,136,.15));',
      'border:1px solid rgba(0,180,255,.25);border-radius:14px 14px 4px 14px;}',
      '.kilo-msg.bot .kilo-bubble{background:#1a1a2e;border:1px solid rgba(255,255,255,.07);',
      'border-radius:14px 14px 14px 4px;}',
      '.kilo-topic{font-size:.7rem;font-weight:800;letter-spacing:.1em;color:#00ff88;margin-bottom:2px;',
      "font-family:'Bebas Neue','Inter',sans-serif;font-size:.85rem;}",

      '.kilo-links{display:flex;flex-direction:column;gap:6px;margin-top:4px;}',
      '.kilo-link{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;',
      'border-radius:8px;font-size:.75rem;font-weight:700;letter-spacing:.06em;',
      'text-decoration:none;transition:all .18s;border:1px solid rgba(0,180,255,.25);',
      'color:#00b4ff;background:rgba(0,180,255,.06);}',
      '.kilo-link:hover{background:rgba(0,180,255,.14);border-color:rgba(0,180,255,.5);',
      'color:#fff;transform:translateX(2px);}',
      '.kilo-link::after{content:"→";margin-left:auto;opacity:.6;}',

      '.kilo-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;}',
      '.kilo-actions{display:flex;gap:10px;margin:4px 0 2px;}',
      '.kilo-action{flex:1 1 0;text-align:center;padding:13px 10px;border-radius:12px;text-decoration:none;',
      'font:800 .82rem/1 Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;min-height:44px;',
      'display:flex;align-items:center;justify-content:center;',
      'background:linear-gradient(135deg,#00b4ff,#00ff88);color:#0f0f1a;}',
      '.kilo-action:focus-visible{outline:2px solid #fff;outline-offset:2px;}',
      '.kilo-chip{padding:5px 10px;border-radius:20px;font-size:.72rem;font-weight:700;',
      'letter-spacing:.05em;cursor:pointer;border:1px solid rgba(0,255,136,.2);',
      'color:#00ff88;background:rgba(0,255,136,.06);transition:all .15s;',
      "font-family:'Inter',sans-serif;}",
      '.kilo-chip:hover{background:rgba(0,255,136,.14);border-color:rgba(0,255,136,.4);}',

      '#kilo-typing{display:none;align-self:flex-start;gap:5px;padding:10px 14px;',
      'background:#1a1a2e;border:1px solid rgba(255,255,255,.07);border-radius:14px 14px 14px 4px;}',
      '#kilo-typing span{width:6px;height:6px;border-radius:50%;background:#00b4ff;display:inline-block;',
      'animation:kilo-dot .9s ease-in-out infinite;}',
      '#kilo-typing span:nth-child(2){animation-delay:.15s;}',
      '#kilo-typing span:nth-child(3){animation-delay:.3s;}',
      '@keyframes kilo-dot{0%,80%,100%{transform:scale(0.7);opacity:.4;}40%{transform:scale(1);opacity:1;}}',

      '#kilo-input-row{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(0,180,255,.1);}',
      '#kilo-input{flex:1;background:#151520;border:1px solid rgba(0,180,255,.18);border-radius:8px;',
      'padding:9px 12px;font-size:.82rem;color:#e8e8f0;outline:none;',
      "font-family:'Inter',sans-serif;transition:border-color .2s;}",
      '#kilo-input::placeholder{color:#555;}',
      '#kilo-input:focus{border-color:rgba(0,180,255,.45);}',
      '#kilo-send{background:linear-gradient(135deg,#00b4ff,#00ff88);border:none;border-radius:8px;',
      'width:36px;height:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;',
      'flex-shrink:0;transition:opacity .18s,transform .15s;}',
      '#kilo-send:hover{opacity:.85;transform:scale(1.05);}',
      '#kilo-send svg{width:16px;height:16px;fill:#0f0f1a;}',
      /* Phone placement — also root-only before consolidation. */
      '@media(max-width:480px){#kilo-panel{bottom:134px;right:12px;width:calc(100vw - 24px);}',
      '#kilo-btn{bottom:66px;right:16px;}}',
      /* M1 — the ECHO panel goes full-screen here (inset:0), and viewport-fit=cover means
         the viewport now starts UNDER the status bar. Without a top inset the header sits
         on the clock: on the owner's iPhone "ECHO" overlapped 11:52 and the greeting ran
         under the status icons. Scoped to this block so the floating desktop panel, which
         is nowhere near the status bar, is unchanged. */
      '@media(max-width:768px){#kilo-panel{inset:0;left:0;right:0;top:0;bottom:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;}',
      '#kilo-header{padding-top:max(14px,env(safe-area-inset-top,0px));}',
      '#kilo-msgs{scroll-padding-top:env(safe-area-inset-top,0px);}',
      '#kilo-panel.open{transform:none;}',
      '#kilo-msgs{flex:1 1 auto;min-height:0;}',
      '#kilo-btn{bottom:132px;right:16px;}body.kilo-open{overflow:hidden;}}',
    ].join('');

    var s = document.createElement('style');
    s.id = 'kilo-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ── Build DOM ────────────────────────────────────────────────────────────────
  function buildWidget() {
    // Button
    var btn = document.createElement('button');
    btn.id = 'kilo-btn';
    /* §42: the global launcher is no longer a Chat-only button. It opens OPTIONS, of which
       Chat is one entry — so a speech bubble would misdescribe what it does. Three bars is the
       conventional menu glyph and needs no explanation. */
    btn.setAttribute('aria-label', 'Options');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = [
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">',
        '<rect x="3" y="5"  width="18" height="2" rx="1"/>',
        '<rect x="3" y="11" width="18" height="2" rx="1"/>',
        '<rect x="3" y="17" width="18" height="2" rx="1"/>',
      '</svg>',
      '<span id="kilo-badge" style="display:none">1</span>',
    ].join('');

    // Panel
    var panel = document.createElement('div');
    panel.id = 'kilo-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Echo — KEEPITIL AI Assistant');
    panel.innerHTML = [
      /* §24/§45/§46/§47/§49 — TWO LOCKED ROWS, NO AGENT LANDING HEADER.
         ROW 1  CHO far left, X far right.
         ROW 2  LOGIN when signed out; PROFILE + CREATE when signed in.
         The oversized avatar and the sub-title are gone: on a phone they consumed the top of
         the screen for decoration while the conversation — the actual content — was pushed
         below the fold. Row 2's buttons are rebuilt by kiloApplyAuthRows() rather than being
         chosen here, so the shell is identical in both states and only its contents change. */
      '<div id="kilo-header">',
        '<div id="kilo-row1">',
          '<span id="kilo-hname">CHO</span>',
          '<button id="kilo-close" aria-label="Close chat">',
            '<svg viewBox="0 0 24 24" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
          '</button>',
        '</div>',
        '<div id="kilo-row2"></div>',
      '</div>',
      '<div id="kilo-msgs"></div>',
      '<div id="kilo-input-row">',
        '<input id="kilo-input" type="text" placeholder="Ask me anything about the scene…" maxlength="300" autocomplete="off"/>',
        '<button id="kilo-send" aria-label="Send">',
          '<svg viewBox="0 0 24 24"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>',
        '</button>',
      '</div>',
    ].join('');

    document.body.appendChild(btn);
    document.body.appendChild(panel);
  }

  // ── Message rendering ────────────────────────────────────────────────────────
  var msgs;
  function addMessage(role, data) {
    var wrap = document.createElement('div');
    wrap.className = 'kilo-msg ' + role;

    if (role === 'user') {
      var b = document.createElement('div');
      b.className = 'kilo-bubble';
      b.textContent = data;
      wrap.appendChild(b);
    } else {
      // Bot message: {title, text, links:[], chips:[]}
      if (data.title) {
        var t = document.createElement('div');
        t.className = 'kilo-topic';
        t.textContent = data.title;
        wrap.appendChild(t);
      }
      var b = document.createElement('div');
      b.className = 'kilo-bubble';
      b.textContent = data.text;
      wrap.appendChild(b);

      if (data.links && data.links.length) {
        var linksDiv = document.createElement('div');
        linksDiv.className = 'kilo-links';
        data.links.forEach(function(l) {
          var a = document.createElement('a');
          a.className = 'kilo-link';
          a.href = l.url;
          a.textContent = l.label;
          // Internal links open in same tab, external in new tab
          if (l.url.indexOf('keepitil.com') === -1 && l.url.charAt(0) !== '/') {
            a.target = '_blank';
            a.rel = 'noopener';
          }
          linksDiv.appendChild(a);
        });
        wrap.appendChild(linksDiv);
      }

      if (data.chips && data.chips.length) {
        var chipsDiv = document.createElement('div');
        chipsDiv.className = 'kilo-chips';
        data.chips.forEach(function(c) {
          var chip = document.createElement('button');
          chip.className = 'kilo-chip';
          chip.textContent = c;
          chip.addEventListener('click', function() { handleQuery(c); });
          chipsDiv.appendChild(chip);
        });
        wrap.appendChild(chipsDiv);
      }
    }

    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
  }

  function showTyping() {
    var t = document.getElementById('kilo-typing');
    if (!t) {
      t = document.createElement('div');
      t.id = 'kilo-typing';
      t.innerHTML = '<span></span><span></span><span></span>';
      msgs.appendChild(t);
    }
    t.style.display = 'flex';
    msgs.scrollTop = msgs.scrollHeight;
  }

  function hideTyping() {
    var t = document.getElementById('kilo-typing');
    if (t) t.style.display = 'none';
  }

  // ── Brain: draw from ALL 14 agents' knowledge via ask_crew ──────────────────
  var KIL_SUPA_URL  = 'https://ovmqtzjfpzrbzrlkxwgw.supabase.co';
  var KIL_SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92bXF0empmcHpyYnpybGt4d2d3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyMDM5OTEsImV4cCI6MjA5Njc3OTk5MX0.rqFG5illhiePFOnqkKaA7nVSv_LWtJ95HHW1NVIo6CQ';
  function kilCap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function askBrain(text) {
    // Use a logged-in member's token if the page exposes a Supabase client (fuller answers), else anon.
    var tok = KIL_SUPA_ANON;
    try {
      var c = window.__culSB || window.SB;
      var s = c && c.auth && c.auth._currentSession;
      if (s && s.access_token) tok = s.access_token;
    } catch (e) {}
    return fetch(KIL_SUPA_URL + '/rest/v1/rpc/ask_crew', {
      method: 'POST',
      headers: { 'apikey': KIL_SUPA_ANON, 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_question: text }),
    }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
  }
  function brainCard(d) {
    if (!d || !d.ok) return null;
    if (d.escalate) return { title: '🛡️ Flagged for the team', text: d.answer };
    if (!d.matched || !d.answer) return null;
    var txt = d.answer;
    // Never upsell a signed-in member. Telling the owner of the platform to
    // "join the KEEPITIL Community to unlock it" is the bug the Founder hit.
    var signedIn = false;
    try {
      var cc = window.__kilShellSB || window.__culSB || window.SB;
      signedIn = !!(cc && cc.auth && (cc.auth._currentSession || window.KIL_HANDLE));
    } catch (e) {}
    if (d.upsell && !signedIn) txt += '\n\n' + d.upsell;
    // Drop the hedge — "I'm moderately sure, confirm with the team" reads as broken,
    // not humble. Low confidence should fall through to a better source instead.
    txt = txt.replace(/\(?I'?m moderately sure[^)]*\)?\s*/gi, '').trim();
    var title = '💡 Echo';
    if (d.from_agent && String(d.from_agent).toLowerCase() !== 'cho') {
      title = '💡 ' + kilCap(d.from_agent) + (d.genre_lane ? ' · ' + d.genre_lane : '');
    }
    var card = { title: title, text: txt };
    if (d.source_url) card.links = [{ label: 'Read more', url: d.source_url }];
    return card;
  }

  // ── Gemini RAG fallback (natural answers composed over all agents' brains) ──
  function askEcho(text) {
    // Personalization: onboarding (/onboarding.html) caches role + genres locally;
    // ask-echo already accepts userRole/userGenre in the body (Atlas, 2026-07-20).
    var body = { question: text };
    try {
      var role = localStorage.getItem('kil_role');
      var genres = localStorage.getItem('kil_genres');
      if (role) body.userRole = role;
      if (genres) body.userGenre = genres.split(',')[0] || genres;
    } catch (e) {}
    return fetch(KIL_SUPA_URL + '/functions/v1/ask-echo', {
      method: 'POST',
      headers: { 'apikey': KIL_SUPA_ANON, 'Authorization': 'Bearer ' + KIL_SUPA_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; });
  }
  function echoCard(d) {
    if (!d || !d.ok || !d.answer) return null;
    var card = { title: '💡 Echo', text: d.answer };
    if (d.sources && d.sources.length) card.links = d.sources;
    return card;
  }
  function fallbackCard(text) {
    return matchIntent(text) || {
      title: '🔍 I\'m not sure about that',
      text: 'I didn\'t catch that one. Try asking about events, booking artists, organizing events, brand partnerships, DJ tips, or the SoCal underground scene. Or pick a topic below:',
      chips: WELCOME_CHIPS,
    };
  }

  // ── AGENTIC PATH (v3.1) ─────────────────────────────────────────────────────
  // Signed-in members reach the real agent: agent-tool-invoke op:"ask".
  // It routes deterministically first (L-1/L0, zero model cost) and only escalates
  // to a model when nothing rule-based matched. Everything is logged to agent_runs /
  // agent_steps / agent_cost_ledger, so this path is measurable, not a black box.
  // Signed-out visitors keep the existing keyword brain — no regression.
  var KIL_AGENT_FN = KIL_SUPA_URL + '/functions/v1/agent-tool-invoke';

  // The CHAT path goes through nexus-relay, never straight to agent-tool-invoke.
  //
  // The relay is the only place the NEXUS client credential exists — this file is public
  // browser JS, so the credential can never live here. It also owns the cutover switch
  // (public.platform_config.nexus_cutover): with it `off` the relay calls agent-tool-invoke
  // and returns its response verbatim, so this change is behaviour-preserving today and the
  // rollback is one UPDATE rather than a redeploy of the site.
  //
  // runReadTool() below deliberately stays on KIL_AGENT_FN. It sends op:'invoke' with a tool
  // and args; the relay only speaks the ask shape and would reject it as an empty message.
  // Tool execution is not the AI request path.
  var KIL_RELAY_FN = KIL_SUPA_URL + '/functions/v1/nexus-relay';
  var kilThreadId = null;   // conversation continuity within a page session

  function kilSession() {
    // The shell exposes the authenticated client. Try every known handle.
    var c = window.__kilShellSB || window.__culSB || window.SB || null;
    if (!c || !c.auth) return Promise.resolve(null);
    try {
      return c.auth.getSession()
        .then(function (r) { return (r && r.data && r.data.session) || null; })
        .catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function askAgent(text) {
    return kilSession().then(function (session) {
      if (!session || !session.access_token) return null;   // not signed in -> legacy path
      // 'cho' — renamed from 'echo' on 2026-08-16. This slug is not a label: the function
      // looks it up with eq() against agent_personality and search_brain, both of which were
      // migrated, so sending the legacy slug returns an agent with no persona and no notes.
      var body = { op: 'ask', text: text, surface: 'web', agent: 'cho', privacy_class: 'low' };
      if (kilThreadId) body.thread_id = kilThreadId;
      return fetch(KIL_RELAY_FN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify(body)
      })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    });
  }

  function agentCard(d) {
    if (!d) return null;
    if (d.thread_id) kilThreadId = d.thread_id;   // keep the conversation together

    // Anything the router sent to a human stops here, by design.
    if (d.human_review) {
      return { title: '🛡️ Passed to the team',
               text: 'This one needs a person, so I have flagged it for the KEEPITIL team rather than answering it myself. Someone will follow up.' };
    }

    // A REAL ANSWER IS TERMINAL. It does not matter which route produced it.
    //
    // This branch used to live inside `if (d.escalated)`, which was correct while the only
    // source of prose was the legacy escalation path. It is wrong now. nexus-relay adapts the
    // NEXUS envelope with `escalated: !!degradation`, so a CLEAN success — the good case —
    // arrives with escalated:false, fell past the only branch that returns the answer, and
    // returned null. handleQuery read that null as "the agent had nothing" and continued into
    // runReadTool -> askBrain -> askEcho, so NEXUS answered and the user was shown the legacy
    // reply ~150ms later. The answer was not lost in transit; it was discarded here.
    //
    // Keyed on the answer itself rather than on any routing flag, because the flag is exactly
    // what differed between the two producers. `d.ok && d.answer` is true only when something
    // composed real prose for this turn, which is the only condition that should end the chain.
    if (d.ok && typeof d.answer === 'string' && d.answer.trim()) {
      return { title: '💡 Echo', text: d.answer };
    }

    // Escalated with nothing to show = the model failed or found no route. That is an explicit
    // failure, and only an explicit failure may fall through to the proven chain.
    if (d.escalated) return null;

    // Write actions: confirm, never auto-execute.
    var ACTIONABLE = { create_event:1, cancel_event:1, publish_campaign:1,
                       pause_campaign:1, checkout:1 };
    if (d.resolved && d.intent && ACTIONABLE[d.intent]) {
      return {
        title: '⚡ ' + String(d.intent).replace(/_/g, ' '),
        text: 'I can set that up. Nothing is created, published, or paid for until you confirm it — say "go ahead" and I will prepare it for your approval.'
      };
    }
    return null;   // read intents are handled by runReadTool(); everything else falls through
  }


  // ── Execute a READ tool and answer with real data ───────────────────────────
  // The router resolves 'find events near me' to search_events. Announcing that is
  // useless; RUNNING it is the point. Read-only tools are risk class A, so they
  // execute without confirmation and cost no credits.
  var READ_INTENT_TOOL = { search_events: 'search_events', search_profiles: 'search_profiles' };

  function stripQuery(text) {
    return String(text || '')
      .replace(/\b(find|search|look for|show me|who is|whos|who's|near me|any|the|a|an|for|me)\b/gi, '')
      .replace(/[?!.]/g, '').replace(/\s+/g, ' ').trim();
  }

  function runReadTool(intent, text) {
    var tool = READ_INTENT_TOOL[intent];
    if (!tool) return Promise.resolve(null);
    var args = { limit: 5 };
    var q = stripQuery(text);
    if (tool === 'search_profiles') { if (!q) return Promise.resolve(null); args.query = q; }
    else if (q && q.length > 2 && !/^events?$/i.test(q)) { args.query = q; }

    return kilSession().then(function (session) {
      if (!session) return null;
      return fetch(KIL_AGENT_FN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session.access_token },
        body: JSON.stringify({ op: 'invoke', tool: tool, args: args, surface: 'web' })
      }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (b) {
          if (!b || !b.ok || !b.data) return null;
          if (tool === 'search_events') return eventsCard(b.data);
          return profilesCard(b.data);
        }).catch(function () { return null; });
    });
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-US',
        { weekday: 'short', month: 'short', day: 'numeric' });
    } catch (e) { return ''; }
  }

  function eventsCard(d) {
    var ev = (d && d.events) || [];
    if (!ev.length) return null;                       // nothing found -> let the brain answer
    var lines = ev.map(function (e) {
      var when = fmtWhen(e.starts_at);
      var where = [e.venue, e.city].filter(Boolean).join(', ');
      return '• ' + (e.title || 'Untitled') + (when ? ' — ' + when : '') + (where ? ' · ' + where : '');
    });
    return {
      title: '🎉 ' + ev.length + ' upcoming event' + (ev.length === 1 ? '' : 's'),
      text: lines.join('\n'),
      links: ev.slice(0, 5).filter(function (e) { return e.slug; }).map(function (e) {
        return { label: e.title || e.slug, url: 'https://keepitil.com/event?e=' + encodeURIComponent(e.slug) };
      })
    };
  }

  function profilesCard(d) {
    var ps = (d && d.profiles) || [];
    if (!ps.length) return null;
    return {
      title: '👤 ' + ps.length + ' profile' + (ps.length === 1 ? '' : 's'),
      text: ps.map(function (p) {
        return '• ' + (p.display_name || p.name || p.slug) + (p.city ? ' · ' + p.city : '');
      }).join('\n'),
      links: ps.slice(0, 5).filter(function (p) { return p.slug; }).map(function (p) {
        return { label: p.display_name || p.slug, url: 'https://keepitil.com/public/profile/' + p.slug };
      })
    };
  }

  // ── Handle a query: agent first for members, then brain, Gemini, canned ─────
  /* ══ CHO AGENT TOOLS ══════════════════════════════════════════════════════════════════════
     Founder 2026-08-28 §1/§2/§7: CHO turns intent into real KEEPITIL actions.

     THESE RUN BEFORE THE MODEL, DELIBERATELY. Navigation and Radio are DETERMINISTIC — "play
     EDM" has exactly one correct outcome, and routing it through a language model adds latency,
     cost and a chance of a wrong answer to a question that has a right one. It also means these
     tools keep working when NEXUS is unavailable, which it currently is, and for signed-out
     visitors, who have no session to invoke agent-tool-invoke with.
     Anything this layer does not recognise falls through untouched to the existing agent/brain
     chain, so nothing that worked before stops working.

     SAFETY CLASSES (§7): everything here is DIRECT — navigate, open, report, play. Not one of
     these functions writes. Consequential writes live behind explicit confirmation elsewhere. */
  var CHO_SECTIONS = [
    { re: /\b(culture)\b/i,                       href: '/culture/',      label: 'Culture' },
    { re: /\b(earn|radio page|royalt|playlist page)\b/i, href: '/earn/',   label: 'EARN' },
    { re: /\b(connect|creators?|directory|artists?)\b/i, href: '/connect/', label: 'CONNECT' },
    { re: /\b(create|competition|contest|compete|enter|submit)\b/i, href: '/create/', label: 'CREATE' },
    { re: /\b(discover|home ?page|events?)\b/i,   href: '/',              label: 'DISCOVER' }
  ];

  function choGo(href, label, why) {
    /* Navigation is a DIRECT action (§7) — no confirmation for simply moving the user. */
    setTimeout(function(){ try{ location.href = href; }catch(e){} }, 450);
    return { title: 'Opening ' + label, text: why || ('Taking you to ' + label + '…') };
  }

  function choRest(path) {
    return fetch(KIL_SUPA_URL + '/rest/v1/' + path, {
      headers: { apikey: KIL_SUPA_ANON, Authorization: 'Bearer ' + KIL_SUPA_ANON }
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* ── RADIO (§2) ─────────────────────────────────────────────────────────────────────────
     Drives the ONE existing player through the functions keepitil-radio.js already exposes.
     No second engine, and Culture's no-Radio rule is respected rather than worked around. */
  function choRadio(t) {
    var onCulture = /\/culture(\/|$)/i.test(location.pathname) || window.__kilRadioSuppressed === true;
    /* \bplay\b FAILS against "playing" — the boundary is mid-word — and this gate sits in
       front of every radio branch, so "what is playing?" was rejected before it could be
       recognised as a now-playing question at all. */
    var wantsRadio = /\b(radio|play(s|ing|ed)?|playlist|station|song|track|music)\b/i.test(t);
    if (!wantsRadio) return null;

    /* "what is playing" and "what song is on" are as common as "what's playing", and none
       of them matched: the leading term required the contraction, and \bplay\b fails
       mid-word against "playing". All nine phrasings are asserted in the commit. */
    if (/\b(what'?s?|which|current(ly)?)\b[\s\S]*\b(play(s|ing|ed)?|song|track|on)\b/i.test(t)
        || /\bnow playing\b/i.test(t)) {
      if (onCulture) return { title: 'Radio is off on Culture', text: 'Culture video owns the sound here, so the radio is not running. Ask me on EARN and I will tell you what is playing.' };
      var trackEl = document.getElementById('kil-track');
      var plEl = document.getElementById('kr-nowpl');
      var track = trackEl ? (trackEl.textContent || '').trim() : '';
      var pl = plEl ? (plEl.textContent || '').trim() : '';
      if (!track || /loading/i.test(track)) return { title: 'Radio', text: 'The player is still starting up. Give it a moment and ask again.' };
      return { title: '♫ Now playing', text: track + (pl ? '  ·  ' + pl : '') };
    }

    if (/\b(stop|pause|mute|turn (it )?off|silence)\b/i.test(t)) {
      var mute = document.getElementById('kr-mute');
      if (onCulture) return { title: 'Radio is already off here', text: 'Culture does not run the radio.' };
      if (mute) { mute.click(); return { title: 'Radio muted', text: 'Tap the speaker in the radio bar to bring it back.' }; }
      return null;
    }

    /* §2: asking for radio ON Culture explains the rule and offers the eligible surface rather
       than silently doing nothing or breaking the Culture audio rule. */
    if (onCulture) {
      return choGo('/earn/', 'EARN', 'Culture keeps its own video audio, so the radio does not run here. Taking you to EARN, where it does.');
    }

    var pls = (typeof window.__kilRadioPlaylists === 'function') ? window.__kilRadioPlaylists() : null;
    var list = (pls && pls.list) || [];

    if (/\b(next|skip)\b/i.test(t) && typeof window.__kilRadioSong === 'function') {
      window.__kilRadioSong(1); return { title: 'Skipped', text: 'Playing the next track.' };
    }
    if (/\b(previous|back|last)\b/i.test(t) && typeof window.__kilRadioSong === 'function') {
      window.__kilRadioSong(-1); return { title: 'Back', text: 'Playing the previous track.' };
    }

    /* Name a station and CHO switches to it. Matched against the REAL configured playlists, so
       a station that does not exist gets an honest list rather than an invented switch. */
    if (list.length && typeof window.__kilRadioSelect === 'function') {
      for (var i = 0; i < list.length; i++) {
        var nm = String(list[i].name || '');
        if (!nm) continue;
        var loose = nm.replace(/[^a-z0-9]/gi, '');
        if (new RegExp('\\b' + nm.replace(/[^a-z0-9]/gi, '.?') + '\\b', 'i').test(t) ||
            (loose && new RegExp(loose, 'i').test(t.replace(/[^a-z0-9]/gi, '')))) {
          window.__kilRadioSelect(i);
          return { title: '♫ ' + nm, text: 'Switched the radio to ' + nm + '.' };
        }
      }
    }

    if (/\b(play|start|put on)\b/i.test(t)) {
      var names = list.map(function (p) { return p.name; }).filter(Boolean);
      return { title: '♫ KEEPITIL Radio',
               text: 'The radio is running at the bottom of the page.' +
                     (names.length ? ' Stations: ' + names.join(' · ') + '. Name one and I will switch to it.' : '') };
    }
    return null;
  }

  /* ── OPEN AN ARTICLE / PROFILE / EVENT (§1) ─────────────────────────────────────────────
     Resolved against LIVE data, not a hard-coded list, and only published rows. If nothing
     matches, this returns null so the model still gets a chance rather than CHO asserting
     something that does not exist. */
  function choOpenNamed(t) {
    var m = t.match(/\b(?:open|show|read|go to|take me to|find)\b\s+(.+)$/i);
    if (!m) return Promise.resolve(null);
    var subject = m[1].replace(/\b(the|a|an|please|for me|profile|page|article|event)\b/gi, ' ')
                      .replace(/[?.!'"]/g, ' ').replace(/\s+/g, ' ').trim();
    if (subject.length < 2) return Promise.resolve(null);
    var enc = encodeURIComponent(subject);
    var wantsArticle = /\barticle|read\b/i.test(t);
    var wantsEvent   = /\bevent|show|gig|party\b/i.test(t);

    var lookups = [];
    if (!wantsEvent) {
      lookups.push(choRest('blog_articles?select=slug,title,artist_slug&status=eq.published&published=is.true&title=ilike.*' + enc + '*&limit=1')
        .then(function (r) { return (r && r[0]) ? { kind: 'article', href: '/article/' + (r[0].artist_slug || r[0].slug) + '/', label: r[0].title } : null; }));
    }
    if (!wantsArticle) {
      lookups.push(choRest('events?select=slug,title&status=eq.published&title=ilike.*' + enc + '*&limit=1')
        .then(function (r) { return (r && r[0]) ? { kind: 'event', href: '/event.html?e=' + encodeURIComponent(r[0].slug), label: r[0].title } : null; }));
    }
    lookups.push(choRest('profile_meta?select=slug,display_name&slug=ilike.*' + enc.replace(/%20/g, '-') + '*&limit=1')
      .then(function (r) { return (r && r[0]) ? { kind: 'profile', href: '/profile.html?slug=' + encodeURIComponent(r[0].slug), label: r[0].display_name || r[0].slug } : null; }));

    return Promise.all(lookups).then(function (res) {
      var order = wantsArticle ? ['article', 'profile', 'event']
                : wantsEvent   ? ['event', 'profile', 'article']
                :                ['article', 'profile', 'event'];
      for (var k = 0; k < order.length; k++) {
        for (var j = 0; j < res.length; j++) {
          if (res[j] && res[j].kind === order[k]) return choGo(res[j].href, res[j].label);
        }
      }
      return null;
    }).catch(function () { return null; });
  }

  /* ── WHAT CAN I ENTER RIGHT NOW (§1) ────────────────────────────────────────────────────
     Reads the real competition table and reports only what is genuinely open. */
  function choCompetitions(t) {
    if (!/\b(competition|contest|compete|enter|submit|create)\b/i.test(t)) return Promise.resolve(null);
    if (!/\b(what|which|any|show|list|current|open|this month|can i)\b/i.test(t)) return Promise.resolve(null);
    var nowIso = new Date().toISOString();
    return choRest('vs_competitions?select=slug,title,cadence,submissions_close_at&status=eq.published&order=submissions_close_at.asc&limit=8')
      .then(function (rows) {
        if (!rows || !rows.length) return null;
        var open = rows.filter(function (c) { return !c.submissions_close_at || c.submissions_close_at > nowIso; });
        if (!open.length) return { title: 'Nothing open right now', text: 'No competitions are accepting entries at the moment. New rounds open on a schedule — check CREATE.' };
        return {
          title: '🏆 ' + open.length + ' competition' + (open.length === 1 ? '' : 's') + ' open',
          text: open.map(function (c) {
            return '• ' + c.title + (c.cadence ? ' (' + c.cadence + ')' : '');
          }).join('\n') + '\n\nSay "open ' + open[0].title + '" and I will take you there.'
        };
      }).catch(function () { return null; });
  }

  /* The single entry point. Returns a card, or null to fall through to the existing chain. */
  function choAct(text) {
    var t = String(text || '');
    var r = choRadio(t);
    if (r) return Promise.resolve(r);
    return choCompetitions(t).then(function (c) {
      if (c) return c;
      /* ⚠ SECTION NAMES WIN WHEN THE SUBJECT *IS* THE SECTION.
         "take me to Culture" was resolving to an EVENT called "Orchestra Noir - Culture 2000
         Tour II", because the named lookup ran first and an ilike match on the title found it.
         A bare section name is an unambiguous destination and must not be beaten by a title
         that merely contains the word. A longer phrase ("open the Culture 2000 article") still
         falls through to the named lookup, because the subject is then more than the section. */
      var bare = t.replace(/\b(open|go to|take me to|show me|please|the|to)\b/gi, ' ')
                  .replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim();
      if (bare) {
        for (var b = 0; b < CHO_SECTIONS.length; b++) {
          if (CHO_SECTIONS[b].re.test(bare) && bare.split(' ').length <= 2) {
            return choGo(CHO_SECTIONS[b].href, CHO_SECTIONS[b].label);
          }
        }
      }
      return choOpenNamed(t).then(function (o) {
        if (o) return o;
        /* Longer navigation phrases, after the named lookup has had its chance. */
        if (/\b(open|go to|take me to|show me)\b/i.test(t)) {
          for (var i = 0; i < CHO_SECTIONS.length; i++) {
            if (CHO_SECTIONS[i].re.test(t)) return choGo(CHO_SECTIONS[i].href, CHO_SECTIONS[i].label);
          }
        }
        return null;
      });
    });
  }
  window.__choAct = choAct;

  function handleQuery(text) {
    addMessage('user', text);
    showTyping();

    /* Deterministic tools first (§1/§2). They answer navigation and Radio without a round trip,
       work signed-out, and work while NEXUS is unavailable. Null means "not mine" and the
       existing agent/brain chain runs exactly as before. */
    choAct(text).then(function (choCard) {
      if (choCard) { hideTyping(); addMessage('bot', choCard); return null; }
      return askAgent(text).then(function (a) {
      var acard = agentCard(a);
      if (acard) { hideTyping(); addMessage('bot', acard); return; }

      // Router resolved a READ intent -> actually run the tool and answer with data.
      var readIntent = (a && a.resolved && a.intent) ? a.intent : null;
      return runReadTool(readIntent, text).then(function (tcard) {
        if (tcard) { hideTyping(); addMessage('bot', tcard); return; }

        // Not signed in, no tool match, or the tool found nothing -> legacy chain.
        return askBrain(text).then(function (d) {
          var card = brainCard(d);
          if (card) { hideTyping(); addMessage('bot', card); return; }
          return askEcho(text).then(function (e) {
            hideTyping();
            addMessage('bot', echoCard(e) || fallbackCard(text));
          });
        });
      });
      });          /* close askAgent().then */
    }).catch(function () {
      hideTyping();
      addMessage('bot', fallbackCard(text));
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();
    buildWidget();

    var panel = document.getElementById('kilo-panel');
    var btn   = document.getElementById('kilo-btn');
    var badge = document.getElementById('kilo-badge');
    var close = document.getElementById('kilo-close');
    var input = document.getElementById('kilo-input');
    var send  = document.getElementById('kilo-send');
    msgs = document.getElementById('kilo-msgs');

    // Feedback lives on the chat now (the standalone Feedback pill is hidden).
    var fbBtn = document.getElementById('kilo-fb');
    if (fbBtn) fbBtn.addEventListener('click', function(){
      if (window.KILfeedbackOpen) { window.KILfeedbackOpen(); }
      else { location.href = 'mailto:hello@keepitil.com?subject=KEEPITIL%20Feedback'; }
    });

    var isOpen = false;

    // Show badge after 4 seconds if not opened
    setTimeout(function() {
      if (!isOpen) { badge.style.display = 'flex'; }
    }, 4000);

    function openPanel() {
      isOpen = true;
      kiloApplyAuthRows();
      panel.classList.add('open');
      document.body.classList.add('kilo-open');
      badge.style.display = 'none';
      input.focus();
      // Welcome message on first open
      if (!msgs.hasChildNodes()) {
        /* §50: the old greeting described KEEPITIL as a SoCal music guide. The product is an
           events + creators + competitions + culture + radio ecosystem and the data no longer
           supports that framing, so the copy stops claiming it. */
        addMessage('bot', {
          title: 'CHO',
          text: 'I can find events, open creator profiles and articles, show you what you can enter on CREATE, play KEEPITIL Radio and help you submit work. What do you need?',
          chips: WELCOME_CHIPS,
        });
        /* §49: renderWelcomeActions() drew LOG IN / CREATE inside the conversation. Row 2
           is now those exact destinations, permanently visible and outside the scroll —
           so the in-message pair was the same two buttons twice, costing the first
           screen of conversation. The function is kept (nothing else calls it) so the
           chips can come back if the shell ever changes. */
      }
    }

    /* §C — the two options, rendered as real links.
       BROKEN != EMPTY: chat is now a critical path, so if the agent cannot answer these still
       work. They are plain anchors to real pages, not messages sent to a model — nothing about
       them depends on the agent being up. If the panel itself fails to build, the button falls
       back to the same destinations (see the catch below). */
    function renderWelcomeActions() {
      try {
        var wrap = document.createElement('div');
        wrap.className = 'kilo-actions';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'What would you like to do?');
        wrap.innerHTML = welcomeActions().map(function (a) {
          return '<a class="kilo-action" href="' + a.href + '">' + a.label + '</a>';
        }).join('');
        msgs.appendChild(wrap);
        msgs.scrollTop = msgs.scrollHeight;
      } catch (e) {
        /* If even this fails, say so and give the direct link rather than showing nothing. */
        try {
          var f = document.createElement('div');
          f.className = 'kilo-actions';
          f.innerHTML = '<span style="color:#9aa;font-size:.8rem">The assistant is unavailable. ' +
                        '<a class="kilo-action" href="' + KIL_CREATE_URL + '">Create an event</a> ' +
                        '<a class="kilo-action" href="/apply.html">Log in</a></span>';
          msgs.appendChild(f);
        } catch (e2) {}
      }
    }

    function closePanel() {
      isOpen = false;
      panel.classList.remove('open');
      document.body.classList.remove('kilo-open');
    }

    /* ── OPTIONS MENU (§25/§43/§44) ────────────────────────────────────────────────────────
       Signed out: LOGIN · CHAT      Signed in: PROFILE · CHAT
       Built on every open, not once at boot: a visitor can sign in without a reload, and a
       menu cached at boot would keep offering LOGIN to someone who is already signed in. */
    var optMenu = null;
    function closeOptions(){
      if(optMenu){ optMenu.remove(); optMenu = null; }
      btn.setAttribute('aria-expanded','false');
    }
    function openOptions(){
      closeOptions();
      var signed = kilSignedIn();
      optMenu = document.createElement('div');
      optMenu.id = 'kilo-options';
      optMenu.setAttribute('role','menu');
      var first = signed
        ? '<a role="menuitem" href="/profile.html">Profile</a>'
        : '<a role="menuitem" href="/apply.html">Login</a>';
      optMenu.innerHTML = first + '<button role="menuitem" type="button" data-opt="chat">Chat</button>';
      document.body.appendChild(optMenu);
      btn.setAttribute('aria-expanded','true');
      optMenu.querySelector('[data-opt="chat"]').addEventListener('click', function(e){
        /* ⚠ STOP THE EVENT HERE. The document-level outside-click handler runs on the SAME
           click, and by the time it does, closeOptions() has already removed the menu — so a
           guard that tests `optMenu.contains(target)` is testing a node that no longer exists
           and the panel is closed the instant it opens. Measured twice: chatOpen=false with the
           greeting fully rendered. Not letting the click reach the document is the fix that
           does not depend on ordering. */
        e.stopPropagation();
        closeOptions(); openPanel();
      });
    }
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (isOpen) { closePanel(); return; }
      if (optMenu) closeOptions(); else openOptions();
    });
    document.addEventListener('click', function(e){
      if (optMenu && !optMenu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) closeOptions();
    }, true);

    /* ── ROW 2 (§46/§47) ───────────────────────────────────────────────────────────────────
       Rebuilt every time the panel opens, for the same reason the menu is. */
    function kiloApplyAuthRows(){
      var row = document.getElementById('kilo-row2');
      if(!row) return;
      row.innerHTML = kilSignedIn()
        ? '<a class="kilo-r2" href="/profile.html">Profile</a>'
          + '<a class="kilo-r2" href="/create/">Create</a>'
        : '<a class="kilo-r2" href="/apply.html">Login</a>';
    }
    window.__kiloApplyAuthRows = kiloApplyAuthRows;
    close.addEventListener('click', closePanel);

    // Close on outside click.
    // ⚠ THE OPTIONS MENU COUNTS AS INSIDE. Chat is launched FROM that menu, which lives outside
    // the panel — so without this test the same click opened the panel and then immediately
    // closed it again, and Chat appeared not to work at all. Measured: chatOpen=false right
    // after clicking Chat.
    document.addEventListener('click', function(e) {
      if (optMenu && optMenu.contains(e.target)) return;
      if (isOpen && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closePanel();
      }
    });

    // Send
    function sendQuery() {
      var text = input.value.trim();
      if (!text) return;
      input.value = '';
      handleQuery(text);
    }

    send.addEventListener('click', sendQuery);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') sendQuery();
    });

    // Escape closes
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && isOpen) closePanel();
    });
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

/* ── KEEPITIL universal MOBILE nav: single-row logo + emoji categories (mobile only) ── */
(function(){
  function injectMobileNav(){return;
    try{ if(!window.matchMedia || !matchMedia('(max-width:768px)').matches) return; }catch(e){ return; }
    if(document.querySelector('.nav-links .nav-emoji')) return; /* homepage already has the emoji nav */
    var ul=document.querySelector('ul.nav-links')||document.querySelector('.nav-links');
    if(!ul) return;
    if(!document.getElementById('kil-mnav-css')){
      var st=document.createElement('style'); st.id='kil-mnav-css';
      st.textContent="@media(max-width:768px){"
        +".nav-hamburger{display:none!important;}.mobile-menu{display:none!important;}"
        +".nav-inner>a.nav-cta{display:none!important;}.nav-brand{display:none!important;}"
        +".nav-inner{flex-wrap:nowrap!important;gap:6px;align-items:center;padding:4px 6px;}"
        +".nav-logo{flex-shrink:0;}.nav-logo img{height:30px!important;}"
        +".nav-links{display:flex!important;flex:1 1 auto;min-width:0;justify-content:space-between;gap:1px;margin:0;padding:0;overflow-x:auto;scrollbar-width:none;list-style:none;}"
        +".nav-links::-webkit-scrollbar{display:none;}"
        +".nav-links li{flex:1 1 0;min-width:46px;list-style:none;}"
        +".nav-links a{display:flex!important;flex-direction:column;align-items:center;gap:2px;font-size:.46rem;letter-spacing:.01em;line-height:1;color:rgba(255,255,255,.85)!important;text-align:center;padding:2px 0;white-space:normal;}"
        +".kil-nav-ico{display:block;width:19px;height:19px;}"
        +".kil-nav-ico svg{width:100%;height:100%;display:block;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none;}"
        +"}";
      document.head.appendChild(st);
    }
    /* ── Original KEEPITIL monoline nav icons (drawn in-house, currentColor stroke) ── */
    var ICON={
      scene:'<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/>',
      culture:'<path d="M12 6c-1.8-1.2-4-1.6-6.5-1.4A1 1 0 0 0 4.5 5.6v11a1 1 0 0 0 1.1 1c2.3-.2 4.6.2 6.4 1.4 1.8-1.2 4.1-1.6 6.4-1.4a1 1 0 0 0 1.1-1v-11a1 1 0 0 0-1-1.1C16 4.4 13.8 4.8 12 6Z"/><path d="M12 6v12"/>',
      shop:'<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      login:'<path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/><path d="M10 8l4 4-4 4"/><path d="M14 12H4"/>',
      grow:'<path d="M4 20V4M4 20h16"/><path d="M7 15l3-3 3 2 5-6"/><path d="M15 8h3v3"/>',
      artist:'<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3M9 20h6"/>',
      brand:'<path d="M4 4h7l9 9-7 7-9-9V4Z"/><circle cx="8" cy="8" r="1.3"/>',
      organizer:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/>',
      link:'<path d="M9 15l6-6"/><path d="M10 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M14 18l-1 1a4 4 0 0 1-6-6l1-1"/>'
    };
    var map=[['/connect','scene'],['/culture','culture'],['amazon','shop'],['/apply.html','login'],['/signup','login'],['/grow','grow'],['/artist','artist'],['/brand','brand'],['/organizer','organizer']];
    function iconName(href){ href=(href||'').toLowerCase(); for(var i=0;i<map.length;i++){ if(href.indexOf(map[i][0])>-1) return map[i][1]; } return 'link'; }
    function makeIco(name){ var s=document.createElement('span'); s.className='kil-nav-ico'; s.setAttribute('aria-hidden','true'); s.innerHTML='<svg viewBox="0 0 24 24">'+(ICON[name]||ICON.link)+'</svg>'; return s; }
    /* Build ONE canonical mobile header on EVERY page: Culture · Scene · Login (logo = home) */
    if(ul.getAttribute('data-kil-mnav')) return;
    ul.setAttribute('data-kil-mnav','1');
    var CANON=[['/culture','CULTURE','culture'],['/connect','CONNECT','connect'],['/apply.html','LOGIN','login']];
    ul.innerHTML='';
    CANON.forEach(function(it){
      var li=document.createElement('li');
      var a=document.createElement('a'); a.href=it[0];
      a.appendChild(makeIco(it[2]));
      a.appendChild(document.createTextNode(it[1]));
      li.appendChild(a); ul.appendChild(li);
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', injectMobileNav);
  else injectMobileNav();
})();

/* Nudge stale service workers to fetch the latest sw.js in the background.
   NO auto-reload: a controllerchange->location.reload() loops on mobile Safari
   (skipWaiting + claim re-fires controllerchange every load). The new SW simply
   takes over on the next natural navigation. */
(function(){
  try{
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function(rs){
      rs.forEach(function(r){ try{ r.update(); }catch(e){} });
    }).catch(function(){});
  }catch(e){}
})();
