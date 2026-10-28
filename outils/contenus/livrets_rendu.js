/* Rendu commun des livrets (plateforme + PDF) */
var SW_LIVRET_CSS='.lv{font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#132E29;line-height:1.55;font-size:15px}'+
'.lv-couv{background:#17413A;color:#fff;border-radius:18px;padding:46px 40px;margin-bottom:22px}'+
'.lv-couv small{display:inline-block;background:#6CC3A2;color:#132E29;font-weight:800;border-radius:999px;padding:5px 14px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:16px}'+
'.lv-couv h1{font-size:30px;line-height:1.2;margin:0 0 14px;font-weight:800}.lv-couv p{margin:0;font-size:15px;opacity:.95;max-width:720px}'+
'.lv-marque{margin-top:26px;font-weight:800;letter-spacing:.12em;font-size:12px;opacity:.9}'+
'.lv-page{background:#EEF4F0;border-radius:18px;padding:30px 34px;margin-bottom:22px}'+
'.lv-page>h2{color:#B5573F;font-size:23px;margin:0 0 16px;font-weight:800}'+
'.lv h1,.lv h2,.lv h3{font-family:inherit}.lv h3{color:#B5573F;font-size:16.5px;margin:18px 0 8px;font-weight:700}.lv p{margin:0 0 10px}.lv ul{margin:0 0 12px 20px;padding:0}.lv li{margin-bottom:5px}'+
'.lv-cartes{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:8px 0 14px}'+
'.lv-carte{background:#F5F9F6;border:1px solid #D3E6DD;border-left:4px solid #B5573F;border-radius:10px;padding:13px 15px;break-inside:avoid}.lv-carte b.t{display:block;margin-bottom:5px;font-size:15px;color:#132E29}'+
'.lv-etapes{margin:8px 0 14px;padding:0;list-style:none;counter-reset:e}.lv-etapes li{counter-increment:e;position:relative;padding:0 0 12px 46px;break-inside:avoid}'+
'.lv-etapes li:before{content:counter(e);position:absolute;left:0;top:0;width:32px;height:32px;border-radius:9px;background:#F6E1DA;color:#8E3F2C;font-weight:800;display:flex;align-items:center;justify-content:center}'+
'.lv-etapes b.t{display:block;color:#132E29}'+
'.lv table{width:100%;border-collapse:collapse;margin:8px 0 14px;background:#F5F9F6;border-radius:10px;overflow:hidden;font-size:13.5px}.lv th{background:#F6E1DA;color:#22403A;text-align:left;padding:9px 11px}.lv td{padding:8px 11px;border-top:1px solid #DCE9E2;vertical-align:top;height:22px}'+
'.lv-note{background:#F6E1DA;border-left:4px solid #6CC3A2;border-radius:10px;padding:12px 16px;margin:10px 0 14px;break-inside:avoid}'+
'.lv-exo{background:#fff;border:2px solid #D3E6DD;border-radius:12px;padding:16px 18px;margin:10px 0 16px;break-inside:avoid}.lv-exo h3{margin-top:0}.lv-exo .c{font-style:italic;margin-bottom:10px}.lv-exo ol{margin:0 0 0 20px;padding:0}.lv-exo li{margin-bottom:12px}'+
'.lv-pied{font-size:11.5px;color:#66766E;text-align:center;margin:6px 0 0}';
function swLvTxt(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\n/g,'<br>').replace(/(\S)\s+•\s+/g,'$1<br>• ');}
function swLvBloc(b){var T=swLvTxt;
  if(b.t==='p')return '<p>'+T(b.x)+'</p>';
  if(b.t==='h')return '<h3>'+T(b.x)+'</h3>';
  if(b.t==='note')return '<div class="lv-note">'+T(b.x)+'</div>';
  if(b.t==='liste')return '<ul>'+b.items.map(function(x){return '<li>'+T(x)+'</li>';}).join('')+'</ul>';
  if(b.t==='cartes')return '<div class="lv-cartes">'+b.items.map(function(x){return '<div class="lv-carte"><b class="t">'+T(x[0])+'</b>'+T(x[1])+'</div>';}).join('')+'</div>';
  if(b.t==='etapes')return '<ol class="lv-etapes">'+b.items.map(function(x){return '<li><b class="t">'+T(x[0])+'</b>'+T(x[1])+'</li>';}).join('')+'</ol>';
  if(b.t==='tableau')return '<table><thead><tr>'+b.tete.map(function(x){return '<th>'+T(x)+'</th>';}).join('')+'</tr></thead><tbody>'+b.lignes.map(function(l){return '<tr>'+l.map(function(x){return '<td>'+T(x)+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';
  if(b.t==='exo')return '<div class="lv-exo"><h3>'+T(b.titre)+'</h3>'+(b.consigne?'<div class="c">'+T(b.consigne)+'</div>':'')+(b.items.length?'<ol>'+b.items.map(function(x){return '<li>'+T(x)+'</li>';}).join('')+'</ol>':'')+'</div>';
  return '';}
function swLvRendre(d,marque){marque=marque||'SWIPE LEARN SCHOOL · CARE';
  return '<div class="lv"><div class="lv-couv"><small>'+(d.type==='exercices'?'Cahier d’exercices':'Livret pédagogique')+'</small><h1>'+swLvTxt(d.titre)+'</h1><p>'+swLvTxt(d.sousTitre)+'</p><div class="lv-marque">'+swLvTxt(marque)+'</div></div>'+
    d.pages.map(function(p){return '<div class="lv-page"><h2>'+swLvTxt(p.titre)+'</h2>'+p.blocs.map(swLvBloc).join('')+'</div>';}).join('')+
    '<p class="lv-pied">'+swLvTxt(marque)+' — support pédagogique réservé aux élèves</p></div>';}
