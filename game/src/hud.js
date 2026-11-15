// Every DOM write the game makes, behind one module that caches the last
// value it wrote so the hot loop never touches the DOM for an unchanged number.
import { WEAPONS, GEAR } from './config.js';
import { fmtTime } from './util.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const el = {
    timer: $('timer'), scoreVg: $('score-vg'), scoreHw: $('score-hw'),
    bomb: $('bombstatus'), compass: $('compass'), killfeed: $('killfeed'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    hpfill: $('hpfill'), hpnum: $('hpnum-v'), armor: $('armorline'), money: $('moneyline'),
    weaponName: $('weapon-name'), ammo: $('ammo'), ammoMag: $('ammo-mag'),
    ammoRes: $('ammo-reserve'), reloadHint: $('reloadhint'),
    banner: $('banner'), bannerH: document.querySelector('#banner h2'),
    bannerP: document.querySelector('#banner p'),
    toast: $('toast'), progress: $('progress'),
    progressFill: document.querySelector('#progress .fill'),
    progressLabel: document.querySelector('#progress .label'),
    buyMenu: $('buymenu'), shop: $('shop'), buyMoney: $('buy-money'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'), playBtn: $('play'),
    dmg: $('dmg'), flash: $('flash'), scope: $('scope'),
    minimap: $('minimap'),
  };
  const mm = el.minimap.getContext('2d');
  const cache = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let toastTimer = 0;
  let buyCb = null;

  // Scoreboard element, built once and shown with Tab.
  const sb = document.createElement('div');
  sb.className = 'overlay'; sb.hidden = true;
  sb.innerHTML = '<section class="panel"><h2>SCOREBOARD</h2><div id="sb-body"></div><p style="font-size:13px">Release Tab to hide.</p></section>';
  document.body.appendChild(sb);

  function setText(node, key, value) {
    if (cache[key] !== value) { cache[key] = value; node.textContent = value; }
  }

  function setTimer(seconds) {
    setText(el.timer, 'timer', fmtTime(seconds));
    el.timer.classList.toggle('low', seconds <= 10 && seconds > 0);
  }
  function setScore(vg, hw) {
    setText(el.scoreVg, 'svg', String(vg));
    setText(el.scoreHw, 'shw', String(hw));
  }
  function setMoney(m) { setText(el.money, 'money', `$${m}`); setText(el.buyMoney, 'buymoney', `$${m} — spend it before the round starts`); }
  function setHealth(hp, armor) {
    el.hpfill.style.width = `${Math.max(0, hp)}%`;
    el.hpfill.classList.toggle('low', hp <= 30);
    setText(el.hpnum, 'hp', `${Math.ceil(hp)} `);
    setText(el.armor, 'armor', armor > 0 ? `ARMOR ${Math.ceil(armor)}` : 'ARMOR —');
  }
  function setWeapon(name, mag, reserve) {
    setText(el.weaponName, 'wname', name);
    setAmmo(mag, reserve);
  }
  function setAmmo(mag, reserve) {
    setText(el.ammoMag, 'mag', String(mag));
    setText(el.ammoRes, 'res', ` / ${reserve}`);
    el.ammo.classList.toggle('empty', mag === 0);
  }
  function setReloading(on) { setText(el.reloadHint, 'rl', on ? 'RELOADING…' : ''); }
  function setCrosshairSpread(gapPx) {
    el.crosshair.style.setProperty('--gap', String(Math.round(gapPx)));
  }
  function setBombStatus(text) { setText(el.bomb, 'bomb', text); }
  function setCompass(yaw) {
    const deg = ((Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) * 180 / Math.PI) + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const label = dirs[Math.round(deg / 45) % 8];
    setText(el.compass, 'compass', `${label} ${String(Math.round(deg)).padStart(3, '0')}°`);
  }
  function setScope(on) { el.scope.style.opacity = on ? '1' : '0'; }

  function hitmarker(kill) {
    el.hitmarker.classList.add('on');
    el.hitmarker.classList.toggle('kill', !!kill);
    hitTimer = 0.09;
  }
  function flashDamage() {
    el.dmg.style.opacity = '1';
    setTimeout(() => { el.dmg.style.opacity = '0'; }, 140);
  }
  function flashWhite(level) { el.flash.style.opacity = String(level); }

  function banner(title, sub, cls) {
    el.bannerH.textContent = title;
    el.bannerP.textContent = sub || '';
    el.banner.className = 'show' + (cls ? ` ${cls}` : '');
    bannerTimer = 2.6;
  }
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    toastTimer = 2.4;
  }
  function showProgress(frac, label) {
    if (frac > 0) {
      el.progress.classList.add('show');
      el.progressFill.style.width = `${Math.round(frac * 100)}%`;
      el.progressLabel.textContent = label || '';
    } else {
      el.progress.classList.remove('show');
    }
  }

  function killfeed(killer, victim, headshot) {
    const div = document.createElement('div');
    const kc = killer && killer.id === 'player' ? 'vg' : killer && killer.team === 'vanguard' ? 'vg' : 'hw';
    const vc = victim.team === 'vanguard' ? 'vg' : 'hw';
    const kn = killer ? killer.name : '—';
    const vn = victim.name || 'You';
    div.innerHTML = `<span class="${kc}">${kn}</span> ${headshot ? '<span class="hs">[HEAD]</span> ' : ''}➤ <span class="${vc}">${vn}</span>`;
    el.killfeed.prepend(div);
    while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 6000);
  }

  function buildShop(money, ownedPrimary) {
    el.shop.innerHTML = '';
    const items = [
      ...Object.values(WEAPONS).filter((w) => w.slot === 'primary'),
      ...Object.values(GEAR),
    ];
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      const owned = it.id === ownedPrimary;
      b.disabled = owned || money < it.price;
      b.className = owned ? 'owned' : '';
      const desc = it.id in WEAPONS ? `${WEAPONS[it.id].damage} dmg · ${WEAPONS[it.id].mag} mag` : it.desc;
      b.innerHTML = `<span class="nm">${it.name}${owned ? ' — EQUIPPED' : ''}</span><span class="ds">${desc}</span><span class="pr">$${it.price}</span>`;
      b.addEventListener('click', () => { if (buyCb) buyCb(it.id); });
      b.dataset.key = String(i + 1);
      el.shop.appendChild(b);
    });
  }
  function showBuy(show, money, ownedPrimary) {
    el.buyMenu.hidden = !show;
    if (show) buildShop(money ?? 0, ownedPrimary ?? null);
  }
  function onBuy(cb) { buyCb = cb; }

  function setOverlay(title, copy, buttonLabel) {
    el.overlayTitle.innerHTML = title;
    el.overlayCopy.textContent = copy;
    el.playBtn.textContent = buttonLabel;
    el.overlay.hidden = false;
  }
  function hideOverlay() { el.overlay.hidden = true; }
  function onPlay(cb) { el.playBtn.addEventListener('click', cb); }

  function showDeath(killerName, headshot) {
    setOverlay('ELIMINATED', `Taken down by ${killerName}${headshot ? ' — headshot' : ''}. Spectating a teammate until the round ends.`, 'Keep watching');
  }
  function showMatchEnd(won, vg, hw, rows) {
    const table = `<table class="score-table"><tr><th>Player</th><th>Team</th><th>K</th><th>D</th></tr>${rows.map((r) => `<tr><td class="${r.team === 'vanguard' ? 'vg' : 'hw'}">${r.name}</td><td>${r.team === 'vanguard' ? 'Vanguard' : 'Hollow'}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`).join('')}</table>`;
    el.overlayTitle.innerHTML = won ? 'VICTORY' : 'DEFEAT';
    el.overlayCopy.innerHTML = `Final score — Vanguard ${vg} : ${hw} Hollow. MVP: ${rows[0].name} (${rows[0].kills} eliminations).`;
    const old = document.getElementById('match-table');
    if (old) old.remove();
    const div = document.createElement('div');
    div.id = 'match-table';
    div.innerHTML = table;
    el.overlayCopy.after(div);
    el.playBtn.textContent = 'Play again';
    el.overlay.hidden = false;
  }
  function showScoreboard(show, rows) {
    sb.hidden = !show;
    if (show && rows) {
      document.getElementById('sb-body').innerHTML = `<table class="score-table"><tr><th>Player</th><th>Team</th><th>K</th><th>D</th></tr>${rows.map((r) => `<tr><td class="${r.team === 'vanguard' ? 'vg' : 'hw'}">${r.name}</td><td>${r.team === 'vanguard' ? 'Vanguard' : 'Hollow'}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`).join('')}</table>`;
    }
  }

  // Top-down minimap: walls, sites, the player (triangle), teammates (blue),
  // and enemies the player can currently see (red).
  function updateMinimap(world, playerPos, yaw, teammates, enemies, bomb) {
    const W = 176, H = 132;
    mm.clearRect(0, 0, W, H);
    mm.fillStyle = 'rgba(32,36,44,0.9)';
    mm.fillRect(0, 0, W, H);
    const sx = (x) => ((x - world.bounds.minX) / (world.bounds.maxX - world.bounds.minX)) * W;
    const sz = (z) => ((z - world.bounds.minZ) / (world.bounds.maxZ - world.bounds.minZ)) * H;
    mm.fillStyle = '#4a505c';
    for (const c of world.colliders) {
      if (c.maxY < 0.5) continue;
      mm.fillRect(sx(c.minX), sz(c.minZ), Math.max(1, sx(c.maxX) - sx(c.minX)), Math.max(1, sz(c.maxZ) - sz(c.minZ)));
    }
    // Sites
    mm.font = 'bold 11px monospace'; mm.textAlign = 'center'; mm.textBaseline = 'middle';
    mm.fillStyle = '#f0a830';
    mm.beginPath(); mm.arc(sx(24), sz(-14), 7, 0, Math.PI * 2); mm.fill();
    mm.fillStyle = '#111'; mm.fillText('A', sx(24), sz(-14));
    mm.fillStyle = '#37c8ab';
    mm.beginPath(); mm.arc(sx(-24), sz(-14), 7, 0, Math.PI * 2); mm.fill();
    mm.fillStyle = '#111'; mm.fillText('B', sx(-24), sz(-14));
    // Bomb
    if (bomb && (bomb.state === 'planted' || bomb.state === 'dropped')) {
      mm.fillStyle = bomb.state === 'planted' ? '#ff3020' : '#f0a830';
      mm.beginPath(); mm.arc(sx(bomb.x), sz(bomb.z), 4, 0, Math.PI * 2); mm.fill();
    }
    // Teammates
    mm.fillStyle = '#4da3ff';
    for (const t of teammates) {
      if (!t.alive) continue;
      mm.beginPath(); mm.arc(sx(t.pos.x), sz(t.pos.z), 3, 0, Math.PI * 2); mm.fill();
    }
    // Visible enemies
    mm.fillStyle = '#ff5a4d';
    for (const e of enemies) {
      if (!e.alive) continue;
      mm.beginPath(); mm.arc(sx(e.pos.x), sz(e.pos.z), 3, 0, Math.PI * 2); mm.fill();
    }
    // Player triangle
    const px = sx(playerPos.x), pz = sz(playerPos.z);
    mm.fillStyle = '#fff';
    mm.save();
    mm.translate(px, pz);
    mm.rotate(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)) + Math.PI);
    mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
    mm.restore();
  }

  function tick(dt) {
    if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) el.hitmarker.classList.remove('on'); }
    if (bannerTimer > 0) { bannerTimer -= dt; if (bannerTimer <= 0) el.banner.className = ''; }
    if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) el.toast.classList.remove('show'); }
  }

  return {
    setTimer, setScore, setMoney, setHealth, setWeapon, setAmmo, setReloading,
    setCrosshairSpread, setBombStatus, setCompass, setScope,
    hitmarker, flashDamage, flashWhite, banner, toast, showProgress,
    killfeed, buildShop, showBuy, onBuy, setOverlay, hideOverlay, onPlay,
    showDeath, showMatchEnd, showScoreboard, updateMinimap, tick,
  };
}
