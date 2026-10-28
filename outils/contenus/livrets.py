"""Livret (cours complet, vocabulaire, quiz corrigé, sources) et fiche mémo d'une formation, au format SW_LIVRETS_DATA.
Repris de Cook ; pour Care, les consignes internes (ref.alerte) ne vont pas dans le livret de l'élève."""
import re
from bs4 import BeautifulSoup

LETTRES = 'ABCD'


def txt(el):
    return re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).replace(' ,', ',').replace(' .', '.').replace(' ;', ';').replace(' :', ' :')


def blocs_lecon(l):
    soup = BeautifulSoup(l['h'], 'html.parser')
    b = [{'t': 'h', 'x': l['t']}]
    cles, cas, piege, sources = [], '', '', []
    for el in soup.children:
        if not getattr(el, 'name', None):
            continue
        cls = ' '.join(el.get('class', []))
        if 'sw-ref' in cls:
            continue
        if 'sw-obj' in cls:
            b.append({'t': 'p', 'x': '**Objectif :** ' + l['o']})
        elif el.name == 'h4':
            b.append({'t': 'p', 'x': '**' + txt(el) + '**'})
        elif el.name == 'p' and 'sw-src' in cls:
            sources = [(a.get_text(strip=True), a.get('href')) for a in el.find_all('a')]
        elif el.name == 'p':
            b.append({'t': 'p', 'x': txt(el)})
        elif el.name == 'ul':
            b.append({'t': 'liste', 'items': [txt(li) for li in el.find_all('li', recursive=False)]})
        elif 'sw-cles' in cls:
            cles = [txt(li) for li in el.find_all('li')]
        elif 'sw-cas' in cls:
            cas = txt(el).replace('Mise en pratique :', '').strip()
        elif 'lc-tip' in cls:
            piege = txt(el).replace('Le piège à éviter :', '').strip()
    b.append({'t': 'cartes', 'items': [['À retenir', '\n'.join('• ' + c for c in cles)], ['Mise en pratique', cas]]})
    b.append({'t': 'note', 'x': '**Le piège à éviter :** ' + piege})
    return b, cles, piege, sources


def parties(lecons):
    g = []
    for l in lecons:
        k = l['t'].split('.')[0]
        if not g or g[-1][0] != k:
            g.append((k, []))
        g[-1][1].append(l)
    return g


def generer(id_, m):
    ref = m['ref']
    pages, pieges, toutes_sources, memo = [], [], [], []
    for k, ls in parties(m['lecons']):
        bl, cartes = [], []
        for l in ls:
            b, cles, piege, src = blocs_lecon(l)
            bl += b
            pieges.append(piege)
            for s in src:
                if s not in toutes_sources:
                    toutes_sources.append(s)
            cartes.append([re.sub(r'^\d+\.\d+ — ', '', l['t']), '\n'.join('• ' + c for c in cles)])
        pages.append({'titre': 'Partie %s — %d leçon%s' % (k, len(ls), 's' if len(ls) > 1 else ''), 'blocs': bl})
        memo.append({'titre': 'Partie ' + k, 'blocs': [{'t': 'cartes', 'items': cartes}]})
    intro = {'titre': 'Présentation de la formation', 'blocs': [
        {'t': 'p', 'x': m['sous']}, {'t': 'h', 'x': 'Cadre de référence'}, {'t': 'p', 'x': ref['cadre']},
        {'t': 'liste', 'items': ref['blocs']}, {'t': 'p', 'x': '**Durée et organisation :** ' + ref['duree']},
        {'t': 'h', 'x': 'Contenu du livret'},
        {'t': 'liste', 'items': ['%d leçons, avec pour chacune l’objectif, le cours, les points à retenir, le piège à éviter et une mise en pratique' % len(m['lecons']), '%d termes de vocabulaire' % len(m['vocab']), '%d questions de quiz et leur corrigé' % len(m['quiz']), 'les sources officielles et professionnelles citées (%d)' % len(toutes_sources)]},
        {'t': 'note', 'x': 'Ce livret reprend le contenu des leçons de la plateforme. Il se lit en complément des quiz et des examens blancs.'}]}
    vocab = {'titre': 'Vocabulaire professionnel', 'blocs': [{'t': 'tableau', 'tete': ['Terme', 'Définition'], 'lignes': m['vocab']}]}
    quiz = {'titre': 'Quiz de révision', 'blocs': [{'t': 'p', 'x': 'Entourez la bonne réponse, puis vérifiez avec le corrigé de la page suivante.'}] + [
        {'t': 'exo', 'titre': 'Question %d' % (i + 1), 'consigne': x['q'], 'items': ['☐ %s. %s' % (LETTRES[j], o) for j, o in enumerate(x['o'])]} for i, x in enumerate(m['quiz'])]}
    corrige = {'titre': 'Corrigé du quiz', 'blocs': [{'t': 'tableau', 'tete': ['N°', 'Réponse', 'Explication'], 'lignes': [[str(i + 1), '%s. %s' % (LETTRES[x['b']], x['o'][x['b']]), x['e']] for i, x in enumerate(m['quiz'])]}]}
    sources = {'titre': 'Sources', 'blocs': [{'t': 'p', 'x': 'Les leçons de cette formation s’appuient sur les sources suivantes, consultées lors de la rédaction.'}, {'t': 'liste', 'items': [n + ' — ' + u for n, u in toutes_sources]}, {'t': 'note', 'x': 'Les règles citées peuvent évoluer : vérifiez la date de chaque source et la version en vigueur du texte avant de l’appliquer.'}]}
    livret = {'titre': m['titre'], 'sousTitre': 'Livret de la formation : le cours complet, le vocabulaire, un quiz corrigé et les sources.', 'type': 'livret', 'pages': [intro] + pages + [vocab, quiz, corrige, sources]}
    memo.append({'titre': 'Les pièges à éviter', 'blocs': [{'t': 'liste', 'items': pieges}]})
    memo.append({'titre': 'Les mots du métier', 'blocs': [{'t': 'tableau', 'tete': ['Terme', 'Définition'], 'lignes': m['vocab']}]})
    fiche = {'titre': m['titre'], 'sousTitre': 'L’essentiel à retenir, leçon par leçon, et les pièges à éviter. À relire avant un quiz ou un examen blanc.', 'type': 'livret', 'pages': memo}
    return {'livret-' + id_: livret, 'memo-' + id_: fiche}
