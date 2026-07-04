/// webOS SSAP (Second Screen Application Protocol) endpoint URIs.
///
/// Ported from the open-source `lgtv2` (Node) and `aiowebostv` (Python)
/// libraries. Each command is issued as a `request` frame:
///
/// ```json
/// { "type": "request", "id": "<unique>", "uri": "<one of these>",
///   "payload": { ... optional ... } }
/// ```
class SsapUri {
  SsapUri._();

  // --- Audio ---------------------------------------------------------------
  static const volumeUp = 'ssap://audio/volumeUp';
  static const volumeDown = 'ssap://audio/volumeDown';
  static const getVolume = 'ssap://audio/getVolume';
  static const setVolume = 'ssap://audio/setVolume'; // payload: {volume:int}
  static const setMute = 'ssap://audio/setMute'; // payload: {mute:bool}
  static const getAudioStatus = 'ssap://audio/getStatus';

  // --- TV / channels -------------------------------------------------------
  static const channelUp = 'ssap://tv/channelUp';
  static const channelDown = 'ssap://tv/channelDown';
  static const getCurrentChannel = 'ssap://tv/getCurrentChannel';
  static const getChannelList = 'ssap://tv/getChannelList';
  static const openChannel = 'ssap://tv/openChannel'; // payload: {channelId}

  // --- Inputs --------------------------------------------------------------
  static const getExternalInputList = 'ssap://tv/getExternalInputList';
  static const switchInput = 'ssap://tv/switchInput'; // payload: {inputId}

  // --- Power ---------------------------------------------------------------
  static const turnOff = 'ssap://system/turnOff';

  // --- System / info -------------------------------------------------------
  static const createToast =
      'ssap://system.notifications/createToast'; // payload: {message}
  static const getSystemInfo = 'ssap://system/getSystemInfo';
}
