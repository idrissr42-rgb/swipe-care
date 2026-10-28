// Image de partage du site (public/partage/care.png, 1200 × 630) : node outils/seo/partage.cjs
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const pub = path.resolve(__dirname, '../../public');
const logo = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(pub, 'logos/logo-care-blanc.svg')).toString('base64');
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;width:1200px;height:630px;background:#17413A;color:#fff;font-family:Nunito,'DejaVu Sans',sans-serif;overflow:hidden;position:relative}
.b{position:absolute;width:520px;height:520px;border-radius:48% 52% 55% 45%/55% 45% 55% 45%;background:#3F7A6C;opacity:.5;right:-140px;top:-180px}
.in{position:absolute;left:80px;top:70px;right:80px}
.m{display:flex;align-items:center;gap:18px;font-weight:800;font-size:30px;letter-spacing:.04em}.m img{width:74px;height:74px}
.m small{display:block;color:#6CC3A2;font-size:18px;letter-spacing:.12em;text-transform:uppercase;margin-top:4px}
h1{font-size:68px;line-height:1.05;margin:56px 0 18px;max-width:900px}h1 span{color:#6CC3A2}
p{font-size:27px;margin:0;color:#D3E6DD;max-width:1040px}
.c{position:absolute;left:80px;bottom:62px;display:flex;gap:12px;flex-wrap:wrap;max-width:1040px}
.c span{background:#6CC3A2;color:#132E29;font-weight:800;font-size:22px;border-radius:999px;padding:9px 20px}
</style></head><body><div class="b"></div><div class="in"><div class="m"><img src="${logo}" alt=""><div>SWIPE LEARN SCHOOL<small>Care · aide à la personne</small></div></div>
<h1>Accompagnez mieux, <span>de la naissance au grand âge</span></h1><p>Formations 100 % en ligne, sourcées, avec quiz et examens blancs.</p></div>
<div class="c"><span>Petite enfance</span><span>Aide à domicile</span><span>Alzheimer</span><span>CAP AEPE</span><span>Titre ADVF</span></div></body></html>`;
(async () => {
  const nav = await chromium.launch();
  const p = await nav.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(html);
  fs.mkdirSync(path.join(pub, 'partage'), { recursive: true });
  await p.screenshot({ path: path.join(pub, 'partage/care.png') });
  await nav.close();
  console.log('public/partage/care.png');
})();
