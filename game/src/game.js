// Match flow: freeze, live rounds, plant/defuse, economy, score. The player
// carries the bomb; on death it drops and the nearest Vanguard bot fetches it.
import { MATCH, ECONOMY, WEAPONS, GEAR, SITES, SPAWNS, POOL_DPS, POOLS } from './config.js';
import { inPool, outOfPools, pushOut } from './util.js';
import { createTactics } from './tactics.js';

export function createGame(deps) {
  const { player, bots, weapons, effects, audio, hud, world, combat } = deps;
  // Radio callouts go to the HUD and the killfeed story.
  const tactics = createTactics({
    onCallout: (line, team) => { hud.callout(line, team); },
  });
  const state = {
    phase: 'menu', // menu | freeze | live | roundEnd | matchEnd
    round: 0,
    score: { vanguard: 0, hollow: 0 },
    lossStreak: { vanguard: 0, hollow: 0 },
    timer: 0,
    attackSite: 'A',
    bomb: { state: 'none', carrier: null, site: null, x: 0, z: 0, fuse: 0, beepAt: 0 },
    playerPlant: 0, playerDefuse: 0,
    hazardAt: 0,
    idleX: 0, idleZ: 0, idleAt: 0, idleDrop: null, // X11 anchor
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
    // The plan picks the site and defence; bots announce both.
    const now = deps.now ?? 0;
    const attack = tactics.pickAttack(state.round, state.score.vanguard, state.score.hollow, now);
    const defense = tactics.pickDefense(state.round, state.score.hollow, state.score.vanguard);
    state.attackSite = attack.site;
    deps.attackSite = state.attackSite;
    deps.tactics = tactics;
    bots.resetRound(state.round, state.attackSite, tactics);
    const attackBot = bots.bots.find((b) => b.team === 'vanguard' && b.role === 'planter');
    const defenseBot = bots.bots.find((b) => b.team === 'hollow' && b.role === 'holderA');
    tactics.announce(attackBot, defenseBot);
    const spawn = SPAWNS.vanguard[4]; // bots take spawns 0-3; the player takes 4
    player.reset(spawn.x, spawn.z, spawn.yaw);
    // Fresh kit: sidearm always, primary kept, ammo refilled.
    weapons.equip('pistol');
    weapons.refill('pistol');
    if (ps.weapons.primary) { weapons.equip(ps.weapons.primary); weapons.refill(ps.weapons.primary); }
    else weapons.equip('pistol');
    ps.weapons.side = 'pistol';
    ps.armor = state.round === 1 ? 0 : ps.armor; // armor bought in the shop persists
    ps.grenades = { frag: 0, smoke: 0, flash: 0, lava: 0 };
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

  // Lava grenade (E33): temp pool; never covers a node or bomb.
  function spawnLavaPool(x, z) {
    [x, z] = outOfPools(x, z);
    for (const w of world.waypoints) [x, z] = pushOut(x, z, w.x, w.z, 2.5);
    if (state.bomb.state === 'dropped') [x, z] = pushOut(x, z, state.bomb.x, state.bomb.z, 2.5);
    const p = { x, z, r: 2, life: 18 };
    POOLS.push(p);
    world.addPool(p);
  }

  function aliveCount(team) {
    let n = team === 'vanguard' && ps.alive ? 1 : 0;
    return n + bots.aliveCount(team);
  }

  // X1: carrier alive => round continues; timer caps it.
  function carrierAlive() {
    if (state.bomb.state !== 'carried') return false;
    const c = state.bomb.carrier;
    return c === 'player' ? ps.alive : !!(c && c.alive);
  }

  function checkRoundEnd() {
    if (state.phase !== 'live') return;
    const vg = aliveCount('vanguard');
    const hw = aliveCount('hollow');
    const planted = state.bomb.state === 'planted';
    if (!planted) {
      // X1: defenders wiped but carrier lives.
      if (hw === 0 && carrierAlive()) return;
      if (hw === 0) winRound('vanguard', 'Hollow team eliminated');
      else if (vg === 0) winRound('hollow', 'Vanguard team eliminated');
    } else if (hw === 0 && vg === 0) {
      // Everyone dead after the plant: the bomb decides it.
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
    // The radio tells the round's story: a bot that scores calls it.
    if (killer && killer.id !== 'player' && killer.team) {
      tactics.eventCall('kill', killer, state.attackSite);
    }
    // Bomb handoff: the planter bot died while carrying.
    if (state.bomb.state === 'carried' && state.bomb.carrier === victim) {
      dropBomb(victim.pos.x, victim.pos.z);
    }
    checkRoundEnd();
  }

  function dropBomb(x, z) {
    // A charge in lava is unretrievable, so it lands at the rim.
    const [ex, ez] = outOfPools(x, z);
    state.bomb.state = 'dropped';
    state.bomb.carrier = null;
    state.bomb.x = ex; state.bomb.z = ez;
    toast('Bomb dropped — a teammate will retrieve it');
  }

  function pickSpectate() {
    const alive = bots.bots.filter((b) => b.team === 'vanguard' && b.alive);
    return alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
  }

  function onPlayerDamage(amount, attacker, headshot) {
    if (!ps.alive || state.phase !== 'live') return;
    // X4: player carrier takes half damage.
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player') amount *= 0.5;
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
    // Retake order: a living defender hears the rotation call.
    const rot = bots.bots.find((b) => b.team === 'hollow' && b.alive);
    if (rot) tactics.eventCall('rotate', rot, site);
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
    tactics.eventCall('plant', bot, state.attackSite);
    // Retake order: a living defender hears the rotation call.
    const rot = bots.bots.find((b) => b.team === 'hollow' && b.alive);
    if (rot) tactics.eventCall('rotate', rot, state.attackSite);
  }

  function onBotDefuse(bot) {
    state.bomb.state = 'defused';
    tactics.eventCall('defuse', bot, state.attackSite);
    winRound('hollow', `${bot.name} defused the charge`);
  }

  function explodeBomb() {
    state.bomb.state = 'exploded';
    effects.setBombLight(0, 0, 0, false, 0);
    effects.impact(state.bomb.x, 0.5, state.bomb.z, 0xff8030, 60);
    audio.explode();
    deps.shake(1);
    const R = MATCH.bombRadius;
    const pd = Math.hypot(ps.pos.x - state.bomb.x, ps.pos.z - state.bomb.z);
    if (ps.alive && pd < R && !world.losBlocked(state.bomb.x, 0.6, state.bomb.z, ps.pos.x, 1.2, ps.pos.z)) {
      const dmg = Math.round(MATCH.bombDamage * (1 - pd / R));
      if (player.damage(dmg)) onKill({ id: 'player', name: 'You', team: 'vanguard', pos: ps.pos }, null, false);
    }
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
        state.idleX = ps.pos.x; state.idleZ = ps.pos.z; state.idleAt = now; state.idleDrop = null; // X11
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

    // X11: idle player carrier drops the bomb so a bot can fetch it.
    if (state.bomb.state === 'carried' && state.bomb.carrier === 'player' && ps.alive) {
      const d = Math.hypot(ps.pos.x - state.idleX, ps.pos.z - state.idleZ);
      if (d >= 1) { state.idleX = ps.pos.x; state.idleZ = ps.pos.z; state.idleAt = now; }
      else if (now - state.idleAt >= 10) { state.idleDrop = { x: ps.pos.x, z: ps.pos.z }; dropBomb(ps.pos.x, ps.pos.z); }
    } else {
      state.idleX = ps.pos.x; state.idleZ = ps.pos.z; state.idleAt = now;
      if (state.idleDrop && Math.hypot(ps.pos.x - state.idleDrop.x, ps.pos.z - state.idleDrop.z) >= 1) state.idleDrop = null;
    }

    // Bomb retrieval: nearest living Vanguard bot fetches a dropped charge;
    // the player can also pick it up by walking over it.
    if (state.bomb.state === 'dropped') {
      if (ps.alive && !state.idleDrop && Math.hypot(ps.pos.x - state.bomb.x, ps.pos.z - state.bomb.z) < 1.4) {
        state.bomb.state = 'carried';
        state.bomb.carrier = 'player';
        toast('You picked up the charge');
      }
    }
    if (state.bomb.state === 'dropped') {
      let best = null, bd = Infinity;
      for (const b of bots.bots) {
        if (b.team !== 'vanguard' || !b.alive) continue;
        const d = Math.hypot(b.pos.x - state.bomb.x, b.pos.z - state.bomb.z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best) {
        for (const o of bots.bots) if (o !== best && o.role === 'planter') o.role = 'pusher';
        best.role = 'planter';
        const d = Math.hypot(best.pos.x - state.bomb.x, best.pos.z - state.bomb.z);
        if (d < 1.4) {
          state.bomb.state = 'carried';
          state.bomb.carrier = best;
          state.idleDrop = null;
          toast(`${best.name} picked up the charge`);
        }
      }
    }
    // Molten pools (E31): burn at POOL_DPS, ticked every 0.5 s.
    state.hazardAt -= dt;
    if (state.hazardAt <= 0) {
      state.hazardAt = 0.5;
      if (ps.alive && inPool(ps.pos.x, ps.pos.z)) onPlayerDamage(POOL_DPS / 2, null, false);
      for (const b of bots.bots) if (b.alive && inPool(b.pos.x, b.pos.z)) bots.damageBot(b, POOL_DPS / 2, null, false);
      for (let i = POOLS.length - 1; i >= 0; i--) {
        const p = POOLS[i];
        if (p.life !== undefined && (p.life -= 0.5) <= 0) { POOLS.splice(i, 1); world.delPool(p); }
      }
    }
    checkRoundEnd();
  }

  return {
    state, startMatch, startRound, buyItem, onKill, onPlayerDamage,
    onBotPlant, onBotDefuse, update, inSite, explodeBomb, tactics, spawnLavaPool,
  };
}
