"""Fabrique public/index.html de Care à partir de celui de Cook.

Le moteur est le même (espace élève, pont vers le pilote, fiches formation, plan des lignes, « Trouver ma
formation », inscription, contenus allégés pour les visiteurs) ; tout ce qui est propre à Cook est remplacé :
en-tête, couleurs, partie publique, mentions, données du catalogue, orientation, démonstrations.
Chaque remplacement vérifie qu'il trouve exactement ce qu'il attend : si le modèle Cook a changé, le script
s'arrête et dit où.

    python3 outils/modele/depuis_cook.py /home/claude/swipe-cook/public/index.html public/index.html
"""
import json, re, sys
from pathlib import Path

ICI = Path(__file__).parent
SITE = 'https://care.swipelearn.school'


def lire(n):
    return (ICI / n).read_text(encoding='utf-8')


class Page:
    def __init__(self, s):
        self.s = s

    def un(self, avant, apres, nom, n=1):
        k = self.s.count(avant)
        if k != n:
            raise SystemExit('« %s » : %d occurrence(s) au lieu de %d' % (nom, k, n))
        self.s = self.s.replace(avant, apres)

    def bloc(self, debut, fin, apres, nom, garder_fin=False):
        """Remplace le texte de « debut » jusqu'à « fin » (inclus, sauf garder_fin) ; chacun doit être unique."""
        i = self.s.find(debut)
        if i < 0 or self.s.find(debut, i + 1) >= 0:
            raise SystemExit('« %s » : début introuvable ou en double' % nom)
        j = self.s.find(fin, i + len(debut))
        if j < 0:
            raise SystemExit('« %s » : fin introuvable' % nom)
        j2 = j if garder_fin else j + len(fin)
        self.s = self.s[:i] + apres + self.s[j2:]

    def re(self, motif, apres, nom, n=1, flags=0):
        f = apres if callable(apres) else (lambda m, t=apres: t)  # texte de remplacement pris tel quel
        r, k = re.subn(motif, f, self.s, flags=flags)
        if n is not None and k != n:
            raise SystemExit('« %s » : %d remplacement(s) au lieu de %s' % (nom, k, n))
        self.s = r


C = json.loads(lire('catalogue.json'))
ICS = json.loads(lire('icones_care.json'))


def icone(nom):
    return '<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">' + ICS[nom] + '</svg>'


def public_compte():
    """Partie publique, avec les compteurs calculés à partir des contenus réels."""
    racine = ICI.parent.parent / 'public' / 'js'
    def donnees(fichier, nom):
        t = (racine / fichier).read_text(encoding='utf-8')
        i = t.index('window.' + nom + '=') + len('window.' + nom + '=')
        return json.JSONDecoder().raw_decode(t[i:])[0]
    E = donnees('contenus-cours.js', 'SW_ENRICHI')
    L = donnees('livrets.js', 'SW_LIVRETS_DATA')
    vals = [len(E), sum(len(f['lecons']) for f in E.values()), len(L), sum(len(f['examens']) for f in E.values())]
    h = lire('care_public.html').strip()
    k = [0]
    def rempl(m):
        v = vals[k[0]]; k[0] += 1
        return 'data-val="%d"' % v
    h, n = re.subn(r'data-val="\d+"', rempl, h)
    if n != 4:
        raise SystemExit('compteurs : %d au lieu de 4' % n)
    print('compteurs', vals)
    return h


def main(src, dst):
    p = Page(Path(src).read_text(encoding='utf-8'))

    # ---------------------------------------------------------------- en-tête
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "WebSite", "@id": SITE + "/#site", "name": "Swipe Learn School", "alternateName": ["Swipe Learn School · Care", "Care, école de l’aide à la personne Swipe Learn School"], "url": SITE + "/", "inLanguage": "fr-FR"},
        {"@type": "EducationalOrganization", "@id": SITE + "/#ecole", "name": "Swipe Learn School", "alternateName": "Swipe Learn School · Care", "legalName": "SWIPE LEARN SCHOOL",
         "description": "Care, l'école de l'aide à la personne et de la petite enfance de Swipe Learn School : formations 100 % en ligne.",
         "url": SITE + "/", "logo": SITE + "/icones/icone-512.png", "image": SITE + "/icones/icone-512.png", "email": "contact@swipeandlearn.school",
         "address": {"@type": "PostalAddress", "streetAddress": "40 rue de la Badouillère", "postalCode": "42000", "addressLocality": "Saint-Étienne", "addressRegion": "Auvergne-Rhône-Alpes", "addressCountry": "FR"},
         "parentOrganization": {"@type": "EducationalOrganization", "@id": "https://swipelearn.school/#organisation", "name": "Swipe Learn School", "url": "https://swipelearn.school/"}}]}
    tete = ('<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
            '<title>%(t)s</title>\n<meta name="description" content="%(d)s">\n<link rel="canonical" href="%(u)s/">\n'
            '<meta property="og:type" content="website"><meta property="og:locale" content="fr_FR"><meta property="og:site_name" content="Swipe Learn School">\n'
            '<meta property="og:title" content="%(t)s">\n<meta property="og:description" content="%(d)s">\n'
            '<meta property="og:url" content="%(u)s/"><meta property="og:image" content="%(u)s/partage/care.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="index,follow,max-image-preview:large">\n'
            '<script type="application/ld+json">%(ld)s</script>\n') % {'t': C['accueil']['titre'], 'd': C['accueil']['description'], 'u': SITE, 'ld': json.dumps(ld, ensure_ascii=False)}
    p.bloc('<!DOCTYPE html>', '<link rel="preconnect" href="https://fonts.googleapis.com">', tete, 'en-tête', garder_fin=True)
    p.un('<meta name="theme-color" content="#2f55d4">', '<meta name="theme-color" content="#2B7A63">', 'couleur du thème')
    p.un('<meta name="apple-mobile-web-app-title" content="Swipe Learn School · Cook">', '<meta name="apple-mobile-web-app-title" content="Care">', 'nom sur iPhone')
    p.un('<link rel="icon" type="image/svg+xml" href="logos/icone-cook.svg">', '<link rel="icon" type="image/svg+xml" href="logos/icone-care.svg">', 'icône')
    p.un('<link rel="apple-touch-icon" href="icones/icone-192.png">', '<link rel="apple-touch-icon" href="icones/apple-touch-icon.png">', 'icône iPhone')

    # ---------------------------------------------------------------- partie publique et mentions
    p.bloc("<!-- ===== SÉLECTEUR D'ESPACE (démo) ===== -->", '</div><!-- /site-pub -->', public_compte(), 'partie publique')
    p.bloc('<div id="m-mentions" style="display:none">', '\n  </div>\n</div>\n\n<!-- ===== SALLE DE VISIO', lire('care_modales.html').strip('\n').lstrip() + '\n  </div>\n</div>\n\n<!-- ===== SALLE DE VISIO', 'mentions')

    # ---------------------------------------------------------------- espace élève : marque et exemples de démonstration
    p.un('<span class="toque"><img src="logos/logo-cook-blanc.svg" alt="" width="44" height="44"></span> SWIPE LEARN SCHOOL · COOK',
         '<span class="toque"><img src="logos/logo-care-blanc.svg" alt="" width="44" height="44"></span> SWIPE LEARN SCHOOL · CARE', 'marque de l’espace élève')
    p.un('<div class="user"><b>Léa Martin</b>CAP Cuisine — 1re année<br>Promo 2026-2028</div>', '<div class="user"><b></b></div>', 'élève de démonstration')
    p.un('<h2 class="pagetitle">Bonjour Léa ! </h2>', '<h2 class="pagetitle">Bonjour</h2>', 'salutation de démonstration')
    p.re(r'<p class="pagesub">Prochaine session : <b>lundi 13 juillet[^<]*</b></p>', '<p class="pagesub"></p>', 'session de démonstration')
    p.un('<h2 class="pagetitle">Mes cours interactifs — CAP Cuisine</h2>', '<h2 class="pagetitle">Mes cours interactifs</h2>', 'titre de mes cours')
    p.re(r'\n      <div class="panelw" style="margin-top:22px">\n        <h3>Modules généraux</h3>\n(?:        <div class="cours-item">[^\n]*\n){2}      </div>', '', 'modules généraux de démonstration', n=None)
    p.re(r'— merci Léa !</div>', '— merci !</div>', 'remerciement de démonstration', n=None)
    p.re(r'<p style="font-size:.92rem;margin-bottom:14px"><b>Mardi 8 juillet 2026[^\n]*</p>', '<p style="font-size:.92rem;margin-bottom:14px"></p>', 'session à signer de démonstration')
    p.re(r'<tbody id="histo-emarg">\n(?:            <tr[^\n]*\n){4}', '<tbody id="histo-emarg">\n            <tr id="ligne-8juil" hidden><td></td><td></td><td></td><td></td></tr>\n', 'historique de démonstration')
    p.re(r"const FORMATEUR_ACTUEL='[^']*';", "const FORMATEUR_ACTUEL='';", 'formateur de démonstration')
    p.re(r'const VISIO=\[\];[^\n]*|const VISIO=\[\n[\s\S]*?\n\];', 'const VISIO=[];', 'visios de démonstration')
    p.bloc('const VIDEOS=[', '\n];', 'const VIDEOS=[]; /* vidéos de Care : à venir */', 'vidéothèque de Cook')

    # ---------------------------------------------------------------- catalogue
    p.bloc('const COURS = {\n', '\n};\n', 'const COURS = {\n/* les formations de Care sont créées au chargement par SW_ENRICHI (liste et icônes : SW_NOUV) */\n};\n', 'COURS')
    p.bloc('const DUREES={', '\n};', 'const DUREES={};', 'durées de Cook')
    nouv = ','.join("%s:'%s'" % (f['id'], f['icone'].replace('-', '_')) for f in C['formations'])
    p.re(r"var SW_NOUV=\{[^\n]*\};", lambda m: 'var SW_NOUV={' + nouv + '};', 'SW_NOUV')
    p.re(r"var SW_LIVRETS=\{[^\n]*\};", 'var SW_LIVRETS={};', 'livrets de Cook')
    noms_ic = sorted({f['icone'] for f in C['formations']})
    ic = ',\n'.join("%s:'%s'" % (n.replace('-', '_'), icone(n)) for n in noms_ic)
    p.re(r"(const ICONES=\{\n)toque:'[^\n]*\n(?:[a-z]+:'[^\n]*\n)*?(video:')", lambda m: m.group(1) + ic + ',\n' + m.group(2), 'icônes du catalogue')
    # icônes des questions d'orientation (⟦nom⟧) : on ajoute au dictionnaire de Cook celles qui lui manquent
    extra = {k: v for k, v in ICS.items() if ('"' + k + '":') not in p.s.split('window.SW_ICP=', 1)[1][:200000].split('</script>', 1)[0]}
    p.un('<script>window.SW_ICP={', '<script>window.SW_ICP={' + ''.join('%s: %s, ' % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in sorted(extra.items())), 'icônes ajoutées')
    p.un("window.__ECOLE__='cook';", "window.__ECOLE__='care';", 'école')

    # ---------------------------------------------------------------- plan des lignes
    lignes = ',\n'.join(" {n:%d,nom:'%s',c:'%s',ids:[%s]}" % (l['n'], l['nom'].replace("'", '’'), l['c'], ','.join("'%s'" % x for x in l['ids'])) for l in C['lignes'])
    p.bloc('var LIGNES=[\n', '];\n', 'var LIGNES=[\n' + lignes + '];\n', 'lignes')
    court = ','.join("%s:'%s'" % (f['id'], f['court'].replace("'", '’')) for f in C['formations'])
    p.re(r"var COURT=\{[^\n]*\};", lambda m: 'var COURT={' + court + '};', 'noms courts')
    fd = ICI / 'diplomes.json'
    dip = json.loads(fd.read_text(encoding='utf-8')) if fd.exists() else {}
    # badge honnête : la formation prépare au diplôme, elle ne le délivre pas
    p.un("badge:'⟦graduation-cap⟧ Diplômante'", "badge:'⟦graduation-cap⟧ '+(d.nature?'Titre professionnel':'Diplôme d’État')", 'badge diplôme')
    p.bloc('window.SW_DIPLOMES={', '\n};', 'window.SW_DIPLOMES=' + json.dumps(dip, ensure_ascii=False) + ';', 'diplômes préparés')

    # ---------------------------------------------------------------- fiches : accroches, publics, tarifs
    acc = ',\n'.join('%s:%s' % (f['id'], json.dumps(f['accroche'], ensure_ascii=False)) for f in C['formations'])
    p.bloc('var ACC={', '};', 'var ACC={' + acc + '};', 'accroches')
    pub = ','.join('%d:%s' % (l['n'], json.dumps(l['public'], ensure_ascii=False)) for l in C['lignes'])
    p.bloc('var PUBLIC={', '};', 'var PUBLIC={' + pub + '};', 'publics')
    p.re(r'/\* Tarifs par stagiaire[^\n]*\*/\nvar TARIF=\{[^}]*\},PARCOURS_CAP=\{[^\n]*?\};',
         '/* Tarifs par stagiaire (euros, grille de Care : outils/modele/tarifs.json, la même que le pilote) */\nvar TARIF=' + json.dumps(json.loads(lire('tarifs.json')), separators=(',', ':')) + ',PARCOURS_CAP={"ids":[],"prix":0,"titre":""};', 'tarifs')
    p.un("esc(PUBLIC[li.n]||'Professionnels de la restauration et personnes en reconversion.')", "esc(PUBLIC[li.n]||'Professionnels de l’aide à la personne, proches aidants et personnes en reconversion.')", 'public par défaut')
    p.un('Aucun diplôme n’est exigé pour suivre la formation ; les conditions d’accès aux examens officiels, s’il y en a, vous sont précisées à l’entretien.',
         'Aucun diplôme n’est exigé pour suivre la formation.', 'prérequis')
    p.un('Messagerie avec le centre et suivi de votre progression par l’équipe.', 'Messagerie avec l’école et suivi de votre progression par l’équipe.', 'formateur joignable')
    p.un('réponse du centre sous 15 jours', 'réponse de l’école sous 15 jours', 'délai de réponse (fiche)')

    # ---------------------------------------------------------------- inscription
    p.un("'<p class=\"ir-sub\">Réponse du centre sous 15 jours. Champs marqués * obligatoires.</p>'", "'<p class=\"ir-sub\">Réponse de l’école sous 15 jours. Champs marqués * obligatoires.</p>'", 'délai de réponse (inscription)')
    p.un("'<option>CPF ou France Travail (après la certification Qualiopi de l’école)</option>'+", '', 'option CPF')
    p.un("'<option>À voir avec le centre</option>'+", "'<option>À voir avec l’école</option>'+", 'option financement')
    p.re(r"var html='<div class=\"fd-note\">\\ud83c\\udf93 <b>'\+ids\.length\+' formations disponibles</b>.*?\+'</div>';",
         "var html='<div class=\"fd-note\"><b>'+ids.length+' formations disponibles</b> dans cette école, toutes 100\\u00a0% en ligne.</div><div class=\"fcards-dyn\">'+ids.map(function(id){return _vd_carte(id,COURS[id]);}).join('')+'</div>';",
         'note du catalogue')

    # ---------------------------------------------------------------- orientation « Trouver ma formation »
    p.bloc('var Q=[', 'function nomF(id){', lire('care_orientation.js').strip() + '\nfunction nomF(id){', 'orientation : questions et règles')
    p.re(r"var fm=\{alternance:[^\n]*\n  var sf=document\.getElementById\('ir-financement'\);if\(sf&&fm\)\{[^\n]*\n", '', 'orientation : financement')
    p.re(r"sm=\{hcr:'Salarié·e',reconv:'Salarié·e',emploi:'Demandeur d\\'emploi',createur:'Indépendant·e',jeune:'Autre'\}\[R\.situation\]",
         "sm={enfance:'Salarié·e',domicile:'Salarié·e',etab:'Salarié·e',aidant:'Autre',createur:'Indépendant·e',reconv:'Salarié·e',emploi:'Demandeur d\\'emploi'}[R.situation]", 'orientation : situation')
    p.re(r"msg\.value=\(R\.fin==='alternance'\?'Je souhaite me former en alternance\. ':''\)\+", 'msg.value=', 'orientation : message')
    p.un('Ce conseil est calculé à partir de vos réponses et des conditions officielles d’accès aux diplômes.', 'Ce conseil est calculé à partir de vos réponses.', 'orientation : mention')
    p.un('<span>Sept questions, deux minutes : nous vous indiquons la formation qui correspond à votre parcours, ses conditions d’accès et son financement.</span>',
         '<span>Quelques questions, une minute : nous vous indiquons la formation ou le diplôme qui correspond à votre métier et à votre objectif.</span>', 'orientation : bandeau')
    p.un('<b>Vous hésitez entre plusieurs formations ?</b>', '<b>Vous hésitez entre plusieurs formations\u00a0?</b>', 'orientation : insécable')
    p.un('<span><b>Chaque station est cliquable :</b> touchez-la pour voir le programme, le diplôme préparé, la durée et les conditions.</span>',
         '<span><b>Chaque station est cliquable :</b> touchez-la pour voir le programme, la durée et un extrait de la première leçon.</span>', 'orientation : astuce')

    # ---------------------------------------------------------------- marque, adresse, couleurs
    p.un("var u=location.origin+'/logos/logo-cook.svg'", "var u=location.origin+'/logos/logo-care.svg'", 'logo des livrets', n=2)
    p.re(r'<b style="font-size:20px;color:#2f55d4">Cook</b>', '<b style="font-size:20px;color:#2B7A63">Care</b>', 'marque des livrets')
    p.re(r'Swipe Learn School · Cook', 'Swipe Learn School · Care', 'nom de l’école', n=None)
    p.re(r'cook\.swipelearn\.school', 'care.swipelearn.school', 'adresse du site', n=None)
    s = p.s
    for a, b in C['couleurs'].items():
        s = re.sub(re.escape(a), b, s, flags=re.I)
    s = re.sub(r'rgba\(23,\s*38,\s*92,', 'rgba(19,46,41,', s)
    s = re.sub(r'rgba\(20,\s*40,\s*110,', 'rgba(19,46,41,', s)
    s = re.sub(r'rgba\(10,\s*20,\s*60,', 'rgba(10,30,26,', s)
    p.s = s
    p.un('/* ===== CHARTE GRAPHIQUE SWIPE LEARN SCHOOL · COOK ===== */', '/* ===== CHARTE GRAPHIQUE SWIPE LEARN SCHOOL · CARE ===== */', 'titre de la charte')
    p.re(r'\n<style>/\* COOK — accueil version offre \*/.*?</style>', '', 'styles de l’accueil Cook', n=None, flags=re.S)
    p.un('\n</head>\n<body>', '\n<style>/* CARE — styles propres à l’école */\n' + lire('care.css').strip() + '\n</style>\n</head>\n<body>', 'styles propres à Care')

    # ---------------------------------------------------------------- contrôles
    # « Cook » visible ou adresse du site ; les valeurs par défaut du code (« cook ») restent sans effet ici
    reste = [m.group(0) for m in re.finditer(r'.{0,40}(\bCook\b|cook\.swipe|logo-cook|icone-cook).{0,40}', p.s)]
    if reste:
        raise SystemExit('Cook encore présent :\n  ' + '\n  '.join(reste[:20]))
    Path(dst).write_text(p.s, encoding='utf-8')
    print('ok', dst, '%d Ko' % (len(p.s.encode()) // 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
