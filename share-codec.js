(function (root, factory) {
  'use strict';
  var api = factory(typeof module === 'object' && module.exports ? require('./model.js') : root.CourtModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CourtShare = api;
})(typeof window !== 'undefined' ? window : globalThis, function (M) {
  'use strict';

  var MAX_BYTES = 512 * 1024;
  var MAX_TOKEN_CHARS = 60 * 1024;
  var RECOMMENDED_TOKEN_CHARS = 12000;
  function invalid(message) { return new Error('Cannot share this play: ' + message); }
  function toBase64(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromBase64(value) {
    if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw invalid('the link contains invalid data.');
    var raw;
    try { raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)); }
    catch (e) { throw invalid('the link contains invalid data.'); }
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    if (toBase64(bytes) !== value) throw invalid('the link contains invalid data.');
    return bytes;
  }
  async function collect(stream, maximum) {
    var reader = stream.getReader(), chunks = [], size = 0;
    try {
      while (true) {
        var next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > maximum) throw invalid('the play is too large. Export a file instead.');
        chunks.push(next.value);
      }
    } catch (e) {
      try { await reader.cancel(); } catch (ignored) {}
      throw e;
    } finally { reader.releaseLock(); }
    var result = new Uint8Array(size), offset = 0;
    chunks.forEach(function (chunk) { result.set(chunk, offset); offset += chunk.byteLength; });
    return result;
  }
  function compact(input) {
    // Validation creates a clean copy; normalization never changes the editor's play.
    var play = M.validatePlay(input), players = new Map(), nextId = 0;
    function playerId(id) {
      if (id === null || id === undefined) return null;
      if (!players.has(id)) players.set(id, 'p' + nextId++);
      return players.get(id);
    }
    function point(value) { value.x = Math.round(value.x * 10) / 10; value.y = Math.round(value.y * 10) / 10; }
    play.id = 'shared-play';
    play.frames.forEach(function (frame, index) {
      frame.id = 'f' + index;
      frame.players.forEach(function (player) { player.id = playerId(player.id); point(player); });
      frame.ballOwner = playerId(frame.ballOwner);
      point(frame.ball);
      frame.actions.forEach(function (action, actionIndex) {
        action.id = 'a' + actionIndex;
        action.playerId = playerId(action.playerId);
        action.targetId = playerId(action.targetId);
        point(action.from); point(action.to);
      });
      frame.labels.forEach(function (label, labelIndex) { label.id = 'l' + labelIndex; point(label); });
    });
    return M.validatePlay(play);
  }
  async function encode(input) {
    var bytes = new TextEncoder().encode(JSON.stringify(compact(input)));
    if (bytes.byteLength > MAX_BYTES) throw invalid('the play is too large. Export a file instead.');
    var prefix = 'v1j.';
    if (typeof CompressionStream === 'function') {
      bytes = await collect(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), MAX_TOKEN_CHARS);
      prefix = 'v1.';
    }
    var token = prefix + toBase64(bytes);
    if (token.length > MAX_TOKEN_CHARS) throw invalid('the play is too large. Export a file instead.');
    return token;
  }
  async function decode(token) {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_CHARS) throw invalid('the link is invalid or too large.');
    var compressed = token.startsWith('v1.'), plain = token.startsWith('v1j.');
    if (!compressed && !plain) throw invalid('this link format is not supported.');
    var bytes = fromBase64(token.slice(compressed ? 3 : 4));
    if (compressed) {
      if (typeof DecompressionStream !== 'function') throw invalid('open this link in an updated browser.');
      try { bytes = await collect(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_BYTES); }
      catch (e) {
        if (e.message && e.message.includes('too large')) throw e;
        throw invalid('the link is damaged or incomplete.');
      }
    }
    if (bytes.byteLength > MAX_BYTES) throw invalid('the play is too large.');
    var value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch (e) { throw invalid('the link is damaged or incomplete.'); }
    return M.validatePlay(value);
  }
  return { encode: encode, decode: decode, MAX_TOKEN_CHARS: MAX_TOKEN_CHARS, MAX_BYTES: MAX_BYTES, RECOMMENDED_TOKEN_CHARS: RECOMMENDED_TOKEN_CHARS };
});
