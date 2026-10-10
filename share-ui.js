(function () {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const dialog = $('#share-dialog');
  let snapshot = null, token = '', builtLink = '', generation = 0;
  function viewerAddress() {
    const configured = window.COURTSIDE_PUBLIC_URL;
    const base = configured || (location.protocol === 'https:' ? location.href : '');
    if (!base) return null;
    const url = new URL('viewer.html', base);
    if (url.protocol !== 'https:' || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '127.0.0.1' || url.hostname === '[::1]') return null;
    url.search = ''; url.hash = '';
    return url;
  }
  async function open(play) {
    const request = ++generation;
    snapshot = window.CourtModel.clone(play); token = ''; builtLink = '';
    $('#share-title').textContent = `Share “${play.name}”`;
    $('#share-link').value = '';
    $('#share-status').textContent = 'Preparing your play…';
    $('#copy-share-link').disabled = true;
    $('#download-player').disabled = true;
    $('#preview-shared').hidden = true;
    dialog.showModal();
    try {
      const encoded = await window.CourtShare.encode(snapshot);
      if (request !== generation || !dialog.open) return;
      token = encoded;
      $('#download-player').disabled = !window.CourtsideViewerTemplate;
      const url = viewerAddress();
      if (!url) {
        $('#share-status').textContent = 'Public link sharing needs a published web address. You can download an animated player file now.';
        return;
      }
      if (token.length > window.CourtShare.RECOMMENDED_TOKEN_CHARS) {
        $('#share-status').textContent = 'This play is too large for a reliable messaging link. Download the player file or share a shorter play.';
        return;
      }
      url.hash = 'play=' + token;
      builtLink = url.href;
      $('#share-link').value = builtLink;
      $('#copy-share-link').disabled = false;
      $('#preview-shared').href = builtLink;
      $('#preview-shared').hidden = false;
      $('#share-status').textContent = 'Ready to copy into WhatsApp, email or a team chat.';
    } catch (error) {
      if (request === generation) $('#share-status').textContent = error.message || 'Could not prepare this play. Export a play file instead.';
    }
  }
  $('#copy-share-link').onclick = async () => {
    if (!builtLink) return;
    try {
      await navigator.clipboard.writeText(builtLink);
      $('#share-status').textContent = 'Link copied. Paste it into your team chat.';
    } catch (e) {
      $('#share-link').focus(); $('#share-link').select();
      $('#share-status').textContent = 'Select and copy the link above, then paste it into your team chat.';
    }
  };
  $('#share-link').onclick = () => $('#share-link').select();
  $('#download-player').onclick = () => {
    if (!token || !window.CourtsideViewerTemplate) return;
    const documentText = window.CourtsideViewerTemplate.replace('/*COURTSIDE_EMBEDDED_TOKEN*/', 'window.COURTSIDE_SHARED_PLAY_TOKEN=' + JSON.stringify(token) + ';');
    const blob = new Blob([documentText], {type:'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href=url;
    a.download=(snapshot.name.replace(/[^a-z0-9_-]+/gi,'-').toLowerCase() || 'basketball-play')+'-player.html';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
    $('#share-status').textContent = 'Animated player file downloaded. Recipients can open it in a desktop browser.';
  };
  window.CourtShareUI = {open};
})();
