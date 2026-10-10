// Presentation only: simulator log events own weather/terrain, including replacement and expiry.
(function () {
  'use strict';
  const terrains = { mistyterrain: 'Misty Terrain', grassyterrain: 'Grassy Terrain', electricterrain: 'Electric Terrain', psychicterrain: 'Psychic Terrain' };
  const weather = { raindance: 'Rain', sunnyday: 'Harsh sunlight', sandstorm: 'Sandstorm', snow: 'Snow', snowscape: 'Snow', hail: 'Hail', primordialsea: 'Heavy rain', desolateland: 'Extremely harsh sunlight', deltastream: 'Strong winds' };
  const id = value => String(value || '').replace(/^move: /, '').toLowerCase().replace(/[^a-z]/g, '');
  function mount(stage) {
    let terrain = '', sky = '';
    const ground = document.createElement('div');
    ground.className = 'tvb-field-ground'; ground.setAttribute('aria-hidden', 'true');
    const atmosphere = document.createElement('div');
    atmosphere.className = 'tvb-field-weather'; atmosphere.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 32; i++) {
      const p = document.createElement('i');
      p.style.cssText = `--x:${(i * 37) % 100}%;--y:${(i * 23) % 100}%;--delay:${-i * 0.19}s;--speed:${0.8 + (i % 7) * 0.23}s`;
      atmosphere.append(p);
    }
    const label = document.createElement('div');
    label.className = 'tvb-field-label'; label.setAttribute('aria-live', 'polite'); label.hidden = true;
    stage.append(ground, atmosphere, label);
    function render() {
      stage.dataset.terrain = terrain; stage.dataset.weather = sky;
      label.textContent = [weather[sky], terrains[terrain]].filter(Boolean).join(' \u00b7 ');
      label.hidden = !label.textContent;
    }
    render();
    return {
      update(line) {
        const parts = line.split('|'), key = id(parts[2]);
        if (parts[1] === '-weather') {
          if (key === 'none') sky = '';
          else if (Object.hasOwn(weather, key)) sky = key;
        } else if (parts[1] === '-fieldstart' && Object.hasOwn(terrains, key)) terrain = key;
        else if (parts[1] === '-fieldend' && key === terrain) terrain = '';
        else return;
        render();
      },
      dispose() { ground.remove(); atmosphere.remove(); label.remove(); delete stage.dataset.terrain; delete stage.dataset.weather; }
    };
  }
  window.TVBField = { mount };
}());
