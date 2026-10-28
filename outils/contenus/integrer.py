"""Écrit les contenus des cours de Care pour le site à partir des formations rédigées (un module Python par formation).

    python3 outils/contenus/integrer.py [dossier des modules]      (par défaut /home/claude/swipe-care-contenus/modules)

Produit :
  public/js/contenus-cours.js   window.SW_ENRICHI (le contenu complet, chargé pour l'élève)
  public/js/livrets.js          window.SW_LIVRETS_DATA (livret et fiche mémo de chaque formation)
puis lancer `node outils/seo/resume.mjs` (résumé léger pour les visiteurs) ou `node outils/seo/generer.mjs`.
L'ordre des formations est celui de outils/modele/catalogue.json ; une formation absente du dossier est signalée.
"""
import importlib, json, sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
import livrets  # noqa: E402


def main(dossier):
    dossier = Path(dossier)
    sys.path.insert(0, str(dossier.parent))
    sys.path.insert(0, str(dossier))
    cat = json.loads((RACINE / 'outils/modele/catalogue.json').read_text(encoding='utf-8'))
    E, L, DIP, manque = {}, {}, {}, []
    for f in cat['formations']:
        id_ = f['id']
        if not (dossier / (id_ + '.py')).exists():
            manque.append(id_)
            continue
        mod = importlib.import_module(id_)
        m = mod.MODULE
        E[id_] = m
        if getattr(mod, 'DIPLOME', None):
            d = dict(mod.DIPLOME)
            if d.get('type') == 'titre':  # titre professionnel : même fiche que Cook (type « diplome » avec sa nature)
                d['type'], d['nature'] = 'diplome', 'Titre professionnel'
            DIP[id_] = d
        L.update(livrets.generer(id_, m))
    for nom, obj in (('SW_ENRICHI', E), ('SW_LIVRETS_DATA', L)):
        js = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
        assert '};' not in js, nom + ' : la suite « }; » couperait la lecture par generer.mjs'
    (RACINE / 'public/js/contenus-cours.js').write_text('/* SW_ENRICHI — contenus des formations de Care, avec leurs sources */\nwindow.SW_ENRICHI=' + json.dumps(E, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    rendu = (Path(__file__).parent / 'livrets_rendu.js').read_text(encoding='utf-8')  # rendu commun des livrets (repris de Cook, couleurs de Care)
    (RACINE / 'public/js/livrets.js').write_text('/* SW_LIVRETS */\nwindow.SW_LIVRETS_DATA=' + json.dumps(L, ensure_ascii=False, separators=(',', ':')) + ';\n' + rendu, encoding='utf-8')
    # fiches des diplômes préparés (badge, carte « Diplôme préparé », orientation) : lues par outils/modele/depuis_cook.py
    (RACINE / 'outils/modele/diplomes.json').write_text(json.dumps(DIP, ensure_ascii=False, indent=1), encoding='utf-8')
    print('%d formations, %d livrets, %d diplômes préparés' % (len(E), len(L), len(DIP)) + (' ; manquantes : ' + ', '.join(manque) if manque else ''))
    return manque


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/home/claude/swipe-care-contenus/modules')
