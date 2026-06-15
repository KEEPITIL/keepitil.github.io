/**
 * KEEPITIL â Google Apps Script Backend
 * ======================================
 * Handles signups from signup.html and subscriber emails from index.html
 * Writes each submission to the correct tab in the Google Sheet.
 *
 * HOW TO DEPLOY:
 * 1. Go to https://script.google.com
 * 2. Create a new project, name it "KEEPITIL Signups"
 * 3. Paste this entire file into the editor
 * 4. Click "Deploy" â "New deployment"
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Click "Deploy" and copy the Web App URL
 * 6. Paste that URL into signup.html where it says:
 *    const GAS_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
 * 7. Also paste it into index.html in the subscribe form handler
 */

const SHEET_ID = '1fK_pBO8wc-PVWriiW8VSplFYPkBdAbclvD0Si-i3eVM';

// Tab names in the Google Sheet
const TABS = {
  artist:     'artists',
  brand:      'brands',
  organizer:  'organizers',
  subscriber: 'subscribers'
};

// Column headers for each tab
const HEADERS = {
  artist: [
    'Submitted','Artist Name','Real Name','Type','Genre',
    'City','County','Instagram','SoundCloud / Spotify','Email','Bio'
  ],
  brand: [
    'Submitted','Brand Name','Category','Location','Contact Name',
    'Email','Website','Instagram','Bio','Partnership Interest'
  ],
  organizer: [
    'Submitted','Org Name','Contact Name','City','County',
    'Email','Instagram','Website','Event Types','Bio','Next Event'
  ],
  subscriber: [
    'Submitted','Email'
  ]
};

// Field order when writing a row (must match HEADERS above)
const ROW_FIELDS = {
  artist:     ['submitted','artist_name','real_name','artist_type','genre','city','county','instagram','soundcloud','email','bio'],
  brand:      ['submitted','brand_name','category','location','contact_name','email','website','instagram','bio','partnership'],
  organizer:  ['submitted','org_name','contact_name','city','county','email','instagram','website','event_types','bio','next_event'],
  subscriber: ['submitted','email']
};

function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const type = (data.type || 'subscriber').toLowerCase();

    if (!TABS[type]) {
      return jsonResponse({success: false, error: 'Unknown type: ' + type});
    }

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const tabName = TABS[type];
    let sheet = ss.getSheetByName(tabName);

    // Create tab + header row if it doesn't exist yet
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(HEADERS[type]);
      sheet.getRange(1, 1, 1, HEADERS[type].length)
        .setBackground('#1a1a2e')
        .setFontColor('#00b4ff')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // Build the row from the data object
    const fields = ROW_FIELDS[type];
    const row = fields.map(f => {
      if (f === 'submitted') return new Date().toLocaleString('en-US', {timeZone: 'America/Los_Angeles'});
      return (data[f] || '').toString().trim();
    });

    sheet.appendRow(row);

    return jsonResponse({success: true, type: type, rows: sheet.getLastRow() - 1});

  } catch(err) {
    return jsonResponse({success: false, error: err.message});
  }
}

function doGet(e) {
  // Health check
  return jsonResponse({status: 'KEEPITIL GAS running', time: new Date().toISOString()});
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
