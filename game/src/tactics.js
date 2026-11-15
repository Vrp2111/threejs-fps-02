// Team plans + radio callouts. Attackers pick per round (RUSH A/B, SPLIT,
// FAKE A, MID CONTROL); defenders pick a setup (2-2-1, STACK A/B,
// AGGRESSIVE MID). The pick leans on the score (behind favours rush,
// ahead favours fake/split), announced once on the radio. A fake is real:
// two pushers make noise at A, then rotate to B at 12 s or on bomb take.
import { PLANS, SITES } from './config.js';

const SITE_POS = { A: { x: 24, z: -14 }, B: { x: -24, z: -14 } };

export function createTactics(deps) {
  const { onCallout } = deps;
  let attack = null;
  let defense = null;
  let fakeAt = 0;
  let faked = false;
  const who=b=>b.name+' ('+b.role.toUpperCase()+')';

  function pickAttack(round, scoreFor, scoreAgainst, now) {
    const behind = scoreFor < scoreAgainst;
    const ahead = scoreFor > scoreAgainst;
    // Weight the plans: behind favours the rush, ahead favours the fake
    // and the split, and every round keeps a little randomness so no two
    // matches play the same.
    const weights = PLANS.attack.map((p) => {
      let w = 1;
      if (p.id === 'rushA' || p.id === 'rushB') w += behind ? 1.2 : 0;
      if (p.id === 'fakeA' || p.id === 'split') w += ahead ? 1.0 : 0.3;
      if (p.id === 'mid') w += round === 1 ? 0.8 : 0;
      return w;
    });
    let total = 0;
    for (const w of weights) total += w;
    let roll = Math.random() * total;
    let chosen = PLANS.attack[0];
    for (let i = 0; i < PLANS.attack.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { chosen = PLANS.attack[i]; break; }
    }
    attack = chosen;
    fakeAt = now + 12;
    faked = false;
    return attack;
  }

  function pickDefense(round, scoreFor, scoreAgainst) {
    const behind = scoreFor < scoreAgainst;
    const weights = PLANS.defense.map((p) => {
      let w = 1;
      if (p.id === 'aggro') w += behind ? 0.9 : 0.2;
      if (p.id === 'stackA' || p.id === 'stackB') w += round >= 3 ? 0.5 : 0;
      return w;
    });
    let total = 0;
    for (const w of weights) total += w;
    let roll = Math.random() * total;
    let chosen = PLANS.defense[0];
    for (let i = 0; i < PLANS.defense.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { chosen = PLANS.defense[i]; break; }
    }
    defense = chosen;
    return defense;
  }

  // Announce the round's plans on the radio.
  function announce(attackBot, defenseBot) {
    if (attack && attackBot) {
      onCallout(`${who(attackBot)}: ${attack.label} — ${attack.call}`, 'vanguard');
    }
    if (defense && defenseBot) {
      onCallout(`${who(defenseBot)}: ${defense.label} — ${defense.call}`, 'hollow');
    }
  }

  // The site the attackers are really going to, right now. A fake sends
  // its pushers to the other site after the fake timer, or when the bomb
  // changes hands.
  function targetSite(now, bombCarrier) {
    if (!attack) return 'A';
    if (attack.id === 'fakeA' && !faked && (now >= fakeAt || bombCarrier === 'lurker')) {
      faked = true;
      return attack.site; // the real site is B; the fakers rotate there
    }
    if (attack.id === 'fakeA' && !faked) return 'A'; // the decoy site
    if (attack.id === 'split') return attack.site;
    return attack.site;
  }

  function isFaking(now) {
    return !!attack && attack.id === 'fakeA' && now < fakeAt;
  }

  // Where a bot with a given role should go under the current plan.
  // Returns a target { x, z } or null when the bot should hold.
  function roleTarget(role, team, now) {
    const site = attack ? attack.site : 'A';
    const sp = SITE_POS[site];
    const other = site === 'A' ? SITE_POS.B : SITE_POS.A;
    if (team === 'vanguard') {
      if (role === 'planter') return sp;
      if (role === 'pusher') {
        // During a fake the pushers make noise at the decoy site; once
        // the fake breaks they rotate to the real site.
        if (attack && attack.id === 'fakeA' && now < fakeAt) return other;
        return { x: sp.x + (Math.random() - 0.5) * 4, z: sp.z + (Math.random() - 0.5) * 4 };
      }
      if (role === 'mid') return { x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 10 };
      if (role === 'lurker') {
        // The lurker watches the other site, then rotates to the real one
        // when the fake breaks.
        if (attack && attack.id === 'fakeA' && now < fakeAt) return other;
        return sp;
      }
    } else {
      // Defenders hold the site their setup names.
      if (role === 'holderA') return { x: 24, z: -14 };
      if (role === 'holderB') return { x: -24, z: -14 };
      if (role === 'mid') return { x: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 6 };
    }
    return null;
  }

  // The defence setup: how many holders each site gets this round.
  function defenseSplit() {
    if (!defense) return { a: 2, b: 2, mid: 1 };
    return { a: defense.a, b: defense.b, mid: defense.mid };
  }

  // A callout when a round event happens: a kill, a plant, a defuse, a
  // rotation. Short and tied to the plan, so the radio tells the story.
  function eventCall(kind, bot, site) {
    const lines = {
      kill: [`${who(bot)}: one down at ${site || 'mid'}`, `${who(bot)}: got one`, `${who(bot)}: contact down`],
      plant: [`${who(bot)}: charge down at Site ${site}`, `${who(bot)}: planted, hold the site`],
      defuse: [`${who(bot)}: defusing, cover me`, `${who(bot)}: on the charge`],
      rotate: [`${who(bot)}: rotating to Site ${site}`, `${who(bot)}: they are going ${site}, rotate`],
      smoke: [`${who(bot)}: smoking ${site}`, `${who(bot)}: smoke out, push`],
      flash: [`${who(bot)}: flashing ${site}`, `${who(bot)}: flash out`],
    };
    const list = lines[kind] || lines.kill;
    const line = list[Math.floor(Math.random() * list.length)];
    onCallout(line, bot.team);
  }

  function sitePos(site) { return SITE_POS[site]; }

  return {
    pickAttack, pickDefense, announce, targetSite, isFaking, roleTarget,
    defenseSplit, eventCall, sitePos,
    get attack() { return attack; },
    get defense() { return defense; },
    get planLabel() { return attack ? attack.label : ''; },
  };
}
