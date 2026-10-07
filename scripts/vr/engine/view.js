// What one side can legally know, rebuilt from that side's channel of the battle log (Showdown hides
// the opponent's exact HP, items it hasn't revealed, moves it hasn't used, and the bench it hasn't
// sent out). The AI reads only this plus its own request — never the Battle object.
export function createView(side) {
  const foe = side === 'p1' ? 'p2' : 'p1';
  const view = {
    side, foe, turn: 0,
    preview: { [side]: [], [foe]: [] }, // species seen at team preview
    active: { [side]: [null, null], [foe]: [null, null] },
    mons: {}, // key "p1: Name" -> public facts
    faintedOwn: 0,
    field: { weather: '', terrain: '', trickRoom: false },
    lastMove: {}, // key -> move name used last turn
  };
  const keyOf = (ident) => ident.replace(/^(p\d)[ab]:/, '$1:').trim();
  const slotOf = (ident) => (/^p\d([ab]):/.exec(ident) || [])[1] === 'b' ? 1 : 0;
  const sideOf = (ident) => ident.slice(0, 2);
  const parseHp = (text) => {
    if (!text) return null;
    const [hpPart, status = ''] = text.split(' ');
    if (hpPart === '0' || /fnt/.test(text)) return { pct: 0, status: 'fnt' };
    // Opponent HP is reported as a percentage, sometimes with the HP bar colour appended (20/100y).
    const [cur, max] = hpPart.replace(/[gyr]$/, '').split('/').map(Number);
    return { pct: max ? (cur / max) * 100 : 0, status };
  };
  const mon = (ident) => {
    const key = keyOf(ident);
    if (!view.mons[key]) view.mons[key] = { key, side: sideOf(ident), species: '', hp: 100, status: '', boosts: {}, moves: [], item: '', ability: '', turnsActive: 0, fainted: false };
    return view.mons[key];
  };

  function line(raw) {
    const parts = raw.split('|');
    const cmd = parts[1];
    switch (cmd) {
      case 'poke': view.preview[parts[2]].push(parts[3].split(',')[0]); break;
      case 'turn':
        view.turn = Number(parts[2]);
        for (const s of [side, foe]) view.active[s].forEach((k) => { if (k) view.mons[k].turnsActive += 1; });
        break;
      case 'switch': case 'drag': case 'replace': {
        const m = mon(parts[2]);
        m.species = parts[3].split(',')[0];
        const hp = parseHp(parts[4]);
        if (hp) { m.hp = hp.pct; m.status = hp.status; }
        m.boosts = {};
        m.turnsActive = 0;
        view.active[sideOf(parts[2])][slotOf(parts[2])] = m.key;
        break;
      }
      case 'detailschange': case '-formechange': mon(parts[2]).species = parts[3].split(',')[0]; break;
      case '-damage': case '-heal': case '-sethp': {
        const hp = parseHp(parts[3]);
        if (hp) { const m = mon(parts[2]); m.hp = hp.pct; if (hp.status) m.status = hp.status; }
        break;
      }
      case 'faint': {
        const m = mon(parts[2]);
        m.hp = 0; m.fainted = true;
        if (m.side === side) view.faintedOwn += 1;
        break;
      }
      case '-status': mon(parts[2]).status = parts[3]; break;
      case '-curestatus': mon(parts[2]).status = ''; break;
      case '-boost': case '-unboost': {
        const m = mon(parts[2]);
        const n = Number(parts[4]) * (cmd === '-boost' ? 1 : -1);
        m.boosts[parts[3]] = Math.max(-6, Math.min(6, (m.boosts[parts[3]] || 0) + n));
        break;
      }
      case '-clearboost': case '-clearallboost': Object.values(view.mons).forEach((m) => { if (cmd === '-clearallboost' || m.key === keyOf(parts[2])) m.boosts = {}; }); break;
      case 'move': {
        const m = mon(parts[2]);
        if (!m.moves.includes(parts[3])) m.moves.push(parts[3]);
        view.lastMove[m.key] = parts[3];
        break;
      }
      case '-item': mon(parts[2]).item = parts[3]; break;
      case '-enditem': mon(parts[2]).item = ''; break;
      case '-ability': mon(parts[2]).ability = parts[3]; break;
      case '-weather': view.field.weather = parts[2] === 'none' ? '' : parts[2]; break;
      case '-fieldstart': if (/Terrain/.test(parts[2])) view.field.terrain = parts[2].replace('move: ', ''); if (/Trick Room/.test(parts[2])) view.field.trickRoom = true; break;
      case '-fieldend': if (/Terrain/.test(parts[2])) view.field.terrain = ''; if (/Trick Room/.test(parts[2])) view.field.trickRoom = false; break;
      default: break;
    }
  }
  view.feed = (lines) => lines.forEach((l) => { if (l.startsWith('|')) line(l); });
  view.activeMons = (s) => view.active[s].map((k) => (k ? view.mons[k] : null));
  return view;
}
