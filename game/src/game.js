// Match flow: freeze time, live rounds, bomb plant/defuse, economy, and the
// score. One object owns the phase machine; main.js owns input and rendering.
// The player carries the bomb: if they die it drops and the nearest living
// Vanguard bot retrieves it and plants.
import { MATCH, ECONOMY, WEAPONS, GEAR, SITES, SPAWNS } from './config.js';

export function createGame(deps) {
  const { player, bots, weapons, effects, audio, hud, world, combat } = deps;
  const state = {
    phase: 'menu', // menu | freeze | live | roundEnd | matchEnd
    round: 0,
    score: { vanguard: 0, hollow: 0 },
    lossStreak: { vanguard: 0, hollow: 0 },
    timer: 0,
    attackSite: 'A',
    bomb: { state: 'none', carrier: null, site: null, x: 0, z: 0, fuse: 0, beepAt: 0 },
    playerPlant: 0, playerDefuse: 0,
    spectate: null,
    mvp: null,
    roundEndAt: 0,
    startedAt: 0,
  };
  const ps = player.state;

  function banner(title, sub, cls) { hud.banner(title, sub, cls); }
  function toast(msg) { hud.toast(msg); }

  function startMatch() {
    state.score.vanguard = 0; state.score.hollow = 0;
    state.lossStreak.vanguard = 0; state.lossStreak.hollow = 0;
    state.round = 0;
    ps.kills = 0; ps.deaths = 0;
    for (const b of bots.bots) { b.kills = 0; b.deaths = 0; }
    ps.money = ECONOMY.startMoney;
    state.startedAt = deps.now ?? 0;
    startRound();
  }

  function startRound() {
    state.round++;
    state.attackSite = Math.random() < 0.5 ? 'A' : 'B';
    deps.attackSite = state.attackSite;
    bots.resetRound(state.round, state.attackSite);
    const spawn = SPAWNS.vanguard[4]; // bots take spawns 0-3; the player takes 4
    player.reset(spawn.x, spawn.z, spawn.yaw);
    // Fresh kit each round: sidearm always, primary kept, ammo refilled.
    weapons.equip('pistol');
    weapons.refill('pistol');
    if (ps.weapons.primary) { weapons.equip(ps.weapons.primary); weapons.refill(ps.weapons.primary); }
    else weapons.equip('pistol');
    ps.weapons.side = 'pistol';
    ps.armor = state.round === 1 ? 0 : ps.armor; // armor bought in the shop persists
    ps.grenades = { frag: 0, smoke: 0, flash: 0 };
    ps.hasKit = false;
    state.bomb = { state: 'carried', carrier: 'player', site: null, x: 0, z: 0, fuse: 0, beepAt: 0 };
    state.playerPlant = 0;
    state.phase = 'freeze';
    state.timer = MATCH.freezeSeconds;
    state.spectate = null;
    hud.setScore(state.score.vanguard, state.score.hollow);
    hud.setMoney(ps.money);
    banner(`ROUND ${state.round}`, `Plant the charge at Site ${state.attackSite} — buy up, then push.`, '');
    hud.showBuy(true, ps.money, ps.weapons.primary);
    audio.ensure();
  }

  function buyItem(id) {
    if (state.phase !== 'freeze') return false;
    const w = WEAPONS[id];
    const g = GEAR[id];
    if (w) {
      if (ps.money < w.price) { audio.deny(); return false; }
      if (ps.weapons.primary === id) return false;
      ps.money -= w.price;
      ps.weapons.primary = id;
      weapons.equip(id);
      weapons.refill(id);
      hud.setWeapon(w.name, weapons.current.mag, weapons.current.reserve);
      hud.setMoney(ps.money);
      audio.buy();
      return true;
    }
    if (g) {
      if (ps.money < g.price) { audio.deny(); return false; }
      if (id === 'armor') {
        if (ps.armor >= 100) return false;
        ps.money -= g.price; ps.armor = 100;
      } else if (id === 'kit') {
        if (ps.hasKit) return false;
        ps.money -= g.price; ps.hasKit = true;
      } else {
        const max = id === 'flash' ? 2 : 1;
        if (ps.grenades[id] >= max) return false;
        ps.money -= g.price; ps.grenades[id]++;
      }
      hud.setMoney(ps.money);
      audio.buy();
      return true;
    }
    return false;
  }

  function aliveCount(team) {
    let n = team === 'vanguard' && ps.alive ? 1 : 0;
    return n + bots.aliveCount(team);
  }

  function checkRoundEnd() {
    if (state.phase !== 'live') return;
    const vg = aliveCount('vanguard');
    const hw = aliveCount('hollow');
    const planted = state.bomb.state === 'planted';
    if (!planted) {
      if (hw === 0) winRound('vanguard', 'Hollow team eliminated');
      else if (vg === 0) winRound('hollow', 'Vanguard team eliminated');
    } else if (hw === 0 && vg === 0) {
      // Everyone dead after the plant: the bomb still decides it.
    }
  }

  function winRound(team, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.timer = 4.5;
    state.score[team]++;
    const loser = team === 'vanguard' ? 'hollow' : 'vanguard';
    state.lossStreak[team] = 0;
    state.lossStreak[loser]++;
    const lossPay = Math.min(ECONOMY.maxLossReward, ECONOMY.lossReward + ECONOMY.lossStreakBonus * (state.lossStreak[loser] - 1));
    ps.money += team === 'vanguard' ? ECONOMY.winReward : lossPay;
    hud.setScore(state.score.vanguard, state.score.hollow);
    hud.setMoney(ps.money);
    hud.showBuy(false);
    if (team === 'vanguard') {
      banner('ROUND WON', reason, 'win');
      audio.roundWin();
    } else {
      banner('ROUND LOST', reason, 'lose');
      audio.roundLose();
    }
    if (state.bomb.state === 'planted') effects.setBombLight(0, 0, 0, false, 0);
  }

  function endMatch() {
    state.phase = 'matchEnd';
    const won = state.score.vanguard > state.score.hollow;
    const all = [{ name: 'You', kills: ps.kills, deaths: ps.deaths, team: 'vanguard' }]
      .concat(bots.bots.map((b) => ({ name: b.name, kills: b.kills || 0, deaths: b.deaths || 0, team: b.team })));
    all.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    state.mvp = all[0];
    hud.showMatchEnd(won, state.score.vanguard, state.score.hollow, all);
    if (won) audio.roundWin(); else audio.roundLose();
  }

  function onKill(victim, killer, headshot) {
    if (victim.id === 'player') {
      ps.deaths++;
      state.spectate = pickSpectate();
      hud.showDeath(killer ? killer.name : 'Hollow', headshot);
    } else {
      victim.deaths = (victim.deaths || 0) + 1;
    }
    if (killer) {
      killer.kills = (killer.kills || 0) + 1;
      if (killer.id === 'player') {
        ps.kills++;
        ps.money += ECONOMY.killReward;
        hud.setMoney(ps.money);
      }
    }
    hud.killfeed(killer, victim, headshot);
    // Bomb handoff: the planter bot died while carrying.
    if (state.bomb.state === 'carried' && state.bomb.carrier === victim) {
      dropBomb(victim.pos.x, victim.pos.z);
    }
    checkRoundEnd();
  }

  function dropBomb(x, z) {
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    state.bomb.x = x; state.bomb.z = z;
    toast('Bomb dropped — a teammate will retrieve it');
  }

  function pickSpectate() {
    const alive = bots.bots.filter((b) => b.team === 'vanguard' && b.alive);
    return alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
  }

  function onPlayerDamage(amount, attacker, headshot) {
    if (!ps.alive || state.phase !== 'live') return;
    const died = player.damage(amount);
    hud.flashDamage();
    audio.hurt();
    if (died) {
      if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
        dropBomb(ps.pos.x, ps.pos.z);
      }
      onKill({ id: 'player', name: 'You', team: 'vanguard', pos: ps.pos }, attacker, headshot);
    }
  }

  function plantBomb(site) {
    state.bomb.state = 'planted';
    state.bomb.site = site;
    state.bomb.x = ps.pos.x; state.bomb.z = ps.pos.z;
    state.bomb.fuse = MATCH.bombFuseSeconds;
    state.bomb.beepAt = 0;
    state.playerPlant = 0;
    ps.money += ECONOMY.plantReward;
    hud.setMoney(ps.money);
    banner('BOMB PLANTED', `Site ${site} — hold it for ${MATCH.bombFuseSeconds} seconds.`, '');
    audio.plantStart();
    toast('Bomb planted — defend it');
  }

  function onBotPlant(bot) {
    state.bomb.state = 'planted';
    state.bomb.site = state.attackSite;
    state.bomb.x = bot.pos.x; state.bomb.z = bot.pos.z;
    state.bomb.fuse = MATCH.bombFuseSeconds;
    state.bomb.beepAt = 0;
    banner('BOMB PLANTED', `Site ${state.attackSite} — ${bot.name} set the charge.`, '');
    audio.plantStart();
    toast('Bomb planted at Site ' + state.attackSite);
  }

  function onBotDefuse(bot) {
    state.bomb.state = 'defused';
    winRound('hollow', `${bot.name} defused the charge`);
  }

  function explodeBomb() {
    state.bomb.state = 'exploded';
    effects.setBombLight(0, 0, 0, false, 0);
    effects.impact(state.bomb.x, 0.5, state.bomb.z, 0xff8030, 60);
    audio.explode();
    deps.shake(1);
    const R = MATCH.bombRadius;
    // Player
    const pd = Math.hypot(ps.pos.x - state.bomb.x, ps.pos.z - state.bomb.z);
    if (ps.alive && pd < R && !world.losBlocked(state.bomb.x, 0.6, state.bomb.z, ps.pos.x, 1.2, ps.pos.z)) {
      const dmg = Math.round(MATCH.bombDamage * (1 - pd / R));
      if (player.damage(dmg)) onKill({ id: 'player', name: 'You', team: 'vanguard', pos: ps.pos }, null, false);
    }
    // Bots
    for (const b of bots.bots) {
      if (!b.alive) continue;
      const d = Math.hypot(b.pos.x - state.bomb.x, b.pos.z - state.bomb.z);
      if (d < R && !world.losBlocked(state.bomb.x, 0.6, state.bomb.z, b.pos.x, 1.2, b.pos.z)) {
        const dmg = Math.round(MATCH.bombDamage * (1 - d / R));
        bots.damageBot(b, dmg, null, false);
      }
    }
    winRound('vanguard', 'The charge detonated');
  }

  function inSite(pos, site) {
    const s = SITES[site];
    return Math.hypot(pos.x - s.x, pos.z - s.z) < s.r;
  }

  function update(dt, now, input) {
    if (state.phase === 'menu' || state.phase === 'matchEnd') return;
    if (state.phase === 'freeze') {
      state.timer -= dt;
      hud.setTimer(state.timer);
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = MATCH.roundSeconds;
        hud.showBuy(false);
        banner('GO', `Site ${state.attackSite} — plant the charge.`, '');
      }
      return;
    }
    if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.score.vanguard >= MATCH.roundsToWin || state.score.hollow >= MATCH.roundsToWin || state.round >= MATCH.maxRounds) endMatch();
        else startRound();
      }
      return;
    }
    // live
    state.timer -= dt;
    hud.setTimer(state.bomb.state === 'planted' ? state.bomb.fuse : state.timer);
    if (state.bomb.state === 'planted') {
      state.bomb.fuse -= dt;
      state.bomb.beepAt -= dt;
      if (state.bomb.beepAt <= 0) {
        audio.plantBeep(state.bomb.fuse < 10);
        state.bomb.beepAt = state.bomb.fuse < 10 ? 0.5 : 1;
        effects.setBombLight(state.bomb.x, 0.4, state.bomb.z, true, state.bomb.fuse < 10 ? 1 : 0.3);
      }
      if (state.bomb.fuse <= 0) { explodeBomb(); return; }
    } else if (state.timer <= 0) {
      winRound('hollow', 'Time expired — the charge was never planted');
      return;
    }

    // Player planting (hold E inside a site while carrying).
    if (input.plant && ps.alive && state.bomb.state === 'carried' && state.bomb.carrier === 'player') {
      const site = inSite(ps.pos, 'A') ? 'A' : inSite(ps.pos, 'B') ? 'B' : null;
      if (site) {
        state.playerPlant += dt / MATCH.plantSeconds;
        hud.showProgress(state.playerPlant, 'PLANTING…');
        if (state.playerPlant >= 1) plantBomb(site);
      } else {
        state.playerPlant = 0;
        hud.showProgress(0);
        hud.toast('Plant inside Site A or Site B');
      }
    } else {
      if (state.playerPlant > 0) { state.playerPlant = 0; hud.showProgress(0); }
    }

    // Bomb retrieval: the nearest living Vanguard bot fetches a dropped charge.
    if (state.bomb.state === 'dropped') {
      let best = null, bd = Infinity;
      for (const b of bots.bots) {
        if (b.team !== 'vanguard' || !b.alive) continue;
        const d = Math.hypot(b.pos.x - state.bomb.x, b.pos.z - state.bomb.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        best.role = 'planter';
        const d = Math.hypot(best.pos.x - state.bomb.x, best.pos.z - state.bomb.z);
        if (d < 1.4) {
          state.bomb.state = 'carried';
          state.bomb.carrier = best;
          toast(`${best.name} picked up the charge`);
        }
      }
    }
    checkRoundEnd();
  }

  return {
    state, startMatch, startRound, buyItem, onKill, onPlayerDamage,
    onBotPlant, onBotDefuse, update, inSite, explodeBomb,
  };
}
