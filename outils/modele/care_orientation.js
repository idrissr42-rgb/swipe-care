var Q=[
 {id:'situation',q:'Où en êtes-vous aujourd’hui ?',aide:'Pour vous proposer la formation la plus utile.',o:[
  ['enfance','⟦baby⟧','Je travaille auprès de jeunes enfants','assistante maternelle, garde d’enfants, crèche'],
  ['domicile','⟦house-line⟧','J’aide des personnes à domicile','auxiliaire de vie, aide à domicile'],
  ['etab','⟦buildings⟧','Je travaille en établissement','EHPAD, foyer, structure médico-sociale'],
  ['aidant','⟦hands-praying⟧','J’aide un proche','parent âgé, enfant ou conjoint malade ou en situation de handicap'],
  ['reconv','⟦arrows-clockwise⟧','Je veux me reconvertir dans l’aide ou le soin',''],
  ['createur','⟦rocket-launch⟧','Je veux créer mon activité','services à la personne'],
  ['emploi','⟦magnifying-glass⟧','Je cherche un emploi dans ce secteur','']]},
 {id:'objectif',q:'Quel est votre objectif principal ?',aide:'Choisissez le plus proche, vous pourrez voir les autres formations ensuite.',o:[
  ['diplome','⟦graduation-cap⟧','Obtenir un diplôme ou un titre','CAP, bac pro, BTS, titre pro ou VAE'],
  ['ifas','⟦identification-card⟧','Entrer en formation d’aide-soignant ou d’auxiliaire de puériculture','la sélection IFAS ou IFAP'],
  ['enfant','⟦baby⟧','Mieux accompagner les jeunes enfants','développement, sécurité, repas, Montessori'],
  ['quotidien','⟦hand-heart⟧','Mieux aider au quotidien','toilette, repas, médicaments, entretien'],
  ['prevention','⟦person-simple-walk⟧','Prévenir les chutes et me ménager','gestes, postures, transferts'],
  ['grandage','⟦brain⟧','Accompagner le grand âge','Alzheimer, refus de soins, fin de vie'],
  ['handicap','⟦wheelchair⟧','Accompagner une personne en situation de handicap','enfant ou adulte'],
  ['securite','⟦siren⟧','Réagir face à une urgence ou une souffrance','alerte, santé mentale, maltraitance'],
  ['durer','⟦smiley⟧','Tenir dans la durée','communication, épuisement, droits des aidants']]},
 {id:'diplome',q:'Quel diplôme ou titre visez-vous ?',aide:'Pour vous orienter vers la bonne préparation.',si:function(r){return r.objectif==='diplome';},o:[
  ['aepe','⟦baby-carriage⟧','Travailler avec les jeunes enfants','crèche, école maternelle, assistante maternelle'],
  ['advf','⟦house-line⟧','Aider des personnes et des familles à domicile',''],
  ['asms','⟦hospital⟧','Travailler en établissement médico-social','hygiène des locaux, repas, accompagnement'],
  ['aaga','⟦hand-heart⟧','Accompagner les personnes âgées en établissement','CAP Agent accompagnant au grand âge'],
  ['assp','⟦student⟧','Un bac ou un BTS du sanitaire et social','bac pro ASSP, BTS ESF ou SP3S'],
  ['rpms','⟦briefcase⟧','Diriger une petite structure','titre Responsable de petite ou moyenne structure'],
  ['vae','⟦identification-card⟧','Faire valider mon expérience','VAE du DEAES, du DEAS ou du DEAP'],
  ['nsp','⟦magnifying-glass⟧','Je ne sais pas encore','']]},
 {id:'exp',q:'Depuis combien de temps travaillez-vous dans ce domaine ?',aide:'Emplois, stages, aide à un proche : tout compte.',o:[
  ['0','⟦plant⟧','Je débute',''],['1','⟦leaf⟧','Moins de 2 ans',''],['3','⟦tree⟧','Plus de 2 ans','']]},
 {id:'temps',q:'Combien de temps pouvez-vous y consacrer par semaine ?',o:[
  ['3','⟦timer⟧','Moins de 5 heures',''],['7','⟦clock⟧','De 5 à 10 heures',''],['15','⟦clock⟧','Plus de 10 heures','']]}
];

/* ------------------------------------------------------------------ règles de conseil */
var PAR_OBJ={
 ifas:['selection_ifas_ifap','hygiene_infections','communication_epuisement'],
 enfant:['developpement_enfant','securite_enfant','alimentation_enfant'],
 quotidien:['toilette','nutrition_agee','aide_medicaments'],
 prevention:['gestes_postures','prevention_chutes','entretien_domicile'],
 grandage:['alzheimer','troubles_comportement','fin_de_vie'],
 handicap:['handicap_domicile','handicap_enfant','communication_epuisement'],
 securite:['urgence_alerte','sante_mentale','bientraitance'],
 durer:['communication_epuisement','proches_aidants','bientraitance']};
function n(r){return Number(r.exp||0);}
function diplomes(r){
 var d=r.diplome,s=r.situation;
 if(d==='aepe')return ['cap_aepe','developpement_enfant'];
 if(d==='advf')return ['tp_advf','toilette'];
 if(d==='asms')return ['tp_asms','hygiene_infections'];
 if(d==='aaga')return ['cap_aagga','alzheimer'];
 if(d==='assp')return n(r)>=3?['bts_sp3s','bts_esf','bac_assp']:['bac_assp','bts_sp3s','bts_esf'];
 if(d==='rpms')return ['tp_rpms','creer_sap'];
 if(d==='vae')return s==='enfance'?['vae_deap','vae_deaes']:['vae_deaes','vae_deas','vae_deap'];
 if(s==='enfance')return ['cap_aepe','tp_advf'];
 if(s==='etab')return ['tp_asms','tp_advf'];
 return ['tp_advf','cap_aepe','tp_asms'];
}
function conseil(r){
 var l=r.objectif==='diplome'?diplomes(r):(PAR_OBJ[r.objectif]||[]).slice(),s=r.situation;
 if(r.objectif==='enfant'&&s==='domicile')l=['garde_domicile','securite_enfant','developpement_enfant'];
 if(r.objectif==='handicap'&&s==='enfance')l=['handicap_enfant','developpement_enfant','montessori_enfant'];
 if(r.objectif==='grandage'&&s==='etab')l=['travailler_ehpad','alzheimer','troubles_comportement'];
 if(r.objectif==='quotidien'&&s==='etab')l=['travailler_ehpad','hygiene_infections','nutrition_agee'];
 if(s==='aidant'&&r.objectif!=='diplome'&&l.indexOf('proches_aidants')<0)l=['proches_aidants'].concat(l);
 if(s==='createur'&&r.objectif!=='diplome')l=['creer_sap'].concat(l);
 if((s==='reconv'||s==='emploi')&&n(r)===0&&r.objectif!=='diplome'&&r.objectif!=='ifas'&&l.indexOf('tp_advf')<0)l.splice(1,0,'tp_advf');
 var vus={},out=[];l.forEach(function(id){if(!vus[id]&&C()[id]){vus[id]=1;out.push(id);}});
 return out.slice(0,3);
}
function heures(id){var e=(window.SW_ENRICHI||{})[id];return e&&e.heures?Number(e.heures):0;}
function duree(id,r){var h=heures(id),t=Number(r.temps||7);if(!h)return '';var sem=Math.max(1,Math.round(h/t));return sem<9?'environ '+sem+' semaine'+(sem>1?'s':''):'environ '+Math.max(2,Math.round(sem/4.3))+' mois';}
var RAISON={
 selection_ifas_ifap:'Pour préparer un dossier et un entretien de sélection solides.',
 developpement_enfant:'Pour comprendre chaque étape du développement et y répondre au quotidien.',
 securite_enfant:'Les gestes de prévention qui protègent un jeune enfant, et l’alerte.',
 alimentation_enfant:'Pour des repas sûrs et adaptés à chaque âge, selon les repères officiels.',
 montessori_enfant:'Pour aider l’enfant à faire seul, avec un environnement pensé pour lui.',
 handicap_enfant:'Pour accueillir chaque enfant et orienter sa famille vers les bons interlocuteurs.',
 garde_domicile:'Pour exercer la garde à domicile avec méthode et en confiance avec les parents.',
 protection_enfance:'Pour savoir repérer, écouter et alerter quand un enfant est en danger.',
 toilette:'Pour une aide à la toilette respectueuse, sûre et attentive aux signes à transmettre.',
 nutrition_agee:'Pour repérer la dénutrition et garder le plaisir de manger.',
 entretien_domicile:'Pour entretenir le logement efficacement, sans danger pour vous ni pour la personne.',
 aide_medicaments:'Pour savoir exactement ce que vous pouvez faire, et ce qui revient à l’infirmier.',
 prevention_chutes:'Pour réduire les risques de chute et réagir correctement après une chute.',
 gestes_postures:'Pour mobiliser une personne sans vous blesser et en préservant son autonomie.',
 alzheimer:'Pour communiquer et organiser le quotidien avec une personne atteinte de la maladie.',
 montessori_agee:'Pour proposer des activités qui ont du sens et redonnent un rôle à la personne.',
 fin_de_vie:'Pour accompagner la fin de vie avec justesse, en connaissant les droits de la personne.',
 bientraitance:'Pour des pratiques bientraitantes et savoir signaler une maltraitance.',
 troubles_comportement:'Pour désamorcer l’agitation et respecter un refus de soins.',
 handicap_domicile:'Pour accompagner un adulte en situation de handicap en respectant ses choix.',
 hygiene_infections:'Pour appliquer les précautions standard partout où vous intervenez.',
 travailler_ehpad:'Pour trouver votre place dans l’équipe et le fonctionnement d’un EHPAD.',
 urgence_alerte:'Pour reconnaître une urgence et passer une alerte claire au bon numéro.',
 sante_mentale:'Pour repérer une souffrance psychique et orienter vers la bonne aide.',
 proches_aidants:'Pour connaître vos droits d’aidant et trouver du répit.',
 communication_epuisement:'Pour mieux communiquer et durer dans un métier exigeant.',
 creer_sap:'Pour lancer votre activité de services à la personne en règle.'};
function pourquoi(id,r){
 if(id==='cap_aepe')return ['Le diplôme d’État de référence pour travailler avec les enfants de moins de six ans.'];
 if(id==='tp_advf')return ['Le titre professionnel de référence pour aider des personnes et des familles à leur domicile.'];
 if(id==='tp_asms')return ['Un titre professionnel pour travailler en établissement médico-social, auprès des résidents.'];
 if(id==='cap_aagga')return ['Le CAP pour accompagner les personnes âgées au quotidien en établissement.'];
 if(id==='bac_assp')return ['Le bac pro du soin et de l’accompagnement, à domicile comme en structure.'];
 if(id==='bts_esf')return ['Le BTS du conseil en vie quotidienne : budget, logement, alimentation.'];
 if(id==='bts_sp3s')return ['Le BTS pour coordonner des services et des parcours dans le sanitaire et le social.'];
 if(id==='tp_rpms')return ['Un titre de niveau 5 pour diriger une petite structure et son équipe.'];
 if(/^vae_/.test(id))return ['Pour faire reconnaître votre expérience par un diplôme d’État, en préparant le dossier et l’entretien avec le jury.'];
 var x=[RAISON[id]||'Une formation courte et pratique, à suivre en ligne à votre rythme.'];
 if(n(r)===0&&/^(toilette|developpement_enfant|travailler_ehpad|gestes_postures)$/.test(id))x.push('Un bon point de départ si vous débutez.');
 if(r.situation==='aidant'&&/alzheimer|proches_aidants|prevention_chutes/.test(id))x.push('Pensée aussi pour les proches aidants.');
 return x;
}
function acces(id,r){
 if(!D()[id])return '';
 if(/^vae_/.test(id))return 'Le diplôme s’obtient ici par la VAE : demande sur France VAE, recevabilité, dossier puis entretien avec un jury. Votre expérience doit être en rapport direct avec le diplôme ; nous vous préparons au dossier et à l’entretien, nous ne délivrons pas le diplôme.';
 if(/^tp_/.test(id))return 'Le titre se passe lors d’une session de validation dans un centre agréé par l’État (ou par la VAE), avec un dossier professionnel et des périodes en entreprise à justifier. Nous vérifions votre situation avec vous.';
 return 'Examen en candidat libre, inscription auprès du rectorat ; périodes en milieu professionnel à justifier selon votre situation.';
}
function financement(id,r){
 if(D()[id])return 'Préparation : financement personnel ou par votre employeur. Le CPF et l’alternance ne sont pas possibles avec l’école pour l’instant (certification Qualiopi en cours). Le prix est affiché sur la fiche.';
 return 'Formation courte non certifiante : financement personnel ou par votre employeur. Le prix est affiché sur la fiche de la formation.';
}
