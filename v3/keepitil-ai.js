/*!
 * Echo — KEEPITIL AI Assistant  v2.0
 * Floating chat widget | keepitil.com
 * Self-contained, zero dependencies.
 */
// Auto-load KEEPITIL Radio Bar on every page
(function(){if(!window.__kilRadioInit){var s=document.createElement('script');s.src='/keepitil-radio.js';document.head.appendChild(s);}})();
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
        { url: 'https://keepitil.com/blog-crssd-fall-2026.html', label: 'KEEPITIL CRSSD Guide' },
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
        { url: 'https://keepitil.com/blog-hard-summer-2026.html', label: 'KEEPITIL HARD Summer Guide' },
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
        { url: 'https://keepitil.com/blog-nocturnal-wonderland-2026.html', label: 'KEEPITIL Nocturnal Guide' },
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
        { url: 'https://keepitil.com/blog-escape-halloween-2026.html', label: 'KEEPITIL Escape Guide' },
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
        { url: 'https://keepitil.com/blog-booking-underground-djs-guide.html', label: 'Full Booking Guide' },
      ],
      chips: ['What info to include', 'DJ rates', 'Work with organizers', 'Market your event'],
    },
    {
      id: 'booking-info',
      kw: ['booking info','what to include','booking request','booking email','how to contact','reach out to dj'],
      title: '📝 What to Include in a Booking Request',
      text: 'When reaching out to book an artist, include:\n\n• Event date and time (set time if known)\n• Venue name and location\n• Event type (festival, club night, private, etc.)\n• Expected attendance\n• Your budget or "what\'s your rate?"\n• A link to your past events or Instagram\n\nKeep it short and professional. Artists get a lot of DMs — lead with the date and budget.',
      links: [
        { url: 'https://keepitil.com/blog-booking-underground-djs-guide.html', label: 'Underground DJ Booking Guide' },
      ],
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
        { url: 'https://keepitil.com/blog-how-to-promote-your-event-oc-la.html', label: 'Event Promotion Guide' },
        { url: 'https://keepitil.com/organizer/', label: 'Organizer Directory' },
        { url: 'https://keepitil.com/blog-tip-sound-system-guide.html', label: 'Sound System Guide' },
      ],
      chips: ['Sound system guide', 'How to book a DJ', 'Promote your event', 'Event budget tips'],
    },
    {
      id: 'promote-event',
      kw: ['promote event','market event','event marketing','flyer','flyer design','promotion strategy','how to get people','selling tickets','ticket sales','build buzz','social media event','instagram event'],
      title: '📢 Promoting Your Event',
      text: 'Underground event promotion in 2026:\n\n• Instagram is still king — post the flyer, then reels of past events, then countdown stories\n• Get the artist to repost — their audience is already qualified\n• RA (Resident Advisor) listing is a must for any serious event\n• Local Facebook groups for dance music communities still drive real turnout\n• Flyer in person at other events — people who go out, go out again\n• Reach out to KEEPITIL for potential editorial coverage\n\nTiming: soft announce 4 weeks out, push 1 week before, final story blast day-of.',
      links: [
        { url: 'https://keepitil.com/blog-how-to-promote-your-event-oc-la.html', label: 'Full Promotion Guide' },
        { url: 'https://keepitil.com/blog-tip-dj-instagram-brand-2026.html', label: 'DJ Instagram Guide' },
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
        { url: 'https://keepitil.com/blog-mixing-techniques-beginners.html', label: 'Mixing Techniques Guide' },
        { url: 'https://keepitil.com/blog-tip-long-dj-set-guide.html', label: 'Long DJ Set Guide' },
        { url: 'https://keepitil.com/blog-tip-networking-underground-events.html', label: 'Networking Guide' },
        { url: 'https://keepitil.com/artist/', label: 'Artist Directory' },
      ],
      chips: ['Equipment guide', 'DJ Instagram tips', 'How to get booked', 'Networking guide'],
    },
    {
      id: 'equipment',
      kw: ['equipment','gear','controller','cdj','pioneer','mixer','setup','dj setup','turntable','technics','serato','rekordbox','traktor','laptop dj','hardware','speakers','sound system'],
      title: '🎛️ DJ Equipment',
      text: 'A breakdown of the key equipment decisions for DJs:\n\n• CDJs (Pioneer CDJ-2000NXS2 / CDJ-3000): Club standard. Learn these for serious gigs.\n• Controllers (Pioneer DDJ-400, DDJ-REV7): Great for home and smaller gigs. Not club standard but excellent to learn on.\n• Turntables (Technics 1200): Vinyl DJs still use these. Less common in underground clubs but iconic.\n• Mixer: A good mixer matters. Pioneer DJM-900NXS2 is the club standard.\n• Software: Rekordbox for preparing tracks for CDJs. Serato if you\'re using a controller.\n\nFor production: Ableton Live is the dominant DAW in electronic music. Start with the intro version.',
      links: [
        { url: 'https://keepitil.com/blog-dj-equipment-guide-2026.html', label: 'Full Equipment Guide 2026' },
        { url: 'https://keepitil.com/blog-tip-sound-system-guide.html', label: 'Sound System Guide (for Events)' },
      ],
      chips: ['Mixing techniques', 'DJ career tips', 'Bedroom producer guide', 'Equipment for events'],
    },
    {
      id: 'production',
      kw: ['produce','producer','music production','ableton','fl studio','logic','daw','make music','make beats','bedroom producer','synthesis','sample','plugin','vst','how to produce','sound design'],
      title: '🎹 Music Production',
      text: 'Getting started with electronic music production:\n\n• Pick one DAW and stick to it. Ableton Live is standard for electronic music. Logic Pro is excellent on Mac. FL Studio has a strong community.\n• Learn music theory basics — you don\'t need to master it, but understanding key and scale will accelerate everything\n• Study tracks you love: load them into your DAW and analyze the structure\n• Finish tracks, even bad ones. Completion teaches more than abandoning 40% of projects\n• SoundCloud and Bandcamp for releasing early work\n• Give yourself 2+ years of serious practice before expecting quality results',
      links: [
        { url: 'https://keepitil.com/blog-bedroom-producer-guide-2026.html', label: 'Bedroom Producer Guide 2026' },
      ],
      chips: ['DJ career tips', 'Equipment guide', 'Music industry knowledge', 'Submit music to KEEPITIL'],
    },
    {
      id: 'party-tips',
      kw: ['tips','going out','rave tips','festival tips','first rave','first festival','what to wear','what to bring','dress code','safety','rave safety','rave culture','etiquette','rave etiquette','behave','how to act'],
      title: '🪩 Party & Rave Tips',
      text: 'New to the underground scene? Here\'s what you need to know:\n\n• Arrive at a reasonable time — the best sets aren\'t always headliners\n• Dress for the music, not the \'gram. Dark clothes, comfortable shoes. You\'ll be on your feet for hours.\n• Know the etiquette: respect the dancefloor, don\'t talk loudly over the music, don\'t block views\n• Take breaks — find a quiet spot, drink water, step outside briefly\n• Look out for your people and those around you. This community takes care of each other.\n• Phones on the dancefloor: keep it minimal. Be present. Record a little, experience a lot.',
      links: [
        { url: 'https://keepitil.com/blog-rave-etiquette-guide.html', label: 'Rave Etiquette Guide' },
        { url: 'https://keepitil.com/blog-tip-festival-packing-guide-socal.html', label: 'Festival Packing Guide' },
      ],
      chips: ['Festival packing list', 'Find events near me', 'Rave safety', 'Rave culture history'],
    },
    {
      id: 'packing',
      kw: ['packing','what to bring','packing list','bag','backpack','festival bag','essentials','what do i need','festival preparation','prepare for festival','gear for festival'],
      title: '🎒 Festival Packing Guide',
      text: 'SoCal festival essentials:\n\n✓ Fanny pack or small bag (keep it light)\n✓ ID + card + some cash\n✓ Water bottle (many festivals have refill stations)\n✓ Portable phone charger\n✓ Earplugs — protect your hearing, you\'ll still hear everything\n✓ Comfortable shoes (you\'ll walk 15,000+ steps)\n✓ Light jacket for late nights — even summer desert nights get cold\n✓ Sunscreen if it\'s a daytime event\n✓ Mints, snacks\n\nLeave at home: heavy bags, laptops, valuables you can\'t replace.',
      links: [
        { url: 'https://keepitil.com/blog-tip-festival-packing-guide-socal.html', label: 'Full Festival Packing Guide' },
      ],
      chips: ['Rave etiquette', 'Rave tips', 'Find events near me'],
    },
    {
      id: 'history',
      kw: ['history','origin','where did','how did','house music history','techno history','rave history','california rave','underground history','electronic music history','genre','garage','drum and bass','dnb','uk garage'],
      title: '📚 Music History',
      text: 'KEEPITIL\'s culture blog covers the history of the genres that built underground electronic music — from Chicago house to Berlin techno, Detroit to Bristol, and the California rave scene.',
      links: [
        { url: 'https://keepitil.com/blog-history-of-house-music.html', label: 'History of House Music' },
        { url: 'https://keepitil.com/blog-history-of-techno.html', label: 'History of Techno' },
        { url: 'https://keepitil.com/blog-history-of-uk-garage.html', label: 'History of UK Garage' },
        { url: 'https://keepitil.com/blog-history-of-drum-and-bass.html', label: 'History of Drum & Bass' },
        { url: 'https://keepitil.com/blog-rave-culture-california-history.html', label: 'California Rave History' },
      ],
      chips: ['Techno subgenres', 'House music subgenres', 'UK garage scene', 'SoCal underground scene'],
    },
    {
      id: 'socal-scene',
      kw: ['socal','southern california','los angeles','la','orange county','oc','san diego','sd','inland empire','ie','local scene','underground scene','local events','local dj'],
      title: '🌴 SoCal Underground Scene',
      text: 'The SoCal underground electronic music scene is one of the most active in the country, spanning:\n\n• Orange County: smaller club nights, house music focus, tight-knit community\n• Los Angeles: massive reach, warehouse raves, major touring acts, every subgenre\n• San Diego: festival culture strong (CRSSD), strong house and tech house scene\n• Inland Empire: growing underground warehouse scene, large outdoor raves\n\nKEEPITIL covers it all.',
      links: [
        { url: 'https://keepitil.com/blog-la-underground-music-guide.html', label: 'LA Underground Guide' },
        { url: 'https://keepitil.com/blog-oc-underground-guide.html', label: 'OC Underground Guide' },
        { url: 'https://keepitil.com/blog-san-diego-underground-scene.html', label: 'San Diego Scene Guide' },
        { url: 'https://keepitil.com/blog-inland-empire-underground-scene.html', label: 'Inland Empire Scene' },
      ],
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
        { url: 'https://keepitil.com/blog-tip-networking-underground-events.html', label: 'Networking at Underground Events' },
        { url: 'https://keepitil.com/#events-container', label: 'Find Events to Attend' },
      ],
      chips: ['How to get gigs', 'Work with organizers', 'Find events to attend'],
    },
    {
      id: 'instagram',
      kw: ['instagram','ig','social media','social','content','posts','reels','stories','tiktok','online presence','brand yourself','personal brand','online','social strategy'],
      title: '📱 Building Your Presence Online',
      text: 'For artists, organizers, and brands in electronic music, Instagram is still the primary platform. What works in 2026:\n\n• Post consistently — 3–5x per week\n• Reels get more reach than static posts — use them for event recaps, studio clips, gear content\n• Stories for real-time: announcements, behind the scenes, polls\n• Your bio should say who you are and where you operate (DJ | OC/LA, for example)\n• Tag venues and artists in your posts\n• Your link should go somewhere useful — KEEPITIL profile, SoundCloud, or a link-in-bio\n\nTikTok: growing in the scene, worth being on, but Instagram still books gigs.',
      links: [
        { url: 'https://keepitil.com/blog-tip-dj-instagram-brand-2026.html', label: 'DJ Instagram Branding Guide' },
      ],
      chips: ['DJ career tips', 'Promote your event', 'Brand partnerships'],
    },
  ];

  // ── Quick chip suggestions shown at welcome ──────────────────────────────────
  var WELCOME_CHIPS = [
    'Find events near me',
    'Book an artist',
    'Organize an event',
    'Brand partnerships',
    'DJ career tips',
    'About KEEPITIL',
  ];

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
      '#kilo-btn{position:fixed;bottom:132px;right:24px;z-index:99998;width:58px;height:58px;border-radius:50%;',
      'background:linear-gradient(135deg,#00b4ff,#00ff88);border:none;cursor:pointer;',
      'box-shadow:0 4px 24px rgba(0,180,255,.35),0 0 0 0 rgba(0,180,255,.4);',
      'display:flex;align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;',
      'animation:kilo-pulse 3s ease-in-out infinite;}',
      '#kilo-btn:hover{transform:scale(1.08);box-shadow:0 6px 32px rgba(0,180,255,.5);}',
      '#kilo-btn svg{width:26px;height:26px;fill:#0f0f1a;}',
      '#kilo-badge{position:absolute;top:-3px;right:-3px;background:#00ff88;color:#0f0f1a;',
      'font-size:10px;font-weight:800;width:18px;height:18px;border-radius:50%;',
      "font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;}",
      '@keyframes kilo-pulse{0%,100%{box-shadow:0 4px 24px rgba(0,180,255,.35),0 0 0 0 rgba(0,180,255,.4);}',
      '50%{box-shadow:0 4px 24px rgba(0,180,255,.35),0 0 0 8px rgba(0,180,255,0);}}',

      '#kilo-panel{position:fixed;bottom:200px;right:24px;z-index:99999;width:360px;max-width:calc(100vw - 32px);',
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
      '@media(max-width:480px){#kilo-panel{bottom:200px;right:12px;width:calc(100vw - 24px);}',
      '#kilo-btn{bottom:132px;right:16px;}}',
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
    btn.setAttribute('aria-label', 'Open KEEPITIL AI Assistant');
    btn.innerHTML = [
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">',
        '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>',
        '<circle cx="8.5" cy="11" r="1.5"/><circle cx="12" cy="11" r="1.5"/><circle cx="15.5" cy="11" r="1.5"/>',
      '</svg>',
      '<span id="kilo-badge" style="display:none">1</span>',
    ].join('');

    // Panel
    var panel = document.createElement('div');
    panel.id = 'kilo-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Echo — KEEPITIL AI Assistant');
    panel.innerHTML = [
      '<div id="kilo-header">',
        '<div id="kilo-avatar">',
          '<svg viewBox="0 0 24 24"><path d="M12 3C6.48 3 2 6.69 2 11.25c0 2.49 1.36 4.73 3.5 6.25V21l3.5-2.25c.96.26 1.97.4 3 .4 5.52 0 10-3.69 10-8.25S17.52 3 12 3z"/></svg>',
        '</div>',
        '<div id="kilo-hinfo">',
          '<div id="kilo-hname">Echo</div>',
          '<div id="kilo-hsub">KEEPITIL Intelligence</div>',
        '</div>',
        '<button id="kilo-fb" aria-label="Send feedback" title="Send feedback">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        '</button>',
        '<button id="kilo-close" aria-label="Close">',
          '<svg viewBox="0 0 24 24" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '</button>',
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

  // ── Handle a query ───────────────────────────────────────────────────────────
  function handleQuery(text) {
    addMessage('user', text);
    showTyping();
    setTimeout(function() {
      hideTyping();
      var match = matchIntent(text);
      if (match) {
        addMessage('bot', match);
      } else {
        addMessage('bot', {
          title: '🔍 I\'m not sure about that',
          text: 'I didn\'t catch that one. Try asking about events, booking artists, organizing events, brand partnerships, DJ tips, or the SoCal underground scene. Or pick a topic below:',
          chips: WELCOME_CHIPS,
        });
      }
    }, 650 + Math.random() * 300);
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
      panel.classList.add('open');
      badge.style.display = 'none';
      input.focus();
      // Welcome message on first open
      if (!msgs.hasChildNodes()) {
        addMessage('bot', {
          title: 'Hey 👋 I\'m Echo',
          text: 'Your KEEPITIL guide to the SoCal music scene. Ask me about events, booking artists, organizing, brand partnerships, DJ tips, music history — whatever you need.',
          chips: WELCOME_CHIPS,
        });
      }
    }

    function closePanel() {
      isOpen = false;
      panel.classList.remove('open');
    }

    btn.addEventListener('click', function() {
      if (isOpen) closePanel(); else openPanel();
    });
    close.addEventListener('click', closePanel);

    // Close on outside click
    document.addEventListener('click', function(e) {
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
    var map=[['/v3/scene','scene'],['/v3/culture','culture'],['amazon','shop'],['/v3/shop','shop'],['/v3/apply','login'],['/signup','login'],['/grow','grow'],['/artist','artist'],['/brand','brand'],['/organizer','organizer']];
    function iconName(href){ href=(href||'').toLowerCase(); for(var i=0;i<map.length;i++){ if(href.indexOf(map[i][0])>-1) return map[i][1]; } return 'link'; }
    function makeIco(name){ var s=document.createElement('span'); s.className='kil-nav-ico'; s.setAttribute('aria-hidden','true'); s.innerHTML='<svg viewBox="0 0 24 24">'+(ICON[name]||ICON.link)+'</svg>'; return s; }
    /* Build ONE canonical mobile header on EVERY page: Culture · Scene · Login (logo = home) */
    if(ul.getAttribute('data-kil-mnav')) return;
    ul.setAttribute('data-kil-mnav','1');
    var CANON=[['/v3/culture','CULTURE','culture'],['/v3/scene.html','SCENE','scene'],['/v3/apply.html','LOGIN','login']];
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

/* Force stale service workers to update on every load; auto-reload once when new SW takes control */
(function(){
  try{
    if(!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistrations().then(function(rs){
      rs.forEach(function(r){ try{ r.update(); }catch(e){} });
    }).catch(function(){});
    var reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange', function(){
      if(reloaded) return; reloaded=true; location.reload();
    });
  }catch(e){}
})();
