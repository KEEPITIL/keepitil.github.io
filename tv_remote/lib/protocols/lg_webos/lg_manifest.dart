/// The webOS pairing "register" payload.
///
/// Ported from `aiowebostv` / `PyWebOSTV`. On current webOS firmware,
/// `pairingType: PROMPT` plus this permission manifest is enough to make the TV
/// display the on-screen accept prompt — no request signature is required. The
/// legacy `signed`/`signatures` blocks that `lgtv2` sends are only validated by
/// very old firmware; if you hit a TV that demands them, see the note at the
/// bottom of this file.
///
/// Build the full frame with [buildRegisterPayload], passing an existing
/// `clientKey` for a silent reconnect or `null` to trigger the accept prompt.
Map<String, dynamic> buildRegisterPayload({String? clientKey}) {
  return {
    'type': 'register',
    'id': 'register_0',
    'payload': {
      'forcePairing': false,
      'pairingType': 'PROMPT',
      if (clientKey != null) 'client-key': clientKey,
      'manifest': _manifest,
    },
  };
}

const Map<String, dynamic> _manifest = {
  'appVersion': '1.1',
  'manifestVersion': 1,
  'permissions': [
    'LAUNCH',
    'LAUNCH_WEBAPP',
    'APP_TO_APP',
    'CLOSE',
    'TEST_OPEN',
    'TEST_PROTECTED',
    'CONTROL_AUDIO',
    'CONTROL_DISPLAY',
    'CONTROL_INPUT_JOYSTICK',
    'CONTROL_INPUT_MEDIA_RECORDING',
    'CONTROL_INPUT_MEDIA_PLAYBACK',
    'CONTROL_INPUT_TV',
    'CONTROL_POWER',
    'READ_APP_STATUS',
    'READ_CURRENT_CHANNEL',
    'READ_INPUT_DEVICE_LIST',
    'READ_NETWORK_STATE',
    'READ_RUNNING_APPS',
    'READ_TV_CHANNEL_LIST',
    'WRITE_NOTIFICATION_TOAST',
    'READ_POWER_STATE',
    'READ_COUNTRY_INFO',
  ],
};

// --- Old-firmware fallback ---------------------------------------------------
// If your TV refuses to show the prompt and returns a "signature" error, it
// needs the legacy signed manifest. Copy the full `signed` and `signatures`
// objects verbatim from lgtv2's `hello.json`
// (https://github.com/hobbyquaker/lgtv2/blob/master/lib/hello.json) and merge
// them into `_manifest`. The signature is a single long base64 string and must
// be pasted whole — a truncated value is rejected.
