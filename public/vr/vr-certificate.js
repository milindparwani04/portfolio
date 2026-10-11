// A local, self-contained keepsake. No personal data is sent to a server.
(function () {
  'use strict';
  const escape = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function svg(record) {
    const team = record.team.map((name, i) => `<text x="600" y="${465+i*38}" class="member">${escape(name)}</text>`).join('');
    const modifiers = record.modifiers.length ? [record.modifiers.slice(0, 3), record.modifiers.slice(3)].filter(line => line.length).map((line, i) => `<text x="600" y="${744+i*24}" font-size="16">${escape(line.join(' · '))}</text>`).join('') : '<text x="600" y="754" font-size="16">Standard rules</text>';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><style>text{font-family:Georgia,serif;text-anchor:middle;fill:#30285c}.small{font:16px sans-serif;letter-spacing:3px}.member{font:24px sans-serif}</style><rect width="1200" height="900" fill="#faf5e8"/><rect x="28" y="28" width="1144" height="844" fill="none" stroke="#aa8a4b" stroke-width="4"/><rect x="42" y="42" width="1116" height="816" fill="none" stroke="#aa8a4b"/><path d="M600 65l12 25 28 4-20 20 5 28-25-13-25 13 5-28-20-20 28-4z" fill="#b5924e"/><text x="600" y="195" font-size="56">THE VERY BEST</text><text x="600" y="237" class="small">CERTIFICATE OF VICTORY</text><text x="600" y="299" font-size="23">Congratulations,</text><text x="600" y="352" font-size="42">${escape(record.name)}</text><text x="600" y="399" font-size="22">You defeated Ren Kestrel and won the run with this team:</text>${team}<text x="600" y="${Math.max(670,465+record.team.length*38)}" font-size="24">${escape(record.difficulty)} difficulty · ${escape(record.tier)} tier · ×${escape(record.multiplier)}</text>${modifiers}<text x="600" y="802" class="small">${escape(record.date)} · CHAMPION RUN COMPLETE</text><text x="600" y="835" font-size="12">Unofficial fan project · Personal keepsake</text></svg>`;
  }
  function open(record) {
    const tab = window.open('', '_blank');
    if (!tab) return false;
    tab.opener = null;
    const art = svg(record);
    tab.document.open();
    tab.document.write(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Very Best — Victory certificate</title><style>body{margin:0;background:#e7e2f3;color:#30285c;font:16px system-ui}nav{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;padding:20px}button,a{font:inherit;padding:12px 20px;border:1px solid #30285c;background:#faf5e8;color:inherit;border-radius:4px;cursor:pointer;text-decoration:none}main{max-width:1200px;margin:auto;padding:0 20px 24px}svg{width:100%;height:auto;display:block}p{text-align:center}@page{size:landscape;margin:0}@media print{nav,p{display:none}body{background:white}main{padding:0;max-width:none}svg{width:100vw;height:100vh}}</style><nav><a id="download" download="the-very-best-certificate.svg">Download certificate</a><button id="print">Save as PDF / Print</button></nav><main>${art}</main><p>Your winning run, saved as a keepsake.</p></html>`);
    tab.document.close();
    const url = tab.URL.createObjectURL(new tab.Blob([art], {type:'image/svg+xml'}));
    tab.document.getElementById('download').href = url;
    tab.document.getElementById('print').onclick = () => tab.print();
    tab.addEventListener('pagehide', () => tab.URL.revokeObjectURL(url), {once:true});
    return true;
  }
  window.TVBCertificate = {open, svg};
}());
