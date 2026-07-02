const { test } = require('node:test');
const assert = require('node:assert');
const createAdOverlayState = require('../renderer/lib/ad-overlay-state');

test('startet inaktiv', () => {
  const s = createAdOverlayState();
  assert.equal(s.overlayVisible, false);
  assert.equal(s.shouldMute, false);
  assert.equal(s.active, false);
});

test('adStart aktiviert Overlay + Mute', () => {
  const s = createAdOverlayState();
  s.adStart(false);
  assert.equal(s.overlayVisible, true);
  assert.equal(s.shouldMute, true);
});

test('adEnd deaktiviert wieder', () => {
  const s = createAdOverlayState();
  s.adStart(false);
  s.adEnd();
  assert.equal(s.overlayVisible, false);
  assert.equal(s.shouldMute, false);
});

test('restoreMuted merkt sich Zustand beim adStart', () => {
  const s = createAdOverlayState();
  s.adStart(true);   // Nutzer hatte selbst gemutet
  assert.equal(s.restoreMuted, true);
  const s2 = createAdOverlayState();
  s2.adStart(false); // Nutzer hatte Ton an
  assert.equal(s2.restoreMuted, false);
});

test('doppeltes adStart überschreibt restoreMuted NICHT', () => {
  const s = createAdOverlayState();
  s.adStart(false);       // Ton war an -> merken: false
  s.adStart(true);        // kommt während der Werbung (schon gemutet) -> ignorieren
  assert.equal(s.restoreMuted, false);
});

test('tick löst Watchdog nach watchdogMs aus', () => {
  const s = createAdOverlayState({ watchdogMs: 1000 });
  s.adStart(false);
  s.tick(500);   // adStart-Zeit ist tick-relativ: erster tick setzt Referenz? -> nein, siehe Impl
  assert.equal(s.overlayVisible, true);
  s.tick(1600);
  assert.equal(s.overlayVisible, false);
});

test('adEnd nach Watchdog ist harmlos', () => {
  const s = createAdOverlayState({ watchdogMs: 1000 });
  s.adStart(false);
  s.tick(2000);
  assert.equal(s.overlayVisible, false);
  s.adEnd(); // darf nicht werfen, bleibt inaktiv
  assert.equal(s.overlayVisible, false);
});
