import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../src/game/GameSession.ts';
import { TicClock } from '../src/game/TicClock.ts';

test('title cannot accidentally resume an unstarted game', () => {
  const session = new GameSession();
  session.back(); session.resume();
  assert.equal(session.running, false);
  assert.equal(session.menu, 'main');
});

test('help and confirmation back-navigation preserves the paused game', () => {
  const session = new GameSession();
  session.start(); session.open();
  for (const page of ['help', 'restart', 'end'] as const) {
    session.menu = page; session.back();
    assert.equal(session.menu, 'main');
    assert.equal(session.running, false);
  }
  session.back();
  assert.equal(session.running, true);
});

test('ten seconds produce 350 tics at 20, 30, 60 and 144 FPS', () => {
  for (const fps of [20, 30, 60, 144]) {
    const clock = new TicClock(); let tics = 0;
    for (let i = 0; i < fps * 10; i++) clock.advance(1 / fps, true, () => tics++);
    assert.equal(tics, 350, `${fps} FPS`);
  }
});

test('menus discard partial tics and elapsed time, without resume catch-up', () => {
  const session = new GameSession(); const clock = new TicClock(); let tics = 0;
  const tick = () => tics++;
  clock.advance(100, session.running, tick);
  session.start(); clock.advance(0.02, session.running, tick);
  session.open(); clock.advance(100, session.running, tick);
  session.resume(); clock.advance(0.02, session.running, tick);
  assert.equal(tics, 0);
  clock.advance(0.01, session.running, tick);
  assert.equal(tics, 1);
});

test('slow frames cap work per render while retaining simulation backlog', () => {
  const clock = new TicClock(); let tics = 0;
  assert.equal(clock.advance(1, true, () => tics++), 8);
  for (let i = 0; i < 4; i++) clock.advance(0, true, () => tics++);
  assert.equal(tics, 35);
  assert.equal(clock.advance(NaN, true, () => tics++), 0);
  assert.equal(clock.advance(-1, true, () => tics++), 0);
});
