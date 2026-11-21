// Application Madiba Club — version 10 (rapide sur les vieux téléphones et les réseaux lents).
// Firebase est livré dans vendor/ en version allégée : seules les fonctions utilisées sont incluses.
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocFromCache, getDocsFromCache, setDoc, serverTimestamp, deleteField, terminate, clearIndexedDbPersistence,
  collection, getDocs, query, where, orderBy, limit, addDoc, deleteDoc, updateDoc, writeBatch
} from "./vendor/firebase.js";
import { firebaseConfig } from "./firebase-config.js";

// Les clubs du réseau. Pour en ajouter un : une ligne ici (et son nom dans i18n.js).
const CLUBS = [
  { id: "bruxelles", nom: "Madiba Bruxelles", classe: "c-noir", pays: "be" },
  { id: "manchester", nom: "Madiba Manchester", classe: "c-or", pays: "uk" }
];
const RESEAU = { id: "reseau", nom: "Madiba", classe: "c-reseau" };
// Les pôles (équipes). Pour en ajouter un : un nom de plus ici.
const POLES = ["Board", "Team Event", "Team Communication", "Team Network", "Team Relations publiques", "Team RH", "Next Africa Connect", "Madiba Business Lab"];
const LANGUES = ["fr", "en", "nl"];
const LOCALES = { fr: "fr-BE", en: "en-GB", nl: "nl-BE" };
const PARTENAIRES = ["BE Solvay", "Bloomfield Investment", "BNP Paribas Fortis", "Brussels Africa Hub", "Enabel", "Incofin", "Thione Niang"];

const fb = initializeApp(firebaseConfig);
// Connexion gardée sur l'appareil ; la fenêtre Google n'est chargée que si l'on s'en sert.
const auth = initializeAuth(fb, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
// Copie locale de la base : ce qui a déjà été vu s'affiche tout de suite, même hors connexion.
let db;
try { db = initializeFirestore(fb, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db = getFirestore(fb); }

function langueInitiale() {
  try { const s = localStorage.getItem("madiba-langue"); if (LANGUES.includes(s)) return s; } catch (e) { /* stockage indisponible */ }
  const n = (navigator.language || "fr").slice(0, 2).toLowerCase();
  return LANGUES.includes(n) ? n : "fr";
}
// Seule la langue choisie est téléchargée (un fichier par langue).
const T = {};
const chargerLangue = async (l) => { if (!T[l]) T[l] = (await import(`./i18n-${l}.js`)).default; return T[l]; };
const dico = () => T[etat.langue] || {};

const aujourdhui = new Date();
const etat = {
  langue: langueInitiale(),
  pret: false, user: null, profil: null, erreurProfil: "", inscription: null, installer: null,
  events: null, news: null, journaux: null, pagesJournal: {}, modeJournal: "pages", erreurContenus: "", membres: null, fiches: null, codes: null, importApercu: null,
  filtreStatut: "avenir", filtreClub: "tous",
  mois: { a: aujourdhui.getFullYear(), m: aujourdhui.getMonth() },
  adminOnglet: "publier", typePublication: "event", info: null,
  edition: null, pubValeurs: null, pubPhotos: [], pubPhotosModif: false, pubImageModif: false,
  sondages: null, documents: null, opportunites: null, votes: {}, voteEdition: null, idees: null, ideeEnvoyee: false,
  filtreMessages: "tous", oppForm: null, filtreOpp: "tous", docsPrets: {}, historique: null, stats: null,
  boards: null, boardForm: null, filtreBoard: "",
  messages: null, reponses: {}, filtreAnniv: "tous", configPublique: null, infoNotif: null, fondateurs: null, fondBrouillon: null, contactEnvoye: "", contactCellule: "", typeCompte: "membre", brouillon: null, rechAnnuaire: "", filtreAnnuaire: "tous"
};
const racine = document.getElementById("app");

/* ---------- Outils ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function t(cle, vars) {
  let s = dico()[cle] ?? cle;
  if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
  return s;
}
const te = (cle, vars) => esc(t(cle, vars)); // texte traduit, prêt à être inséré dans la page
const club = (id) => CLUBS.find((c) => c.id === id) || (id === "reseau" ? RESEAU : null);
const nomClub = (id) => (club(id) ? (id === "reseau" ? t("club.reseau") : club(id).nom) : t("club.aucun"));
const nomCourt = (id) => t("club." + id);
const role = () => (etat.profil ? etat.profil.role : "");
const ROLES_MEMBRES = ["member", "admin", "superadmin"];
const estMembre = () => ROLES_MEMBRES.includes(role());
const estAdmin = () => ["admin", "superadmin"].includes(role());
const estSuper = () => role() === "superadmin";
const morceaux = () => (location.hash.replace(/^#\/?/, "") || "accueil").split("?")[0].split("/");
const route = () => morceaux()[0];
const param = () => morceaux()[1] || "";
// "garderInfo" conserve le message à afficher pendant le changement de page.
const aller = (r) => { if (route() === r) afficher(); else { etat.garderInfo = true; location.hash = "#/" + r; } };
const p2 = (n) => String(n).padStart(2, "0");
const jourISO = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const maintenantISO = () => { const d = new Date(); return `${jourISO(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fmt = (options, date) => new Intl.DateTimeFormat(LOCALES[etat.langue], options).format(date);
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const ICO = {
  accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  evenements: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h5"/>',
  calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>',
  plus: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  fleche: '<path d="M9 6l6 6-6 6"/>',
  gauche: '<path d="M15 6l-6 6 6 6"/>',
  lieu: '<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
};
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;

function texteErreur(e) {
  const code = (e && e.code) || "";
  const cle = "err." + code;
  if (dico()[cle]) return t(cle);
  return t("err.inconnue", { code: code || (e && e.message) || "?" });
}

/* ---------- Dates des événements ----------
   Enregistrées en texte, à l'heure du lieu : "2026-11-19" ou "2026-11-19T18:30". */
const debutComplet = (e) => (e.debut.length === 10 ? e.debut + "T00:00" : e.debut);
const finComplete = (e) => {
  if (!e.fin) return e.debut.slice(0, 10) + "T23:59";
  return e.fin.length === 10 ? e.fin + "T23:59" : e.fin;
};
function statut(e) {
  const n = maintenantISO();
  if (n < debutComplet(e)) return "avenir";
  return n <= finComplete(e) ? "encours" : "passes";
}
const dateDe = (iso) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const heureDe = (iso) => { const h = iso.length > 10 ? iso.slice(11, 16) : ""; return etat.langue === "fr" ? h.replace(":", "h") : h; };
function texteDate(e) {
  const jourFin = e.fin ? e.fin.slice(0, 10) : "";
  if (jourFin && jourFin !== e.debut.slice(0, 10)) {
    return t("date.duAu", {
      a: fmt({ day: "numeric", month: "short" }, dateDe(e.debut)),
      b: fmt({ day: "numeric", month: "short", year: "numeric" }, dateDe(e.fin))
    });
  }
  let s = fmt({ day: "numeric", month: "long", year: "numeric" }, dateDe(e.debut));
  if (heureDe(e.debut)) s += " · " + heureDe(e.debut);
  if (e.fin && e.fin.length > 10) s += " – " + heureDe(e.fin);
  return s;
}
function texteDatePublication(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : fmt({ day: "numeric", month: "short", year: "numeric" }, d);
}
function trier(liste, st) {
  const l = liste.filter((e) => statut(e) === st);
  l.sort((x, y) => debutComplet(x).localeCompare(debutComplet(y)));
  return st === "passes" ? l.reverse() : l;
}

/* ---------- Comptes ---------- */
// Vérifie le code du club. Le code n'est jamais lu par l'application : c'est la base de
// données qui accepte ou refuse l'enregistrement de l'adhésion.
async function validerCode(uid, clubId, code) {
  const ref = doc(db, "adhesions", uid);
  try {
    const deja = await getDoc(ref);
    if (deja.exists()) return deja.data().clubId === clubId;
  } catch (e) { /* pas encore d'adhésion */ }
  try {
    await setDoc(ref, { clubId, code, createdAt: serverTimestamp() });
    return true;
  } catch (e) {
    if (e && e.code === "permission-denied") return false;
    throw e;
  }
}

async function creerProfil(user, d) {
  let r = "pending", clubId = "";
  if (d.type === "membre") {
    if (await validerCode(user.uid, d.clubId, d.code)) { r = "member"; clubId = d.clubId; }
    else etat.info = { type: "erreur", texte: t("code.refuse") };
  }
  const profil = { prenom: d.prenom, nom: d.nom, email: user.email || "", clubId, role: r };
  await setDoc(doc(db, "users", user.uid), { ...profil, createdAt: serverTimestamp() });
  return profil;
}

/* ---------- Démarrage rapide ----------
   On affiche tout de suite : la dernière session connue (gardée sur l'appareil), puis la copie
   locale des données, puis ce que renvoie le serveur. L'écran ne reste jamais blanc. */
const SESSION = "madiba-session";
function lireSession() {
  try { const s = JSON.parse(localStorage.getItem(SESSION) || "null"); return s && s.uid && s.profil ? s : null; } catch (e) { return null; }
}
function garderSession() {
  try {
    if (etat.user && etat.profil) localStorage.setItem(SESSION, JSON.stringify({ uid: etat.user.uid, email: etat.user.email || "", profil: etat.profil }));
    else localStorage.removeItem(SESSION);
  } catch (e) { /* stockage indisponible ou plein */ }
}
// Ne pas lancer deux fois la même demande au serveur : la seconde attend la première.
const enCours = new Map();
function uneFois(cle, f) {
  if (!enCours.has(cle)) enCours.set(cle, Promise.resolve().then(f).finally(() => enCours.delete(cle)));
  return enCours.get(cle);
}
// Plusieurs réponses qui arrivent en même temps ne redessinent l'écran qu'une fois.
let affichagePrevu = false;
function rafraichir() {
  if (affichagePrevu) return;
  affichagePrevu = true;
  requestAnimationFrame(() => { affichagePrevu = false; afficher(false); });
}
// Lecture en deux temps : la copie locale (immédiate), puis le serveur.
// La copie locale n'est utilisée que si ces données ont déjà été chargées une fois sur cet appareil.
// Si elles ont été vérifiées auprès du serveur il y a peu, on ne lui redemande pas la même chose.
const FRAICHEUR = { users: 15, fiches: 15, boards: 60, fondateurs: 60, config: 60 }; // minutes ; 2 pour le reste
const cleVu = (nom) => "madiba-vu:" + ((etat.user && etat.user.uid) || "visiteur") + ":" + nom;
const vuLe = (nom) => Number(lireLocal(cleVu(nom))) || 0;
const encoreFrais = (nom) => Date.now() - vuLe(nom) < (FRAICHEUR[nom] || 2) * 60000;
let forcerServeur = false;
async function lireDeuxFois(nom, requetesDe, appliquer) {
  const qs = requetesDe();
  if (vuLe(nom)) {
    try {
      const r = await Promise.all(qs.map((q) => getDocsFromCache(q)));
      appliquer(fusionner(r.map((x) => ({ status: "fulfilled", value: x }))), true);
      if (!forcerServeur && encoreFrais(nom)) return;
    } catch (e) { /* pas de copie locale */ }
  }
  const res = await Promise.allSettled(qs.map((q) => getDocs(q)));
  if (res[0].status === "rejected") throw res[0].reason;
  appliquer(fusionner(res), false);
  ecrireLocal(cleVu(nom), String(Date.now()));
}
function fusionner(res) {
  const parId = {};
  res.forEach((x) => { if (x.status === "fulfilled") x.value.docs.forEach((d) => { parId[d.id] = { id: d.id, ...d.data() }; }); });
  return Object.values(parId);
}
async function lireDocDeuxFois(nom, ref, appliquer) {
  if (vuLe(nom)) {
    try {
      const c = await getDocFromCache(ref); appliquer(c.exists() ? c.data() : {}, true);
      if (!forcerServeur && encoreFrais(nom)) return;
    } catch (e) { /* pas de copie locale */ }
  }
  const s = await getDoc(ref);
  appliquer(s.exists() ? s.data() : {}, false);
  ecrireLocal(cleVu(nom), String(Date.now()));
}

async function chargerProfil(user) {
  const ref = doc(db, "users", user.uid);
  let snap = null;
  try { snap = await getDoc(ref); }
  catch (e) {
    // Hors connexion : on se contente de la copie locale.
    try { snap = await getDocFromCache(ref); } catch (e2) { throw e; }
  }
  if (snap.exists()) return snap.data();
  if (!etat.inscription) return null;
  const profil = await creerProfil(user, etat.inscription);
  etat.inscription = null;
  return profil;
}

function viderEtat() {
  etat.profil = null; etat.erreurProfil = ""; etat.membres = null; etat.fiches = null; etat.codes = null; etat.brouillon = null; etat.importApercu = null; etat.pagesJournal = {}; etat.messages = null; etat.reponses = {};
  etat.votes = {}; etat.sondages = null; etat.documents = null; etat.opportunites = null; etat.idees = null; etat.historique = null; etat.stats = null; etat.docsPrets = {};
  etat.events = null; etat.news = null; etat.journaux = null;
  reinitialiserPublication();
}
const signature = (p) => (p ? [p.role, p.clubId, p.pole].join("|") : "");

// Première visite : les polices sont demandées une fois l'essentiel affiché.
function chargerPolices() {
  if (document.querySelector('link[href="polices.css"]')) return;
  const f = document.createElement("link");
  f.rel = "stylesheet"; f.href = "polices.css";
  f.onload = () => { (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => ecrireLocal("madiba-polices", "1")); };
  document.head.appendChild(f);
}
let contenusLances = false, authConnue = false;
function demarrer() {
  // 1) Dès le lancement : dernière session connue et copie locale.
  const sessionGardee = lireSession();
  if (sessionGardee) { etat.user = { uid: sessionGardee.uid, email: sessionGardee.email, provisoire: true }; etat.profil = sessionGardee.profil; }
  etat.pret = true;
  afficher(false);
  // Sans session connue, on attend de savoir qui est là (quelques dixièmes de seconde) pour ne pas tout demander deux fois.
  if (sessionGardee) { contenusLances = true; chargerContenus(); }
  else setTimeout(() => { if (!contenusLances) { contenusLances = true; chargerContenus(); } }, 2500);
  // 2) Firebase confirme qui est connecté : on ne recharge que si quelque chose a changé.
  onAuthStateChanged(auth, quandConnexion);
}
let fermeture = false;
async function quandConnexion(user) {
  if (fermeture) return;
  const premier = !authConnue;
  authConnue = true;
  const meme = (user ? user.uid : "") === (etat.user ? etat.user.uid : "");
  const avant = signature(etat.profil);
  etat.user = user;
  if (!meme) viderEtat();
  if (user) {
    try { etat.profil = await chargerProfil(user); etat.erreurProfil = ""; }
    catch (e) { if (!meme) etat.erreurProfil = texteErreur(e); }
  }
  garderSession();
  // Rôle, club ou pôle différents : les réponses et votes déjà lus ne sont plus les bons.
  if (signature(etat.profil) !== avant) { etat.reponses = {}; etat.votes = {}; }
  if (user && ["connexion", "inscription"].includes(route())) aller("accueil"); else rafraichir();
  if (premier && !contenusLances) { contenusLances = true; chargerContenus(); }
  else if (!meme || signature(etat.profil) !== avant) chargerContenus(signature(etat.profil) !== avant);
  setTimeout(majJeton, 4000); // les notifications attendent que l'essentiel soit affiché
}

// Ouvert depuis une notification : l'élément est peut-être plus récent que la copie locale.
const nouveautesDemandees = new Set();
function demanderNouveaute(cle) {
  if (nouveautesDemandees.has(cle)) return enCours.has("contenus");
  nouveautesDemandees.add(cle);
  chargerContenus(true);
  return true;
}

/* ---------- Données ---------- */
// Chacun ne demande que ce qu'il a le droit de voir : la base refuse le reste.
function requetes(nom) {
  const ref = collection(db, nom);
  if (estSuper()) return [ref];
  const r = [query(ref, where("visibility", "==", "public"))];
  if (!estMembre()) return r;
  r.push(query(ref, where("visibility", "==", "members")));
  const p = etat.profil;
  if (!p.clubId) return r;
  r.push(query(ref, where("visibility", "==", "club"), where("clubId", "==", p.clubId)));
  if (["events", "sondages", "documents"].includes(nom)) {
    if (role() === "admin") r.push(query(ref, where("visibility", "==", "pole"), where("clubId", "==", p.clubId)));
    else if (p.pole) r.push(query(ref, where("visibility", "==", "pole"), where("clubId", "==", p.clubId), where("pole", "==", p.pole)));
  }
  return r;
}
// Tout est demandé en même temps (et non plus l'un après l'autre) ; chaque partie s'affiche dès qu'elle arrive.
let relancerContenus = false;
// forcer : on redemande tout au serveur (droits changés, données transformées, élément introuvable).
function chargerContenus(forcer) {
  if (forcer) forcerServeur = true;
  if (enCours.has("contenus")) { relancerContenus = true; return enCours.get("contenus"); }
  return uneFois("contenus", async () => {
    const membre = estMembre();
    const tache = (f) => f().catch(() => {}).finally(rafraichir);
    const lots = [
      lireDeuxFois("events", () => requetes("events"), (l) => { etat.events = l.filter((e) => typeof e.debut === "string" && e.debut.length >= 10); etat.erreurContenus = ""; rafraichir(); })
        .catch((e) => { etat.events = etat.events || []; etat.erreurContenus = texteErreur(e); }),
      lireDeuxFois("news", () => requetes("news"), (l) => { etat.news = l.sort((x, y) => String(y.publieLe || "").localeCompare(String(x.publieLe || ""))); rafraichir(); })
        .catch(() => { etat.news = etat.news || []; }),
      lireDeuxFois("journaux", () => requetes("journaux"), (l) => { etat.journaux = l; rafraichir(); }).catch(() => { etat.journaux = etat.journaux || []; }),
      tache(() => lireDeuxFois("boards", () => [collection(db, "boards")], (l) => { etat.boards = l; })),
      tache(() => lireDocDeuxFois("fondateurs", doc(db, "public", "fondateurs"), (d) => { etat.fondateurs = d; })),
      tache(() => lireDocDeuxFois("config", doc(db, "public", "config"), (d) => { etat.configPublique = d; }))
    ];
    if (membre) {
      lots.push(
        lireDeuxFois("sondages", () => requetes("sondages"), (l) => { etat.sondages = l.sort((a, b) => msTemps(b.createdAt) - msTemps(a.createdAt)); rafraichir(); }).catch(() => { etat.sondages = etat.sondages || []; }),
        lireDeuxFois("documents", () => requetes("documents"), (l) => { etat.documents = l; rafraichir(); }).catch(() => { etat.documents = etat.documents || []; }),
        lireDeuxFois("opportunites", () => [collection(db, "opportunites")], (l) => { etat.opportunites = l; rafraichir(); }).catch(() => { etat.opportunites = etat.opportunites || []; })
      );
    } else { etat.sondages = []; etat.documents = []; etat.opportunites = []; }
    await Promise.all(lots);
    chargerPolices();
    if (etat.boards === null) etat.boards = [];
    if (etat.fondateurs === null) etat.fondateurs = {};
    if (etat.configPublique === null) etat.configPublique = {};
    rafraichir();
  }).finally(() => { if (relancerContenus) { relancerContenus = false; chargerContenus(); } else forcerServeur = false; });
}
function chargerMembres() {
  return uneFois("membres", async () => {
    // L'annuaire déjà vu s'affiche aussitôt depuis l'appareil, puis se met à jour.
    const membres = {}, fiches = {};
    const pret = () => { if (membres.l && fiches.l) { etat.membres = membres.l; etat.fiches = fiches.l; rafraichir(); } };
    try {
      await Promise.all([
        lireDeuxFois("users", () => [collection(db, "users")], (l) => { membres.l = l.map(({ id, ...u }) => ({ uid: id, ...u })); pret(); }),
        lireDeuxFois("fiches", () => [collection(db, "fiches")], (l) => { fiches.l = l; pret(); })
      ]);
    } catch (e) { etat.membres = etat.membres || []; etat.fiches = etat.fiches || []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
    rafraichir();
  });
}
// L'annuaire n'est pas nécessaire pour afficher l'accueil : on le charge une fois l'essentiel arrivé.
function chargerMembresPlusTard() {
  if (enCours.has("membres") || enCours.has("membres-plus-tard")) return;
  uneFois("membres-plus-tard", async () => {
    try { await enCours.get("contenus"); } catch (e) { /* peu importe */ }
    await new Promise((ok) => setTimeout(ok, 300));
    if (etat.membres === null) await chargerMembres();
  });
}
function chargerCodes() {
  return uneFois("codes", async () => {
    try {
      const snap = await getDoc(doc(db, "config", "codes"));
      etat.codes = snap.exists() ? snap.data() : {};
    } catch (e) { etat.codes = {}; etat.info = { type: "erreur", texte: texteErreur(e) }; }
    rafraichir();
  });
}

/* ---------- Éléments communs ---------- */
const pastilleClub = (id) => (club(id) ? `<span class="pastille ${club(id).classe}">${esc(nomCourt(id))}</span>` : "");
function pastilleVis(x) {
  if (x.visibility === "public") return `<span class="pastille contour">${te("vis.public")}</span>`;
  if (x.visibility === "club") return `<span class="pastille sombre">${te("vis.club")}</span>`;
  if (x.visibility === "pole") return `<span class="pastille sombre">${esc(x.pole || t("vis.pole"))}</span>`;
  return `<span class="pastille sombre">${te("vis.members")}</span>`;
}
function pastilles(u) {
  const p = [];
  if (u.fondateur) p.push(`<span class="pastille or-plein">${te("badge.fondateur")}</span>`);
  if (u.board) p.push(`<span class="pastille sombre">${te(u.statut === "alumni" ? "badge.boardAlumni" : "badge.board")}</span>`);
  else if (u.statut === "alumni") p.push(`<span class="pastille contour">${te("badge.alumni")}</span>`);
  if (u.statut !== "alumni" && !u.board && ROLES_MEMBRES.includes(u.role)) p.push(`<span class="pastille">${te("badge.actif")}</span>`);
  return p.join(" ");
}
// Squelette : la forme de la page apparaît tout de suite, le contenu vient se poser dedans.
const carteVide = () => `<div class="sq-carte" aria-hidden="true"><div class="sq sq-image"></div><div class="sq sq-ligne court"></div><div class="sq sq-ligne"></div><div class="sq sq-ligne moyen"></div></div>`;
const chargement = (n = 2) => `<div class="squelette"><p class="cache" role="status">${te("chargement")}</p>${carteVide().repeat(n)}</div>`;
const ligneVide = () => `<span class="sq sq-ligne court" aria-hidden="true"></span>`;
const erreurContenus = () => (etat.erreurContenus ? `<div class="message erreur" role="alert">${esc(etat.erreurContenus)}</div>` : "");
const blocInfo = () => (etat.info ? `<div class="message ${etat.info.type}" role="alert">${esc(etat.info.texte)}</div>` : "");

/* ---------- Photos livrées avec l'application ----------
   En WebP (léger), en deux tailles selon l'écran, avec le JPEG d'origine pour les très vieux navigateurs. */
const TAILLES = { groupe: [800, 1200], maroc: [600, 900], histoire: [500, 699], "board-2024": [600, 1000], "board-2025": [600, 1000], "board-2026": [600, 1000] };
function photoStatique(src, alt, cls = "", prioritaire = false) {
  const m = /^images\/([\w-]+)\.jpg$/.exec(src || "");
  const img = `<img class="${cls}" src="${esc(src)}" alt="${alt}" ${prioritaire ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  if (!m || !TAILLES[m[1]]) return img;
  return `<picture><source type="image/webp" sizes="(min-width: 760px) 720px, 100vw" srcset="${TAILLES[m[1]].map((w) => `images/${m[1]}-${w}.webp ${w}w`).join(", ")}">${img}</picture>`;
}

/* ---------- Accueil ---------- */
function pageAccueil() {
  const p = etat.profil;
  let actions, sous;
  if (!etat.user) {
    sous = te("acc.sous");
    actions = `<a class="btn or" href="#/inscription">${te("creerCompte")}</a><a class="btn contour-clair" href="#/evenements">${te("acc.voirEvents")}</a>
      <a class="btn contour-clair" href="#/contact/candidature">${te("contact.type.candidature")}</a><a class="btn contour-clair" href="#/contact/partenaire">${te("contact.type.partenaire")}</a>`;
  } else if (p) {
    sous = esc(t("acc.bonjour", { prenom: p.prenom })) + (p.clubId ? " · " + esc(nomClub(p.clubId)) : "");
    actions = (estAdmin() ? `<a class="btn or" href="#/admin">${te("admin.titre")}</a>` : "")
      + (estMembre() ? `<a class="btn contour-clair" href="#/annuaire">${te("annuaire.titre")}</a>` : `<a class="btn contour-clair" href="#/evenements">${te("acc.voirEvents")}</a>`);
  } else { sous = te("acc.sous"); actions = ""; }

  let haut = `<section class="hero-photo">
      ${photoStatique("images/groupe.jpg", te("acc.altGroupe"), "", true)}
      <div class="texte">
        <h1>${te("acc.titre1")}<br><span>${te("acc.titre2")}</span></h1>
        <p>${sous}</p>
        ${actions ? `<div class="actions">${actions}</div>` : ""}
      </div>
    </section>`;
  if (etat.user && etat.erreurProfil) haut += `<div class="message erreur" role="alert">${esc(etat.erreurProfil)}</div>`;
  if (etat.user && !p && !etat.erreurProfil) haut += pageProfilInitial();
  haut += blocInfo() + blocAnnivAccueil() + blocSondagesAccueil();
  if (p && p.role === "pending") {
    haut += `<section class="carte"><h2>${te("acc.publicTitre")}</h2><p>${te("acc.publicTexte")}</p>
      <a class="btn contour" href="#/compte">${te("code.jai")}</a></section>`;
  }
  if (p && estMembre() && !p.anneeEntree) {
    haut += `<section class="carte"><h2>${te("acc.parcoursTitre")}</h2><p>${te("acc.parcoursTexte")}</p>
      <a class="btn contour" href="#/compte">${te("acc.parcoursBtn")}</a></section>`;
  }

  let contenus = "";
  if (etat.events === null) contenus = chargement();
  else {
    const prochains = trier(etat.events, "encours").concat(trier(etat.events, "avenir")).slice(0, 3);
    contenus += `<div class="titre-section"><h2>${te("acc.prochains")}</h2><a href="#/evenements">${te("toutVoir")}</a></div>`;
    contenus += prochains.length ? prochains.map((e) => carteEvent({ ...e, description: "" })).join("") : `<p class="gris">${te("acc.aucunEvent")}</p>`;
    if (fil().length) {
      contenus += `<div class="titre-section"><h2>${te("acc.dernieres")}</h2><a href="#/news">${te("toutVoir")}</a></div>` + fil().slice(0, 2).map((x) => carteFil(x, true)).join("");
    }
  }

  const salle = (lieu, titre, texte) => `<article class="salle"><p class="surtitre">${te(lieu)}</p><h3>${te(titre)}</h3><p>${te(texte)}</p></article>`;
  const presentation = `
    <section class="bloc">
      <h2>${te("acc.sallesTitre")}</h2>
      ${photoStatique("images/maroc.jpg", te("acc.altMaroc"), "photo")}
      ${salle("acc.s1lieu", "acc.s1titre", "acc.s1texte")}
      ${salle("acc.s2lieu", "acc.s2titre", "acc.s2texte")}
      ${salle("acc.s3lieu", "acc.s3titre", "acc.s3texte")}
      ${salle("acc.s4lieu", "acc.s4titre", "acc.s4texte")}
    </section>
    <section class="bloc">
      ${photoStatique("images/histoire.jpg", te("acc.altHistoire"), "photo haute")}
      <h2>${te("acc.histoireTitre")}</h2>
      <p>${te("acc.histoireTexte")}</p>
    </section>
    <section class="chiffres">
      <div><strong>35+</strong><span>${te("acc.c1")}</span></div>
      <div><strong>10+</strong><span>${te("acc.c2")}</span></div>
      <div><strong>22</strong><span>${te("acc.c3")}</span></div>
      <div><strong>800</strong><span>${te("acc.c4")}</span></div>
    </section>
    <section class="bloc">
      <h2>${te("acc.videoTitre")}</h2>
      <p class="gris">${te("acc.videoTexte")}</p>
      <div class="video" id="video"><button type="button" data-action="video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>${te("acc.videoBouton")}</span></button></div>
    </section>
    <section class="bloc">
      <h2>${te("acc.partenairesTitre")}</h2>
      <p class="partenaires">${PARTENAIRES.map(esc).join(" · ")}</p>
    </section>
    <section class="bloc">
      <h2>${te("acc.suivre")}</h2>
      ${blocReseaux()}
      <a class="btn contour" href="#/board">${te("board.titre")}</a>
    </section>`;
  return haut + erreurContenus() + contenus + presentation + blocNotifications() + blocInstallation();
}

function blocInstallation() {
  const installee = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (installee) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (etat.installer) {
    return `<section class="carte"><h2>${te("inst.titre")}</h2><p class="gris">${te("inst.texte")}</p>
      <button class="btn plein" type="button" data-action="installer">${te("inst.bouton")}</button></section>`;
  }
  if (ios) {
    return `<section class="carte"><h2>${te("inst.iosTitre")}</h2>
      <ol class="etapes"><li>${te("inst.ios1")}</li><li>${te("inst.ios2")}</li><li>${te("inst.ios3")}</li></ol></section>`;
  }
  return `<section class="carte"><h2>${te("inst.titre")}</h2><p class="gris">${te("inst.android")}</p></section>`;
}

/* ---------- Événements, calendrier, news ---------- */
function pageEvenements() {
  const statuts = ["avenir", "encours", "passes"];
  const filtres = ["tous"].concat(CLUBS.map((c) => c.id));
  let liste = chargement();
  if (etat.events !== null) {
    const l = trier(etat.events, etat.filtreStatut).filter((e) => etat.filtreClub === "tous" || e.clubId === etat.filtreClub);
    liste = l.length ? l.map((e) => carteEvent(e)).join("") : `<p class="gris centre">${te("ev.aucun")}</p>`;
  }
  return `<h1>${te("nav.evenements")}</h1>
    <div class="onglets">${statuts.map((v) => `<button type="button" class="${etat.filtreStatut === v ? "actif" : ""}" data-action="statut" data-v="${v}">${te("ev." + v)}</button>`).join("")}</div>
    <div class="puces">${filtres.map((v) => `<button type="button" class="puce ${etat.filtreClub === v ? "actif" : ""}" data-action="club" data-v="${v}">${esc(v === "tous" ? t("tousClubs") : nomCourt(v))}</button>`).join("")}</div>
    ${erreurContenus()}${liste}
    ${estMembre() ? "" : `<p class="petit gris centre">${te("ev.reserve")}</p>`}`;
}

function pageCalendrier() {
  const { a, m } = etat.mois;
  const nbJours = new Date(a, m + 1, 0).getDate();
  const decalage = (new Date(a, m, 1).getDay() + 6) % 7; // lundi en premier
  const prefixe = `${a}-${p2(m + 1)}-`;
  const evs = etat.events || [];
  const duJour = (j) => { const jour = prefixe + p2(j); return evs.filter((e) => e.debut.slice(0, 10) <= jour && finComplete(e).slice(0, 10) >= jour); };
  const ceJour = jourISO(new Date());
  let cases = "";
  for (let i = 0; i < decalage; i++) cases += `<div class="case vide"></div>`;
  for (let j = 1; j <= nbJours; j++) {
    const clubs = [...new Set(duJour(j).map((e) => e.clubId))];
    cases += `<div class="case ${prefixe + p2(j) === ceJour ? "auj" : ""}"><span>${j}</span><span class="points">${clubs.map((c) => `<i class="${(club(c) || RESEAU).classe}"></i>`).join("")}</span></div>`;
  }
  let entetes = "";
  for (let i = 0; i < 7; i++) entetes += `<span>${esc(fmt({ weekday: "narrow" }, new Date(2026, 10, 2 + i)))}</span>`; // 2 nov. 2026 = lundi
  const debutMois = prefixe + "01", finMois = prefixe + p2(nbJours);
  const duMois = evs.filter((e) => e.debut.slice(0, 10) <= finMois && finComplete(e).slice(0, 10) >= debutMois)
    .sort((x, y) => debutComplet(x).localeCompare(debutComplet(y)));
  return `<h1>${te("nav.calendrier")}</h1>
    <section class="carte">
      <div class="mois-nav">
        <button type="button" class="rond" data-action="mois" data-v="-1" aria-label="${te("cal.precedent")}">${ico("gauche")}</button>
        <h2>${esc(majuscule(fmt({ month: "long", year: "numeric" }, new Date(a, m, 1))))}</h2>
        <button type="button" class="rond" data-action="mois" data-v="1" aria-label="${te("cal.suivant")}">${ico("fleche")}</button>
      </div>
      <div class="grille entetes">${entetes}</div>
      <div class="grille">${cases}</div>
      <div class="legende">${CLUBS.map((c) => `<span><i class="${c.classe}"></i>${esc(nomCourt(c.id))}</span>`).join("")}</div>
    </section>
    <p class="petit gris">${te(estMembre() ? "cal.noteMembre" : "cal.notePublic")}</p>
    ${erreurContenus()}
    <h2>${te("cal.ceMois")}</h2>
    ${etat.events === null ? chargement() : duMois.length ? duMois.map((e) => carteEvent({ ...e, description: "" })).join("") : `<p class="gris">${te("cal.aucun")}</p>`}`;
}

function pageNews() {
  let liste = chargement();
  if (etat.news !== null && etat.journaux !== null) liste = fil().length ? fil().map((x) => carteFil(x)).join("") : `<p class="gris centre">${te("news.aucune")}</p>`;
  return `<h1>${te("nav.news")}</h1>${erreurContenus()}${liste}`;
}

/* ---------- Journal du Madiba ---------- */
const imageSure = (p) => (typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : "");
// Le fil des news réunit les news et les journaux, du plus récent au plus ancien.
function fil() {
  const tout = (etat.news || []).map((n) => ({ ...n, genre: "news" })).concat((etat.journaux || []).map((j) => ({ ...j, genre: "journal" })));
  return tout.sort((x, y) => String(y.publieLe || "").localeCompare(String(x.publieLe || "")));
}
const carteFil = (x, court) => (x.genre === "journal" ? carteJournal(x) : carteNews(x, false, court));
const idPage = (j, n) => (j.pagesV ? j.pagesV + "-" : "") + String(n).padStart(3, "0");
function chargerPages(id) {
  return uneFois("pages:" + id, async () => {
    const j = (etat.journaux || []).find((x) => x.id === id) || {};
    try {
      const snap = await getDocs(collection(db, "journaux", id, "pages"));
      etat.pagesJournal[id] = snap.docs.map((d) => d.data()).sort((a, b) => (a.n || 0) - (b.n || 0));
      etat.pagesJournal[id].forEach((p) => { if (imageSure(p.image)) medias.set(`journaux/${id}/pages/${idPage(j, p.n)}`, p.image); });
    } catch (e) { etat.pagesJournal[id] = []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
    rafraichir();
  });
}
function pageJournal() {
  if (etat.journaux === null) return chargement();
  const id = param();
  const j = etat.journaux.find((x) => x.id === id);
  const retour = `<a class="lien-btn" href="#/news">${ico("gauche")} ${te("journal.retour")}</a>`;
  if (!j && demanderNouveaute("j:" + id)) return retour + chargement(1);
  if (!j) return `${retour}<section class="carte"><p>${te("journal.introuvable")}</p></section>`;
  const pages = etat.pagesJournal[id];
  // Mode « pages » : chaque page est téléchargée au moment où l'on y arrive.
  const parPage = etat.modeJournal === "pages" && j.nbPages > 0;
  if (!pages && !parPage) chargerPages(id);
  const sous = [j.numero, j.periode].filter(Boolean).join(" · ");
  let corps = chargement(1);
  if (parPage) {
    corps = `<div class="j-pages">${Array.from({ length: j.nbPages }, (_, k) => imageMedia(`journaux/${id}/pages/${idPage(j, k + 1)}`, "", "page", esc(t("journal.page", { n: k + 1 })))).join("")}</div>`;
  } else if (pages && etat.modeJournal === "pages") {
    corps = `<div class="j-pages">${pages.map((p) => (imageSure(p.image) ? `<img class="page" src="${p.image}" alt="${esc(t("journal.page", { n: p.n }))}" loading="lazy" decoding="async">` : "")).join("")}</div>`;
  } else if (pages) {
    const balise = { h1: "h2", h2: "h3", h3: "h4", p: "p" };
    corps = `<p class="petit gris">${te("journal.introTexte")}</p><div class="j-texte">${pages.map((p) => `
      <p class="surtitre">${esc(t("journal.page", { n: p.n }))}</p>
      ${(Array.isArray(p.blocs) ? p.blocs : []).map((b) => `<${balise[b.t] || "p"} class="j-${balise[b.t] ? b.t : "p"}">${esc(b.x)}</${balise[b.t] || "p"}>`).join("")}`).join("")}</div>`;
  }
  return `${retour}
    <h1>${esc(j.titre)}</h1>
    ${sous ? `<p class="gris">${esc(sous)}</p>` : ""}
    <div class="onglets">${["pages", "texte"].map((m) => `<button type="button" class="${etat.modeJournal === m ? "actif" : ""}" data-action="mode-journal" data-v="${m}">${te("journal." + m)}</button>`).join("")}</div>
    ${blocInfo()}${corps}`;
}

/* ---------- Le board ---------- */
const BOARDS = [
  { annee: "2026-2027", image: "images/board-2026.jpg", membres: [["Ekelle Biyiha", "Présidente"], ["Samuel Fandjo", "VP Opérationnel"], ["Mervédie Kivanda", "VP Interne"], ["Kadiatou Barry", "VP Externe"], ["Cécilia-Grâce Lufiauluisu", "Trésorière"], ["Sophie Diongue", "Directrice RH"]] },
  { annee: "2025-2026", image: "images/board-2025.jpg", membres: [["Christopher Egnankou", "Président"], ["Aurélie Yombo", "VP Opérationnel"], ["Gaetan Aubry", "VP Externe"], ["Jenny Somberg", "VP Interne"], ["Naomi Amedegnato", "Trésorerie"]] },
  { annee: "2024-2025", image: "images/board-2024.jpg", membres: [["Nathan Kwala", "Président"], ["Assiatou Diallo", "VP Opérationnel"], ["David Mbayo", "VP Externe"], ["Sophia Bokoko", "Direction RH"]] }
];
const RESEAUX = [
  ["LinkedIn", "https://www.linkedin.com/company/madiba-club/"],
  ["Instagram", "https://www.instagram.com/madiba_club/"],
  ["YouTube", "https://www.youtube.com/@MadibaClub"]
];
const VIDEO = "4djR1rVj9-E";
const blocReseaux = () => `<div class="rangee">${RESEAUX.map(([nom, url]) => `<a class="btn contour petit-btn" href="${url}" target="_blank" rel="noopener">${nom}</a>`).join("")}</div>`;

/* ---------- Contact : le message part vers la cellule choisie ---------- */
const OBJETS = ["o1", "o2", "o3", "o4", "o5"];
const nomCellule = (id) => t("contact." + ((club(id) || {}).pays || "be"));
// Les plus récents d'abord, et seulement les derniers (la base les trie grâce à un index).
// Si l'index n'a pas encore été créé dans Firebase, on retombe sur l'ancienne demande, sans tri.
async function recents(nom, champ, n) {
  const ref = collection(db, nom);
  const filtre = estSuper() ? [] : [where("clubId", "==", etat.profil.clubId)];
  let snap;
  try { snap = await getDocs(query(ref, ...filtre, orderBy(champ, "desc"), limit(n))); }
  catch (e) {
    if (!e || e.code !== "failed-precondition") throw e;
    snap = await getDocs(filtre.length ? query(ref, ...filtre) : ref);
  }
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => String(y[champ] || "").localeCompare(String(x[champ] || ""))).slice(0, n);
}
function chargerMessages() {
  return uneFois("messages", async () => {
    try { etat.messages = await recents("messages", "creeLe", 200); }
    catch (e) { etat.messages = []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
    rafraichir();
  });
}
/* ---------- Les fondateurs : page publique, remplie par le super-administrateur ---------- */
function pageFondateurs() {
  if (etat.fondateurs === null) return `<h1>${te("fond.titre")}</h1>` + chargement();
  const f = etat.fondateurs;
  const liste = Array.isArray(f.liste) ? f.liste : [];
  const vide = !f.histoire && !liste.length;
  return `<section class="hero-logo"><picture><source type="image/webp" srcset="icons/logo-or.webp"><img src="icons/logo-or.png" alt="Madiba Club" decoding="async"></picture><h1>${te("fond.titre")}</h1>${f.annee ? `<p>${esc(t("fond.depuis", { annee: f.annee }))}</p>` : ""}</section>
    ${vide ? `<section class="carte"><p>${te("fond.vide")}</p></section>` : ""}
    ${f.histoire ? `<h2>${te("fond.histoire")}</h2><p class="description">${esc(f.histoire)}</p>` : ""}
    ${liste.map((x) => {
      const li = lienSur(x.linkedin);
      return `<article class="carte">
        <div class="identite">${avatar({ photo: x.photo, prenom: x.nom, nom: String(x.nom || "").split(" ").slice(-1)[0] })}<div><p><strong>${esc(x.nom)}</strong></p>${x.role ? `<p class="petit gris">${esc(x.role)}</p>` : ""}</div></div>
        ${x.bio ? `<p class="description">${esc(x.bio)}</p>` : ""}
        ${li ? `<p class="petit"><a href="${esc(li)}" target="_blank" rel="noopener">LinkedIn</a></p>` : ""}
      </article>`;
    }).join("")}`;
}
function lireFormFondateurs(form) {
  const v = Object.fromEntries(new FormData(form).entries());
  const g = (k) => String(v[k] || "").trim();
  const liste = [];
  for (let i = 0; ("f_nom_" + i) in v; i++) {
    const li = g("f_linkedin_" + i);
    liste.push({ nom: g("f_nom_" + i), role: g("f_role_" + i), bio: g("f_bio_" + i), linkedin: li && !/^https?:\/\//i.test(li) ? "https://" + li : li, photo: photoSure(g("f_photo_" + i)) });
  }
  return { annee: g("f_annee"), histoire: g("f_histoire"), liste };
}
function adminFondateurs() {
  const f = etat.fondBrouillon || etat.fondateurs || {};
  const liste = Array.isArray(f.liste) ? f.liste : [];
  return `<section class="carte">
    <h2>${te("fond.adminTitre")}</h2><p class="gris petit">${te("fond.adminAide")}</p>
    <form id="form-fondateurs" novalidate>
      <div class="champ"><label for="f_annee">${te("fond.annee")}</label><input id="f_annee" name="f_annee" inputmode="numeric" maxlength="4" value="${esc(f.annee)}"></div>
      <div class="champ"><label for="f_histoire">${te("fond.histoireLabel")}</label><textarea id="f_histoire" name="f_histoire" rows="5" maxlength="3000">${esc(f.histoire)}</textarea></div>
      ${liste.map((x, i) => `<div class="parcours-ligne">
        <div class="identite">${avatar({ photo: x.photo, prenom: x.nom, nom: "" })}
          <div class="champ"><label for="f_fichier_${i}">${te("parcours.photo")}</label><input id="f_fichier_${i}" type="file" accept="image/*" data-change="photo-fondateur" data-i="${i}"></div></div>
        <input type="hidden" name="f_photo_${i}" value="${photoSure(x.photo)}">
        <div class="champ"><label for="f_nom_${i}">${te("fond.nom")}</label><input id="f_nom_${i}" name="f_nom_${i}" maxlength="80" value="${esc(x.nom)}"></div>
        <div class="champ"><label for="f_role_${i}">${te("fond.role")}</label><input id="f_role_${i}" name="f_role_${i}" maxlength="120" value="${esc(x.role)}"></div>
        <div class="champ"><label for="f_bio_${i}">${te("fond.bio")}</label><textarea id="f_bio_${i}" name="f_bio_${i}" rows="3" maxlength="1200">${esc(x.bio)}</textarea></div>
        <div class="champ"><label for="f_linkedin_${i}">${te("parcours.linkedin")}</label><input id="f_linkedin_${i}" name="f_linkedin_${i}" inputmode="url" value="${esc(x.linkedin)}"></div>
        <button class="lien-btn danger" type="button" data-action="fond-suppr" data-v="${i}">${te("fond.retirer")}</button>
      </div>`).join("")}
      <button class="btn contour" type="button" data-action="fond-ajout">${te("fond.ajouter")}</button>
      <button class="btn plein large" type="submit">${te("enregistrer")}</button>
    </form></section>`;
}

/* ---------- Notifications ---------- */
const lireLocal = (cle) => { try { return localStorage.getItem(cle) || ""; } catch (e) { return ""; } };
const ecrireLocal = (cle, v) => { try { if (v) localStorage.setItem(cle, v); else localStorage.removeItem(cle); } catch (e) { /* stockage indisponible */ } };
const cleVapid = () => (etat.configPublique && etat.configPublique.vapidKey) || "";
const notifActives = () => !!lireLocal("madiba-jeton") && typeof Notification !== "undefined" && Notification.permission === "granted";
function clubsNotif() {
  try { const l = JSON.parse(lireLocal("madiba-notif-clubs")); if (Array.isArray(l)) return l.filter((id) => club(id)); } catch (e) { /* pas encore de choix */ }
  return etat.profil && club(etat.profil.clubId) ? [etat.profil.clubId] : CLUBS.map((c) => c.id);
}
const erreurNotif = (code) => Object.assign(new Error(code), { code });
let messagerie = null;
async function chargerMessagerie() {
  if (messagerie) return messagerie;
  const m = await import("./vendor/firebase-messaging.js");
  if (!(await m.isSupported())) throw erreurNotif("notif/non-supporte");
  messagerie = { m, inst: m.getMessaging(fb) };
  return messagerie;
}
const swPret = () => Promise.race([navigator.serviceWorker.ready, new Promise((ok, ko) => setTimeout(() => ko(erreurNotif("notif/non-supporte")), 8000))]);
async function obtenirJeton() {
  const { m, inst } = await chargerMessagerie();
  return m.getToken(inst, { vapidKey: cleVapid(), serviceWorkerRegistration: await swPret() });
}
const enregistrerJeton = (jeton, clubs) => setDoc(doc(db, "jetons", jeton), { uid: etat.user ? etat.user.uid : "", clubs, langue: etat.langue, majLe: new Date().toISOString() });
// À chaque ouverture : on rattache l'appareil au compte connecté (ou on le détache à la déconnexion).
async function majJeton() {
  if (!notifActives() || !cleVapid()) return;
  try {
    const jeton = await obtenirJeton();
    if (!jeton) return;
    ecrireLocal("madiba-jeton", jeton);
    await enregistrerJeton(jeton, clubsNotif());
  } catch (e) { /* on réessaiera à la prochaine ouverture */ }
}
function blocNotifications() {
  const actif = notifActives();
  const choisis = clubsNotif();
  return `<section class="carte">
    <h2>${te("notif.titre")}</h2>
    <p class="gris">${te(actif ? "notif.actives" : "notif.texte")}</p>
    ${etat.infoNotif ? `<div class="message ${etat.infoNotif.type}" role="alert">${esc(etat.infoNotif.texte)}</div>` : ""}
    <fieldset class="choix"><legend>${te("notif.clubs")}</legend>
      ${CLUBS.map((c) => `<label><input type="checkbox" name="notif-club" value="${c.id}"${choisis.includes(c.id) ? " checked" : ""}> ${esc(c.nom)}</label>`).join("")}
    </fieldset>
    <div class="rangee">
      <button class="btn plein" type="button" data-action="notif-activer">${te(actif ? "notif.maj" : "notif.activer")}</button>
      ${actif ? `<button class="btn contour" type="button" data-action="notif-desactiver">${te("notif.desactiver")}</button>` : ""}
    </div>
  </section>`;
}
async function activerNotifications() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const installee = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw erreurNotif(ios && !installee ? "notif/ios" : "notif/non-supporte");
  if (!cleVapid()) throw erreurNotif("notif/pas-pret");
  const clubs = [...document.querySelectorAll('input[name="notif-club"]:checked')].map((x) => x.value);
  if ((await Notification.requestPermission()) !== "granted") throw erreurNotif("notif/refuse");
  const jeton = await obtenirJeton();
  if (!jeton) throw erreurNotif("notif/erreur");
  await enregistrerJeton(jeton, clubs);
  ecrireLocal("madiba-jeton", jeton);
  ecrireLocal("madiba-notif-clubs", JSON.stringify(clubs));
}
async function desactiverNotifications() {
  const jeton = lireLocal("madiba-jeton");
  ecrireLocal("madiba-jeton", ""); ecrireLocal("madiba-notif-clubs", "");
  if (!jeton) return;
  try { await deleteDoc(doc(db, "jetons", jeton)); } catch (e) { /* déjà supprimé */ }
  try { const { m, inst } = await chargerMessagerie(); await m.deleteToken(inst); } catch (e) { /* rien à retirer */ }
}
function adminNotifications() {
  return `<section class="carte">
    <h2>${te("notif.adminTitre")}</h2><p class="gris petit">${te("notif.adminAide")}</p>
    <form id="form-notif" novalidate>
      <div class="champ"><label for="vapidKey">${te("notif.cle")}</label><input id="vapidKey" name="vapidKey" autocomplete="off" value="${esc(cleVapid())}"></div>
      <button class="btn plein large" type="submit">${te("enregistrer")}</button>
    </form></section>`;
}

/* ---------- Anniversaires (membres uniquement) ---------- */
const naissanceOk = (u) => /^\d{4}-\d{2}-\d{2}$/.test(u.naissance || "");
function prochainAnniv(u) {
  const auj = new Date(); auj.setHours(0, 0, 0, 0);
  let d = new Date(auj.getFullYear(), +u.naissance.slice(5, 7) - 1, +u.naissance.slice(8, 10));
  if (d < auj) d = new Date(auj.getFullYear() + 1, +u.naissance.slice(5, 7) - 1, +u.naissance.slice(8, 10));
  return { date: d, jours: Math.round((d - auj) / 86400000) };
}
function annivDuJour() {
  if (!estMembre() || etat.membres === null) return [];
  return personnes().filter(naissanceOk).filter((u) => prochainAnniv(u).jours === 0);
}
function blocAnnivAccueil() {
  if (!estMembre()) return "";
  if (etat.membres === null) { chargerMembresPlusTard(); return ""; }
  const l = annivDuJour();
  if (!l.length) return "";
  return `<a class="carte info anniv-jour" href="#/anniversaires">
      <span class="surtitre">${te("anniv.aujourdhui")}</span>
      <strong>${esc(l.map((u) => `${u.prenom} ${u.nom}`).join(", "))}</strong>
      <span class="petit">${te("anniv.souhaiter")}</span>
    </a>`;
}
function pageAnniversaires() {
  if (!estMembre()) {
    return `<h1>${te("anniv.titre")}</h1><section class="carte"><p>${te("anniv.reserve")}</p>
      <a class="btn contour" href="${etat.user ? "#/compte" : "#/connexion"}">${te(etat.user ? "code.jai" : "seConnecter")}</a></section>`;
  }
  if (etat.membres === null) { chargerMembres(); return `<h1>${te("anniv.titre")}</h1>` + chargement(); }
  const filtre = etat.filtreAnniv;
  const liste = personnes().filter(naissanceOk)
    .filter((u) => filtre === "tous" || u.clubId === filtre)
    .map((u) => ({ ...u, prochain: prochainAnniv(u) }))
    .sort((a, b) => a.prochain.jours - b.prochain.jours);
  const quand = (j) => (j === 0 ? t("anniv.jour0") : j === 1 ? t("anniv.jour1") : j <= 30 ? t("anniv.dans", { n: j }) : "");
  const carte = (u) => `<article class="carte anniv ${u.prochain.jours === 0 ? "info" : ""}">
      <div class="identite">${avatar(u)}<div>
        <p><strong>${esc(u.prenom)} ${esc(u.nom)}</strong></p>
        <p class="petit">${esc(majuscule(fmt({ weekday: "long", day: "numeric", month: "long" }, u.prochain.date)))}${quand(u.prochain.jours) ? ` · <strong>${esc(quand(u.prochain.jours))}</strong>` : ""}</p>
        <p>${pastilleClub(u.clubId)} ${pastilles(u)}</p>
      </div></div>
      ${u.prochain.jours === 0 && u.telephone ? `<a class="btn or petit-btn" href="https://wa.me/${esc(u.telephone.replace(/[^\d]/g, ""))}" target="_blank" rel="noopener">${te("anniv.whatsapp")}</a>` : ""}
    </article>`;
  // Regroupement par mois, en commençant par aujourd'hui.
  let html = "", cle = "";
  liste.forEach((u) => {
    const titre = u.prochain.jours === 0 ? t("anniv.aujourdhui") : majuscule(fmt({ month: "long", year: "numeric" }, u.prochain.date));
    if (titre !== cle) { cle = titre; html += `<h2 class="anniv-mois">${esc(titre)}</h2>`; }
    html += carte(u);
  });
  const filtres = ["tous"].concat(CLUBS.map((c) => c.id));
  return `<h1>${te("anniv.titre")}</h1>
    <p class="gris petit">${te("anniv.intro")}</p>
    <div class="puces">${filtres.map((v) => `<button type="button" class="puce ${filtre === v ? "actif" : ""}" data-action="filtre-anniv" data-v="${v}">${esc(v === "tous" ? t("tousClubs") : nomCourt(v))}</button>`).join("")}</div>
    ${html || `<p class="gris centre">${te("annuaire.aucunAnniv")}</p>`}
    ${etat.profil && !naissanceOk(etat.profil) ? `<p class="petit gris centre">${te("anniv.absent")} <a href="#/compte">${te("compte.titre")}</a></p>` : ""}`;
}

/* ======================================================================
   Version 9 : modifier toutes les publications, détail des événements,
   places et liste d'attente, agenda, comptes rendus, sondages, boîte à idées,
   opportunités, documents, candidatures, suivi, fin d'année, boards, sauvegarde.
   ====================================================================== */

/* ---------- Outils communs ---------- */
const CLUB_TZ = { bruxelles: "Europe/Brussels", manchester: "Europe/London" };
const imageOuChemin = (p) => imageSure(p) || (typeof p === "string" && /^images\/[\w.-]+$/.test(p) ? p : "");
const msTemps = (x) => {
  if (!x) return 0;
  if (typeof x.toMillis === "function") return x.toMillis();
  if (typeof x.seconds === "number") return x.seconds * 1000 + Math.floor((x.nanoseconds || 0) / 1e6);
  const n = Date.parse(x);
  return isNaN(n) ? 0 : n;
};
const estTimestamp = (x) => !!x && typeof x === "object" && typeof x.toMillis === "function";
const jourAujourdhui = () => jourISO(new Date());
const anneeAcademique = () => { const d = new Date(); const a = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${a}-${a + 1}`; };
const urlAppli = () => location.href.split("#")[0];

/* ---------- Images : WebP, miniatures et chargement à la demande ---------- */
// WebP est 25 à 35 % plus léger que JPEG. Les navigateurs qui ne savent pas l'écrire (Safari) gardent JPEG.
const webpOk = (() => { try { const c = document.createElement("canvas"); c.width = c.height = 2; return c.toDataURL("image/webp").startsWith("data:image/webp"); } catch (e) { return false; } })();
function encoder(c, max = 320000, qualite = 0.8) {
  const type = webpOk ? "image/webp" : "image/jpeg";
  let q = qualite, d = c.toDataURL(type, q);
  while (d.length > max && q > 0.4) { q -= 0.08; d = c.toDataURL(type, q); }
  return d;
}
const ouvrirImage = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("image")); i.src = src; });
// Redimensionne (largeur maximale, ou carré rempli) sur un fond blanc.
function dessiner(img, largeurMax, carre) {
  const c = document.createElement("canvas");
  if (carre) {
    const r = Math.max(carre / img.width, carre / img.height), w = img.width * r, h = img.height * r;
    c.width = carre; c.height = carre;
    const x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, carre, carre);
    x.drawImage(img, (carre - w) / 2, (carre - h) / 2, w, h);
    return c;
  }
  const r = Math.min(1, largeurMax / img.width);
  c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
  const x = c.getContext("2d"); x.fillStyle = "#ffffff"; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
async function reduireImage(file, largeurMax = 1200, qualite = 0.8) {
  const url = URL.createObjectURL(file);
  try { return encoder(dessiner(await ouvrirImage(url), largeurMax), 320000, qualite); }
  finally { URL.revokeObjectURL(url); }
}
// Version minuscule (quelques centaines d'octets), affichée floue le temps que la vraie image arrive.
async function miniatureDe(src) {
  try { return encoder(dessiner(await ouvrirImage(src), 32), 3000, 0.5); } catch (e) { return ""; }
}
// Réencode une image déjà enregistrée ; on garde l'ancienne si la nouvelle n'est pas plus légère.
async function reencoder(src, largeurMax, max, qualite, carre) {
  if (!imageSure(src)) return src;
  try {
    const d = encoder(dessiner(await ouvrirImage(src), largeurMax, carre), max, qualite);
    return d.length < src.length ? d : src;
  } catch (e) { return src; }
}
const nouvelId = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62]).join("").slice(0, 20);
const versionImage = () => Date.now().toString(36);

// Les grandes images sont rangées à part et ne sont téléchargées qu'au moment où l'on arrive dessus.
const medias = new Map();
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
function lireMedia(chemin) {
  if (medias.has(chemin)) return Promise.resolve(medias.get(chemin));
  return uneFois("m:" + chemin, async () => {
    const ref = doc(db, ...chemin.split("/"));
    let d = null;
    try { const c = await getDocFromCache(ref); if (c.exists()) d = c.data(); } catch (e) { /* pas encore sur l'appareil */ }
    if (!d) { try { const x = await getDoc(ref); d = x.exists() ? x.data() : {}; } catch (e) { return ""; } }
    const img = imageSure(d.image);
    medias.set(chemin, img);
    return img;
  });
}
// Une image « à la demande » : miniature floue tout de suite, vraie image quand elle approche de l'écran.
function imageMedia(chemin, miniature, cls = "", alt = "") {
  const pret = medias.get(chemin);
  if (pret) return `<img class="${cls}" src="${pret}" alt="${alt}" decoding="async">`;
  const mini = imageSure(miniature);
  return `<img class="${cls} attente${mini ? " flou" : ""}" src="${mini || PIXEL}" data-media="${esc(chemin)}" alt="${alt}" decoding="async">`;
}
// Couverture d'un événement ou d'une news (ancien format : image dans la fiche ; nouveau : à part).
const aCouverture = (x) => !!(imageSure(x.image) || x.imageId);
const cheminCouverture = (col, x) => `${col}/${x.id}/media/${x.imageId}`;
function couverture(col, x, cls = "") {
  if (imageSure(x.image)) return `<img class="${cls}" src="${x.image}" alt="" loading="lazy" decoding="async">`;
  return x.imageId ? imageMedia(cheminCouverture(col, x), x.miniature, cls) : "";
}
let observateur = null;
function poserMedia(img) {
  lireMedia(img.dataset.media).then((src) => {
    if (!src || !img.isConnected) return;
    img.src = src; img.removeAttribute("data-media");
    img.classList.remove("attente", "flou");
  });
}
function brancherMedias() {
  const imgs = racine.querySelectorAll("img[data-media]");
  if (!imgs.length) return;
  if (!("IntersectionObserver" in window)) { imgs.forEach(poserMedia); return; }
  if (observateur) observateur.disconnect();
  else {
    observateur = new IntersectionObserver((entrees) => entrees.forEach((e) => {
      if (e.isIntersecting) { observateur.unobserve(e.target); poserMedia(e.target); }
    }), { rootMargin: "500px 0px" });
  }
  imgs.forEach((i) => observateur.observe(i));
}
function telecharger(nom, contenu, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const nomFichier = (s) => String(s || "madiba").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 50) || "madiba";
// Fichier tableur lisible par Excel (séparateur « ; » et accents conservés).
function csv(lignes) {
  const cellule = (x) => { const s = String(x ?? ""); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "\uFEFF" + lignes.map((l) => l.map(cellule).join(";")).join("\r\n");
}
// Les suppressions et envois multiples partent ensemble, et non l'un après l'autre.
async function parLots(liste, f, taille = 6) {
  for (let i = 0; i < liste.length; i += taille) await Promise.all(liste.slice(i, i + taille).map(f));
}
async function viderSousCollection(...chemin) {
  try {
    const s = await getDocs(collection(db, ...chemin));
    await parLots(s.docs, (d) => deleteDoc(doc(db, ...chemin, d.id)).catch(() => { /* document non accessible */ }), 20);
  } catch (e) { /* collection non accessible */ }
}
// Historique : chaque action d'administration laisse une trace.
function journaliser(action, cible, titre, clubId) {
  if (!etat.user || !etat.profil) return;
  addDoc(collection(db, "historique"), {
    quand: new Date().toISOString(), uid: etat.user.uid, nom: `${etat.profil.prenom} ${etat.profil.nom}`,
    action, cible, titre: String(titre || "").slice(0, 160), clubId: clubId || ""
  }).catch(() => {});
  etat.historique = null;
}
const reserveMembres = (cleTitre) => `<h1>${te(cleTitre)}</h1><section class="carte"><p>${te("reserve.membres")}</p>
  <a class="btn contour" href="${etat.user ? "#/compte" : "#/connexion"}">${te(etat.user ? "code.jai" : "seConnecter")}</a></section>`;

/* ---------- Lieu et agenda ---------- */
const lienMaps = (lieu) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
const lienLieu = (lieu) => `<a href="${lienMaps(lieu)}" target="_blank" rel="noopener">${esc(lieu)}</a>`;
const compact = (iso) => iso.replace(/[-:]/g, "");
function bornesAgenda(e) {
  if (e.debut.length === 10) {
    const f = (e.fin || e.debut).slice(0, 10);
    const lendemain = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10) + 1);
    return { jourEntier: true, debut: compact(e.debut), fin: compact(jourISO(lendemain)) };
  }
  let fin = e.fin ? (e.fin.length === 10 ? e.fin + "T23:59" : e.fin) : "";
  if (!fin) {
    const d = new Date(+e.debut.slice(0, 4), +e.debut.slice(5, 7) - 1, +e.debut.slice(8, 10), +e.debut.slice(11, 13) + 2, +e.debut.slice(14, 16));
    fin = `${jourISO(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  return { jourEntier: false, debut: compact(e.debut) + "00", fin: compact(fin) + "00" };
}
function lienGoogleAgenda(e) {
  const b = bornesAgenda(e);
  const p = new URLSearchParams({
    action: "TEMPLATE", text: e.titre, dates: `${b.debut}/${b.fin}`,
    details: [e.description, urlAppli() + "#/evenement/" + e.id].filter(Boolean).join("\n\n"), location: e.lieu || ""
  });
  if (!b.jourEntier) p.set("ctz", CLUB_TZ[e.clubId] || "Europe/Brussels");
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
function texteICS(e) {
  const b = bornesAgenda(e);
  const tz = CLUB_TZ[e.clubId] || "Europe/Brussels";
  const echap = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const date = (x) => (b.jourEntier ? `;VALUE=DATE:${x}` : `;TZID=${tz}:${x}`);
  const maintenant = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Madiba Club//Application//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${e.id}@madiba-club`, `DTSTAMP:${maintenant}`, `DTSTART${date(b.debut)}`, `DTEND${date(b.fin)}`,
    `SUMMARY:${echap(e.titre)}`, e.lieu ? `LOCATION:${echap(e.lieu)}` : "",
    `DESCRIPTION:${echap([e.description, urlAppli() + "#/evenement/" + e.id].filter(Boolean).join("\n\n"))}`,
    "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\r\n");
}
const boutonsAgenda = (e) => `<div class="rangee">
    <a class="btn contour petit-btn" href="${esc(lienGoogleAgenda(e))}" target="_blank" rel="noopener">${te("agenda.google")}</a>
    <a class="btn contour petit-btn" href="data:text/calendar;charset=utf-8,${encodeURIComponent(texteICS(e))}" download="${nomFichier(e.titre)}.ics">${te("agenda.ics")}</a>
  </div>`;

/* ---------- Cartes de publication ---------- */
function actionsAdmin(col, x) {
  const b = (action, cle, cls = "") => `<button class="lien-btn ${cls}" type="button" data-action="${action}" data-col="${col}" data-id="${esc(x.id)}">${te(cle)}</button>`;
  return `<div class="rangee actions-admin">${b("modifier", "admin.modifier")}
    ${col === "events" ? b("dupliquer", "admin.dupliquer") + b("export-participants", "admin.exporter") : ""}
    ${col === "sondages" ? b("cloturer", x.ouvert === false ? "sondage.rouvrir" : "sondage.cloturer") : ""}
    ${b("suppr", "supprimer", "danger")}</div>`;
}
function carteEvent(e, admin) {
  const d = dateDe(e.debut);
  const st = statut(e);
  const lien = `#/evenement/${esc(e.id)}`;
  return `<article class="event">
    ${aCouverture(e) ? `<a class="event-image" href="${lien}" tabindex="-1" aria-hidden="true">${couverture("events", e)}</a>` : ""}
    <div class="event-ligne">
      <div class="jour ${(club(e.clubId) || RESEAU).classe}"><span>${esc(fmt({ month: "short" }, d))}</span><strong>${d.getDate()}</strong></div>
      <div class="corps">
        <h3><a class="titre-lien" href="${lien}">${esc(e.titre)}</a></h3>
        <p class="petit gris">${esc(texteDate(e))}${e.lieu ? " · " + lienLieu(e.lieu) : ""}</p>
        <p>${pastilleClub(e.clubId)} ${pastilleVis(e)}${st === "encours" ? ` <span class="pastille or">${te("ev.encours")}</span>` : ""}${st === "passes" && (e.compteRendu || e.nbPhotos) ? ` <span class="pastille or">${te("cr.pastille")}</span>` : ""}</p>
        ${e.description && !admin ? `<p class="description court">${esc(e.description)}</p>` : ""}
        ${blocReponse(e, admin)}
        ${admin ? actionsAdmin("events", e) : ""}
      </div>
    </div>
  </article>`;
}
function carteNews(n, admin, court) {
  return `<article class="carte">
    ${aCouverture(n) ? `<div class="image-news">${couverture("news", n)}</div>` : ""}
    <p class="ligne-pastilles">${pastilleClub(n.clubId)} ${pastilleVis(n)}<span class="petit gris date">${esc(texteDatePublication(n.publieLe))}</span></p>
    <h3>${esc(n.titre)}</h3>
    ${court || admin ? "" : `<p class="description">${esc(n.texte)}</p>`}
    ${admin ? actionsAdmin("news", n) : ""}
  </article>`;
}
function carteJournal(j, admin) {
  const sous = [j.numero, j.periode].filter(Boolean).join(" · ");
  return `<article class="carte journal">
    ${imageSure(j.couverture) ? `<img class="couverture" src="${j.couverture}" alt="" loading="lazy" decoding="async">` : ""}
    <div class="corps">
      <p class="ligne-pastilles"><span class="pastille or-plein">${te("journal.pastille")}</span> ${pastilleClub(j.clubId)} ${pastilleVis(j)}</p>
      <h3>${esc(j.titre)}</h3>
      ${sous ? `<p class="petit gris">${esc(sous)}</p>` : ""}
      ${admin ? actionsAdmin("journaux", j) : `<a class="btn contour petit-btn" href="#/journal/${esc(j.id)}">${te("journal.lire")}</a>`}
    </div>
  </article>`;
}

/* ---------- Réponses aux événements, places et liste d'attente ---------- */
const STATUTS_REPONSE = ["oui", "peutetre", "non"];
let fileReponses = new Set();
function demanderReponses(id) {
  if (!etat.user || !etat.profil || etat.reponses[id]) return;
  if (!fileReponses.size) setTimeout(chargerReponses, 0);
  fileReponses.add(id);
}
async function lireReponses(id) {
  const parUid = {};
  const e = (etat.events || []).find((x) => x.id === id) || {};
  // L'ordre d'arrivée ne sert qu'aux événements à places limitées (ou au visiteur, pour sa propre réponse).
  const avecOrdre = Number(e.places) > 0 || !estMembre();
  const [ins, rep] = await Promise.all([
    avecOrdre ? getDocs(collection(db, "events", id, "inscrits")).catch(() => null) : null,
    estMembre() ? getDocs(collection(db, "events", id, "reponses")) : null
  ]);
  if (ins) ins.docs.forEach((d) => { parUid[d.id] = { uid: d.id, ...d.data() }; });
  if (rep) {
    rep.docs.forEach((d) => {
      const x = d.data();
      parUid[d.id] = { ...x, uid: d.id, inscritLe: (parUid[d.id] || {}).inscritLe || x.majLe };
    });
  }
  return Object.values(parUid);
}
async function chargerReponses() {
  const ids = [...fileReponses]; fileReponses = new Set();
  ids.forEach((id) => { etat.reponses[id] = { chargement: true, liste: [], moi: "" }; });
  const uid = etat.user && etat.user.uid;
  await Promise.all(ids.map(async (id) => {
    try {
      const liste = await lireReponses(id);
      const mienne = liste.find((r) => r.uid === uid);
      etat.reponses[id] = { liste, moi: mienne ? mienne.statut : "" };
    } catch (e) { etat.reponses[id] = { liste: [], moi: "", erreur: true }; }
  }));
  rafraichir();
}
function compteReponses(r) {
  const n = { oui: 0, peutetre: 0, non: 0 };
  (r ? r.liste : []).forEach((x) => { if (n[x.statut] !== undefined) n[x.statut]++; });
  return n;
}
// Les premiers à avoir dit « Je viens » ont une place ; les suivants sont en liste d'attente.
function placesEvent(e, r) {
  const places = Number(e.places) || 0;
  const oui = (r ? r.liste : []).filter((x) => x.statut === "oui").sort((a, b) => msTemps(a.inscritLe) - msTemps(b.inscritLe));
  return { places, oui, confirmes: places ? oui.slice(0, places) : oui, attente: places ? oui.slice(places) : [], restantes: places ? Math.max(0, places - oui.length) : null };
}
const nomsDe = (liste) => esc(liste.map((x) => `${x.prenom || ""} ${x.nom || ""}`.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b)).join(", "));
function blocReponse(e, admin) {
  const passe = statut(e) === "passes";
  if (!etat.user) return passe ? "" : `<p class="petit"><a href="#/connexion">${te("rsvp.connexion")}</a></p>`;
  if (!etat.profil) return passe || admin ? "" : `<p class="petit"><a href="#/compte">${te("rsvp.profil")}</a></p>`;
  demanderReponses(e.id);
  const r = etat.reponses[e.id];
  if (!r || r.chargement) return `<div class="rsvp">${ligneVide()}</div>`;
  const n = compteReponses(r);
  const pl = placesEvent(e, r);
  const rang = pl.attente.findIndex((x) => x.uid === etat.user.uid) + 1;
  const infoPlaces = pl.places ? `<p class="petit">${esc(pl.restantes ? t("places.restantes", { n: pl.restantes, total: pl.places }) : t("places.complet", { total: pl.places }))}${pl.attente.length ? " · " + esc(t("places.attente", { n: pl.attente.length })) : ""}</p>` : "";
  const lignes = [];
  if (estMembre()) {
    if (pl.confirmes.length) lignes.push(`<p class="petit"><strong>${te("rsvp.liste.oui")}</strong> ${nomsDe(pl.confirmes)}</p>`);
    if (pl.attente.length) lignes.push(`<p class="petit"><strong>${te("rsvp.liste.attente")}</strong> ${nomsDe(pl.attente)}</p>`);
    const pe = r.liste.filter((x) => x.statut === "peutetre");
    if (pe.length) lignes.push(`<p class="petit"><strong>${te("rsvp.liste.peutetre")}</strong> ${nomsDe(pe)}</p>`);
    const non = r.liste.filter((x) => x.statut === "non");
    if (admin && non.length) lignes.push(`<p class="petit"><strong>${te("rsvp.liste.non")}</strong> ${nomsDe(non)}</p>`);
  }
  const libelle = esc(t("rsvp.resume", { oui: n.oui, peut: n.peutetre }));
  const resume = n.oui || n.peutetre || (admin && n.non)
    ? (lignes.length ? `<details class="rsvp-qui"><summary>${libelle}</summary>${lignes.join("")}</details>` : `<p class="petit gris">${libelle}</p>`) : "";
  if (admin || passe) return infoPlaces + resume;
  if (!etat.profil) return `<p class="petit"><a href="#/compte">${te("rsvp.profil")}</a></p>`;
  const libelleOui = pl.places && !pl.restantes && r.moi !== "oui" ? t("places.rejoindreAttente") : t("rsvp.oui");
  return `${infoPlaces}<div class="rsvp" role="group" aria-label="${te("rsvp.question")}">
      ${STATUTS_REPONSE.map((s) => `<button type="button" class="puce ${r.moi === s ? "actif" : ""}" aria-pressed="${r.moi === s ? "true" : "false"}" data-action="rsvp" data-id="${esc(e.id)}" data-v="${s}">${esc(s === "oui" ? libelleOui : t("rsvp." + s))}</button>`).join("")}
    </div>
    ${rang ? `<p class="petit attente-moi">${esc(t("places.maPosition", { n: rang }))}</p>` : ""}${resume}`;
}
// La réponse s'affiche aussitôt ; elle part ensuite au serveur (et s'annule s'il refuse).
async function repondre(id, choix) {
  const uid = etat.user.uid;
  const r = etat.reponses[id] || { liste: [], moi: "" };
  const copie = { liste: r.liste.slice(), moi: r.moi };
  const refR = doc(db, "events", id, "reponses", uid);
  const refI = doc(db, "events", id, "inscrits", uid);
  const lot = writeBatch(db);
  if (r.moi === choix) {
    lot.delete(refR); lot.delete(refI);
    r.liste = r.liste.filter((x) => x.uid !== uid); r.moi = "";
  } else {
    const p = etat.profil;
    const avant = r.liste.find((x) => x.uid === uid);
    // On garde sa place dans la file si l'on disait déjà « Je viens ».
    const garder = choix === "oui" && avant && avant.statut === "oui" && estTimestamp(avant.inscritLe);
    const donnees = { statut: choix, prenom: p.prenom, nom: p.nom, clubId: p.clubId || "", majLe: new Date().toISOString() };
    lot.set(refR, donnees);
    lot.set(refI, { statut: choix, inscritLe: garder ? avant.inscritLe : serverTimestamp() });
    r.liste = r.liste.filter((x) => x.uid !== uid).concat([{ uid, ...donnees, inscritLe: garder ? avant.inscritLe : new Date().toISOString() }]);
    r.moi = choix;
  }
  etat.reponses[id] = r;
  afficher(false);
  try { await lot.commit(); }
  catch (e) { etat.reponses[id] = copie; throw e; }
}
async function exporterParticipants(id) {
  const e = (etat.events || []).find((x) => x.id === id);
  if (!e) return;
  if (etat.membres === null) await chargerMembres();
  const liste = await lireReponses(id);
  const pl = placesEvent(e, { liste });
  const fiche = (uid) => (etat.membres || []).find((u) => u.uid === uid) || {};
  const ligne = (x, place) => [x.prenom || "", x.nom || "", club(x.clubId) ? nomCourt(x.clubId) : "",
    t("rsvp." + x.statut), place, fiche(x.uid).email || "", fiche(x.uid).telephone || "", new Date(msTemps(x.inscritLe || x.majLe) || Date.now()).toLocaleString(LOCALES[etat.langue])];
  const lignes = [[t("prenom"), t("nom"), t("export.club"), t("export.reponse"), t("export.place"), t("email"), t("parcours.telephone"), t("export.date")]];
  pl.confirmes.forEach((x, i) => lignes.push(ligne(x, pl.places ? `${i + 1}/${pl.places}` : t("export.confirme"))));
  pl.attente.forEach((x, i) => lignes.push(ligne(x, t("export.attente", { n: i + 1 }))));
  liste.filter((x) => x.statut === "peutetre").forEach((x) => lignes.push(ligne(x, "")));
  liste.filter((x) => x.statut === "non").forEach((x) => lignes.push(ligne(x, "")));
  telecharger(`participants-${nomFichier(e.titre)}.csv`, csv(lignes), "text/csv;charset=utf-8");
}

/* ---------- Page d'un événement ---------- */
// Photos du compte rendu : chacune est téléchargée quand on arrive dessus.
const idPhoto = (e, i) => (e.photosV ? e.photosV + "-" : "") + String(i).padStart(3, "0");
const galerie = (e) => `<div class="galerie">${Array.from({ length: Math.min(8, e.nbPhotos || 0) }, (_, k) => `<button type="button" class="vignette-btn" data-action="agrandir" aria-label="${te("cr.agrandir")}">${imageMedia(`events/${e.id}/photos/${idPhoto(e, k + 1)}`, "")}</button>`).join("")}</div>`;
function pageEvenement() {
  const id = param();
  const retour = `<a class="lien-btn" href="#/evenements">${ico("gauche")} ${te("ev.retour")}</a>`;
  if (etat.events === null) return retour + chargement();
  const e = etat.events.find((x) => x.id === id);
  if (!e && demanderNouveaute("ev:" + id)) return retour + chargement(1);
  if (!e) return `${retour}<section class="carte"><p>${te("ev.introuvable")}</p></section>`;
  const st = statut(e);
  const cr = e.compteRendu || e.nbPhotos ? `<section class="bloc">
      <h2>${te("cr.titre")}</h2>
      ${e.compteRendu ? `<p class="description">${esc(e.compteRendu)}</p>` : ""}
      ${e.nbPhotos ? galerie(e) : ""}
    </section>` : "";
  const reponse = blocReponse(e, false);
  return `${retour}
    ${aCouverture(e) ? couverture("events", e, "photo couverture-ev") : ""}
    <h1>${esc(e.titre)}</h1>
    <p class="gris">${esc(texteDate(e))}</p>
    ${e.lieu ? `<p><a class="lieu" href="${lienMaps(e.lieu)}" target="_blank" rel="noopener">${ico("lieu")} <span>${esc(e.lieu)}</span></a></p>` : ""}
    <p>${pastilleClub(e.clubId)} ${pastilleVis(e)}${st === "encours" ? ` <span class="pastille or">${te("ev.encours")}</span>` : ""}${st === "passes" ? ` <span class="pastille contour">${te("ev.passe")}</span>` : ""}</p>
    ${blocInfo()}
    ${e.description ? `<p class="description">${esc(e.description)}</p>` : ""}
    ${st !== "passes" ? `<section class="carte"><h2>${te("rsvp.question")}</h2>${reponse || `<p class="gris petit">${te("chargement")}</p>`}</section>
      <div class="carte"><h3>${te("agenda.titre")}</h3>${boutonsAgenda(e)}</div>` : (reponse ? `<section class="carte">${reponse}</section>` : "")}
    ${cr}
    ${estAdmin() && peutGerer(e.clubId) ? `<section class="carte"><h2>${te("admin.titre")}</h2>${blocReponse(e, true)}${actionsAdmin("events", e)}</section>` : ""}`;
}

/* ---------- Formulaires de publication (création, modification, duplication) ---------- */
const TYPE_DE_COL = { events: "event", news: "news", journaux: "journal", sondages: "sondage", documents: "document" };
const sourceDe = (col) => ({ events: etat.events, news: etat.news, journaux: etat.journaux, sondages: etat.sondages, documents: etat.documents }[col] || []);
const val = (k) => esc((etat.pubValeurs || {})[k] ?? "");
const coche = (k) => ((etat.pubValeurs || {})[k] === "on" ? " checked" : "");
function capturerForm(form) {
  if (!form) return;
  const v = { ...(etat.pubValeurs || {}) };
  for (const el of form.elements) {
    if (!el.name || el.type === "file") continue;
    if (el.type === "checkbox") v[el.name] = el.checked ? "on" : "";
    else if (el.type === "radio") { if (el.checked) v[el.name] = el.value; }
    else v[el.name] = el.value;
  }
  etat.pubValeurs = v;
}
function reinitialiserPublication() {
  etat.edition = null; etat.pubValeurs = null; etat.pubPhotos = []; etat.pubPhotosModif = false; etat.pubImageModif = false;
}
async function chargerPhotosEdition(id) {
  try {
    const s = await getDocs(collection(db, "events", id, "photos"));
    etat.pubPhotos = s.docs.map((d) => d.data()).sort((a, b) => (a.n || 0) - (b.n || 0)).map((p) => p.image).filter(imageSure);
  } catch (e) { etat.pubPhotos = []; }
  afficher(false, true);
}
function preparerEdition(col, id, dupliquer) {
  const x = sourceDe(col).find((y) => y.id === id);
  if (!x) return;
  const v = { ...x };
  delete v.id;
  if (col === "events") {
    v.dateDebut = x.debut.slice(0, 10); v.heureDebut = x.debut.slice(11, 16);
    v.dateFin = x.fin ? x.fin.slice(0, 10) : ""; v.heureFin = x.fin && x.fin.length > 10 ? x.fin.slice(11, 16) : "";
    v.places = x.places ? String(x.places) : "";
  }
  if (col === "journaux" || col === "documents") v.date = String(x.publieLe || "").slice(0, 10);
  if (col === "sondages") { v.options = (x.options || []).join("\n"); v.multiple = x.multiple ? "on" : ""; v.anonyme = x.anonyme ? "on" : ""; }
  if (dupliquer) v.compteRendu = "";
  etat.typePublication = TYPE_DE_COL[col];
  etat.edition = dupliquer ? null : { col, id };
  etat.pubValeurs = v;
  etat.pubPhotosModif = false;
  // Une copie emporte la couverture : on la télécharge pour pouvoir la réenregistrer.
  etat.pubImageModif = !!dupliquer && aCouverture(x);
  if (dupliquer && x.imageId) {
    v.image = medias.get(cheminCouverture(col, x)) || "";
    if (!v.image) lireMedia(cheminCouverture(col, x)).then((img) => { if (etat.pubValeurs === v) { v.image = img; afficher(false, true); } });
  }
  etat.pubPhotos = col === "events" && !dupliquer && x.nbPhotos ? null : [];
  if (etat.pubPhotos === null) chargerPhotosEdition(id);
  etat.adminOnglet = "publier";
  etat.info = dupliquer ? { type: "ok", texte: t("admin.copieInfo") } : null;
  if (route() === "admin") afficher(); else aller("admin");
}
function champClubPub(avecReseau) {
  const v = etat.pubValeurs || {};
  if (estSuper()) return `<div class="champ"><label for="clubId">${te("admin.club")}</label><select id="clubId" name="clubId" required>${optionsClubs(v.clubId || etat.profil.clubId, avecReseau)}</select></div>`;
  return `<input type="hidden" name="clubId" value="${esc(etat.profil.clubId)}"><p class="petit gris">${te("admin.pour")} <strong>${esc(nomClub(etat.profil.clubId))}</strong></p>`;
}
function champVisPub(choix, defaut) {
  const v = etat.pubValeurs || {};
  const courant = choix.includes(v.visibility) ? v.visibility : (defaut || choix[0]);
  return `<div class="champ"><label for="visibility">${te("admin.qui")}</label>
      <select id="visibility" name="visibility">${choix.map((x) => `<option value="${x}"${x === courant ? " selected" : ""}>${te("admin.vis." + x)}</option>`).join("")}</select></div>
    ${choix.includes("pole") ? `<div class="champ"><label for="pole">${te("admin.pole")}</label><select id="pole" name="pole">${optionsPoles(v.pole)}</select><span class="aide">${te("admin.poleAide")}</span></div>` : ""}`;
}
function champImagePub() {
  const v = etat.pubValeurs || {};
  // Image inchangée d'une publication existante : on montre celle qui est enregistrée.
  const enPlace = etat.edition && !etat.pubImageModif && !imageSure(v.image) && v.imageId;
  const apercu = enPlace ? imageMedia(`${etat.edition.col}/${etat.edition.id}/media/${v.imageId}`, v.miniature, "apercu-image")
    : imageSure(v.image) ? `<img class="apercu-image" src="${v.image}" alt="">` : "";
  return `<div class="champ"><label for="fichierImage">${te("img.label")}</label>
    ${apercu ? `${apercu}<button type="button" class="lien-btn danger" data-action="image-suppr">${te("img.retirer")}</button>` : ""}
    <input id="fichierImage" type="file" accept="image/*" data-change="image-pub"><span class="aide">${te("img.aide")}</span></div>`;
}
const boutonsForm = (cleCreer) => `<button class="btn plein large" type="submit">${te(etat.edition ? "admin.enregistrerModifs" : cleCreer)}</button>
  ${etat.edition ? `<button class="btn contour large" type="button" data-action="annuler-edition">${te("annuler")}</button>` : ""}`;

function formEvent() {
  const photos = etat.pubPhotos || [];
  return `<form id="form-event" novalidate>
      <div class="champ"><label for="titre">${te("admin.evTitre")}</label><input id="titre" name="titre" maxlength="120" value="${val("titre")}" required></div>
      ${champClubPub(false)}
      <div class="deux">
        <div class="champ"><label for="dateDebut">${te("admin.dateDebut")}</label><input id="dateDebut" name="dateDebut" type="date" value="${val("dateDebut")}" required></div>
        <div class="champ"><label for="heureDebut">${te("admin.heure")}</label><input id="heureDebut" name="heureDebut" type="time" value="${val("heureDebut")}"></div>
      </div>
      <div class="deux">
        <div class="champ"><label for="dateFin">${te("admin.dateFin")}</label><input id="dateFin" name="dateFin" type="date" value="${val("dateFin")}"></div>
        <div class="champ"><label for="heureFin">${te("admin.heureFin")}</label><input id="heureFin" name="heureFin" type="time" value="${val("heureFin")}"></div>
      </div>
      <div class="champ"><label for="lieu">${te("admin.lieu")}</label><input id="lieu" name="lieu" maxlength="160" value="${val("lieu")}"><span class="aide">${te("admin.lieuAide")}</span></div>
      <div class="champ"><label for="description">${te("admin.description")}</label><textarea id="description" name="description" rows="4" maxlength="3000">${val("description")}</textarea></div>
      ${champVisPub(["public", "members", "club", "pole"], "public")}
      <div class="champ"><label for="places">${te("places.label")}</label><input id="places" name="places" type="number" min="0" max="5000" inputmode="numeric" value="${val("places")}"><span class="aide">${te("places.aide")}</span></div>
      ${champImagePub()}
      <fieldset class="cadre"><legend>${te("cr.titre")}</legend>
        <p class="aide">${te("cr.aide")}</p>
        <div class="champ"><label for="compteRendu">${te("cr.texte")}</label><textarea id="compteRendu" name="compteRendu" rows="4" maxlength="4000">${val("compteRendu")}</textarea></div>
        ${etat.pubPhotos === null ? chargement() : `<div class="galerie edition">${photos.map((p, i) => `<div class="vignette"><img src="${p}" alt=""><button type="button" class="lien-btn danger" data-action="photo-cr-suppr" data-v="${i}">${te("retirer")}</button></div>`).join("")}</div>`}
        ${photos.length < 8 ? `<div class="champ"><label for="photosCR">${esc(t("cr.ajouter", { n: 8 - photos.length }))}</label><input id="photosCR" type="file" accept="image/*" multiple data-change="photos-cr"></div>` : ""}
      </fieldset>
      ${boutonsForm("admin.publierEv")}
    </form>`;
}
function formNews() {
  return `<form id="form-news" novalidate>
      <div class="champ"><label for="titre">${te("admin.newsTitre")}</label><input id="titre" name="titre" maxlength="120" value="${val("titre")}" required></div>
      ${champClubPub(true)}
      <div class="champ"><label for="texte">${te("admin.texte")}</label><textarea id="texte" name="texte" rows="7" maxlength="6000" required>${val("texte")}</textarea></div>
      ${champVisPub(["public", "members", "club"], "public")}
      ${champImagePub()}
      ${boutonsForm("admin.publierNews")}
    </form>`;
}
function formJournal() {
  return `<form id="form-journal" novalidate>
      <p class="petit gris">${te(etat.edition ? "admin.jAideModif" : "admin.jAide")}</p>
      <div class="champ"><label for="titre">${te("admin.jTitre")}</label><input id="titre" name="titre" maxlength="120" value="${etat.pubValeurs ? val("titre") : "Le Journal du Madiba"}" required></div>
      <div class="deux">
        <div class="champ"><label for="numero">${te("admin.jNumero")}</label><input id="numero" name="numero" maxlength="40" placeholder="N°1 · 2025-2026" value="${val("numero")}"></div>
        <div class="champ"><label for="date">${te("admin.jDate")}</label><input id="date" name="date" type="date" value="${val("date")}" required></div>
      </div>
      <div class="champ"><label for="periode">${te("admin.jPeriode")}</label><input id="periode" name="periode" maxlength="60" placeholder="Janvier-Février 2026" value="${val("periode")}"></div>
      ${champClubPub(false)}
      ${champVisPub(["public", "members", "club"], "club")}
      <div class="champ"><label for="pdf">${te(etat.edition ? "admin.jFichierModif" : "admin.jFichier")}</label><input id="pdf" type="file" accept="application/pdf,.pdf"></div>
      ${boutonsForm("admin.publierJournal")}
    </form>`;
}
function formSondage() {
  const edition = !!etat.edition;
  return `<form id="form-sondage" novalidate>
      <div class="champ"><label for="question">${te("sondage.question")}</label><input id="question" name="question" maxlength="200" value="${val("question")}" required></div>
      <div class="champ"><label for="description">${te("sondage.description")}</label><textarea id="description" name="description" rows="2" maxlength="1500">${val("description")}</textarea></div>
      <div class="champ"><label for="options">${te("sondage.options")}</label><textarea id="options" name="options" rows="5" maxlength="2000" required>${val("options")}</textarea><span class="aide">${te("sondage.optionsAide")}</span></div>
      <label class="case-coche"><input type="checkbox" name="multiple"${coche("multiple")}> <span>${te("sondage.multiple")}</span></label>
      <label class="case-coche"><input type="checkbox" name="anonyme"${coche("anonyme")}${edition ? " disabled" : ""}> <span>${te("sondage.anonyme")}</span></label>
      ${edition ? `<p class="aide">${te("sondage.anonymeFixe")}</p>` : ""}
      ${champClubPub(false)}
      ${champVisPub(["members", "club", "pole"], "club")}
      <div class="champ"><label for="cloture">${te("sondage.cloture")}</label><input id="cloture" name="cloture" type="date" value="${val("cloture")}"><span class="aide">${te("sondage.clotureAide")}</span></div>
      ${boutonsForm("sondage.publier")}
    </form>`;
}
const CATEGORIES_DOC = ["statuts", "pv", "chartes", "guides", "modeles", "autre"];
function formDocument() {
  const v = etat.pubValeurs || {};
  return `<form id="form-document" novalidate>
      <div class="champ"><label for="titre">${te("doc.titreChamp")}</label><input id="titre" name="titre" maxlength="140" value="${val("titre")}" required></div>
      <div class="champ"><label for="categorie">${te("doc.categorie")}</label><select id="categorie" name="categorie">${CATEGORIES_DOC.map((c) => `<option value="${c}"${c === v.categorie ? " selected" : ""}>${te("doc.cat." + c)}</option>`).join("")}</select></div>
      <div class="champ"><label for="description">${te("doc.description")}</label><textarea id="description" name="description" rows="2" maxlength="1000">${val("description")}</textarea></div>
      <div class="champ"><label for="date">${te("doc.date")}</label><input id="date" name="date" type="date" value="${val("date") || jourAujourdhui()}"></div>
      ${champClubPub(false)}
      ${champVisPub(["members", "club", "pole"], "club")}
      <div class="champ"><label for="fichierDoc">${te(etat.edition && v.fichier ? "doc.fichierModif" : "doc.fichier")}</label><input id="fichierDoc" type="file"><span class="aide">${te("doc.fichierAide")}</span></div>
      <div class="champ"><label for="lien">${te("doc.lien")}</label><input id="lien" name="lien" inputmode="url" placeholder="https://drive.google.com/…" value="${val("lien")}"><span class="aide">${te("doc.lienAide")}</span></div>
      ${boutonsForm("doc.publier")}
    </form>`;
}

function adminPublier() {
  const types = ["event", "news", "journal", "sondage", "document"];
  if (!types.includes(etat.typePublication)) etat.typePublication = "event";
  const formulaire = { event: formEvent, news: formNews, journal: formJournal, sondage: formSondage, document: formDocument }[etat.typePublication]();
  const titre = etat.edition ? `<div class="message ok">${esc(t("admin.enModification", { titre: (etat.pubValeurs || {}).titre || (etat.pubValeurs || {}).question || "" }))}</div>` : "";
  return `${etat.edition ? "" : `<div class="puces">${types.map((x) => `<button type="button" class="puce ${etat.typePublication === x ? "actif" : ""}" data-action="type" data-v="${x}">${te("admin.type." + x)}</button>`).join("")}</div>`}
    ${titre}
    <section class="carte"><div id="msg" aria-live="polite"></div>${formulaire}</section>`;
}
// Après une publication, on met la liste à jour sur place au lieu de tout redemander au serveur.
const LISTES = { events: "events", news: "news", journaux: "journaux", sondages: "sondages", documents: "documents" };
function majLocale(col, x) {
  const cle = LISTES[col];
  if (!cle) return;
  const l = (etat[cle] || []).filter((y) => y.id !== x.id);
  l.push(x);
  if (col === "news") l.sort((a, b) => String(b.publieLe || "").localeCompare(String(a.publieLe || "")));
  if (col === "sondages") l.sort((a, b) => msTemps(b.createdAt) - msTemps(a.createdAt));
  etat[cle] = l;
}
function finPublication(texte, col, x) {
  if (col && x) majLocale(col, x);
  reinitialiserPublication();
  etat.info = { type: "ok", texte };
  etat.adminOnglet = "contenus";
  afficher();
}
// Couverture rangée à part : enregistre la nouvelle, renvoie les champs de la fiche et efface l'ancienne ensuite.
async function ecrireCouverture(col, id, ancien, image) {
  const avant = ancien && ancien.imageId ? ancien.imageId : "";
  const effacer = () => (avant ? deleteDoc(doc(db, col, id, "media", avant)).catch(() => {}) : Promise.resolve());
  if (!imageSure(image)) return { champs: { imageId: "", miniature: "", image: deleteField() }, local: { imageId: "", miniature: "", image: "" }, apres: effacer };
  const imageId = "c" + versionImage();
  const miniature = await miniatureDe(image);
  await setDoc(doc(db, col, id, "media", imageId), { image });
  medias.set(`${col}/${id}/media/${imageId}`, image);
  return { champs: { imageId, miniature, image: deleteField() }, local: { imageId, miniature, image: "" }, apres: effacer };
}
async function ecrirePhotos(id, photos, photosV = versionImage()) {
  await viderSousCollection("events", id, "photos");
  await parLots(photos.map((p, i) => [p, i]), ([p, i]) => setDoc(doc(db, "events", id, "photos", `${photosV}-${String(i + 1).padStart(3, "0")}`), { n: i + 1, image: p }), 4);
  photos.forEach((p, i) => medias.set(`events/${id}/photos/${photosV}-${String(i + 1).padStart(3, "0")}`, p));
  return photosV;
}
async function soumettreEvent(form, v) {
  if (!v.titre || !v.clubId || !v.dateDebut) return message(t("val.event"));
  if (v.visibility === "pole" && !v.pole) return message(t("val.pole"));
  if (v.places && !(Number(v.places) >= 0)) return message(t("val.places"));
  const e = {
    titre: v.titre, clubId: v.clubId, lieu: v.lieu, description: v.description, visibility: v.visibility || "public",
    pole: v.visibility === "pole" ? v.pole : "",
    debut: v.dateDebut + (v.heureDebut ? "T" + v.heureDebut : ""),
    fin: v.dateFin || v.heureFin ? (v.dateFin || v.dateDebut) + (v.heureFin ? "T" + v.heureFin : "") : "",
    places: v.places ? Math.floor(Number(v.places)) : 0,
    compteRendu: v.compteRendu || ""
  };
  if (e.fin && finComplete(e) < debutComplet(e)) return message(t("val.fin"));
  const photos = etat.pubPhotos || [];
  const imageModif = etat.pubImageModif;
  const image = imageModif ? imageSure((etat.pubValeurs || {}).image) : "";
  occupe(form, true);
  try {
    const edition = etat.edition;
    let local;
    if (edition) {
      const id = edition.id;
      const ancien = (etat.events || []).find((x) => x.id === id) || {};
      const maj = { ...e, majLe: serverTimestamp(), majPar: etat.user.uid };
      // Date, heure ou lieu changés : le programme de notifications prévient les inscrits.
      if (ancien.debut !== e.debut || (ancien.fin || "") !== e.fin || (ancien.lieu || "") !== e.lieu) { maj.modifieLe = serverTimestamp(); maj.modifImportante = true; }
      const cv = imageModif ? await ecrireCouverture("events", id, ancien, image) : null;
      if (cv) Object.assign(maj, cv.champs);
      if (etat.pubPhotosModif) { maj.nbPhotos = photos.length; maj.photosV = await ecrirePhotos(id, photos); }
      await updateDoc(doc(db, "events", id), maj);
      if (cv) cv.apres();
      local = { ...ancien, ...e, ...(cv ? cv.local : {}), ...(etat.pubPhotosModif ? { nbPhotos: maj.nbPhotos, photosV: maj.photosV } : {}), id };
      journaliser("modification", "events", e.titre, e.clubId);
    } else {
      // Identifiant choisi d'avance : la fiche, sa couverture et ses photos partent ensemble.
      const id = nouvelId();
      const imageId = image ? "c" + versionImage() : "";
      const photosV = photos.length ? versionImage() : "";
      const fiche = { ...e, imageId, miniature: image ? await miniatureDe(image) : "", nbPhotos: photos.length, photosV, auteur: etat.user.uid, createdAt: serverTimestamp() };
      await setDoc(doc(db, "events", id), fiche);
      await Promise.all([
        image ? setDoc(doc(db, "events", id, "media", imageId), { image }) : null,
        photos.length ? ecrirePhotos(id, photos, photosV) : null
      ]);
      if (image) medias.set(`events/${id}/media/${imageId}`, image);
      local = { ...fiche, id, createdAt: new Date().toISOString() };
      journaliser("creation", "events", e.titre, e.clubId);
    }
    finPublication(t(edition ? "admin.modifOk" : "admin.evOk", { titre: e.titre }), "events", local);
  } catch (err) { message(texteErreur(err)); occupe(form, false); }
}
async function soumettreNews(form, v) {
  if (!v.titre || !v.clubId || !v.texte) return message(t("val.news"));
  const n = { titre: v.titre, clubId: v.clubId, texte: v.texte, visibility: v.visibility || "public" };
  const imageModif = etat.pubImageModif;
  const image = imageModif ? imageSure((etat.pubValeurs || {}).image) : "";
  occupe(form, true);
  try {
    const edition = etat.edition;
    let local;
    if (edition) {
      const id = edition.id;
      const ancien = (etat.news || []).find((x) => x.id === id) || {};
      const maj = { ...n, majLe: serverTimestamp(), majPar: etat.user.uid };
      const cv = imageModif ? await ecrireCouverture("news", id, ancien, image) : null;
      if (cv) Object.assign(maj, cv.champs);
      await updateDoc(doc(db, "news", id), maj);
      if (cv) cv.apres();
      local = { ...ancien, ...n, ...(cv ? cv.local : {}), id };
      journaliser("modification", "news", n.titre, n.clubId);
    } else {
      const id = nouvelId();
      const imageId = image ? "c" + versionImage() : "";
      const fiche = { ...n, imageId, miniature: image ? await miniatureDe(image) : "", publieLe: new Date().toISOString(), auteur: etat.user.uid, createdAt: serverTimestamp() };
      await setDoc(doc(db, "news", id), fiche);
      if (image) { await setDoc(doc(db, "news", id, "media", imageId), { image }); medias.set(`news/${id}/media/${imageId}`, image); }
      local = { ...fiche, id, createdAt: new Date().toISOString() };
      journaliser("creation", "news", n.titre, n.clubId);
    }
    finPublication(t(edition ? "admin.modifOk" : "admin.newsOk", { titre: n.titre }), "news", local);
  } catch (err) { message(texteErreur(err)); occupe(form, false); }
}
async function soumettreJournal(form, v) {
  const fichier = form.querySelector("#pdf").files[0];
  const edition = etat.edition;
  if (!v.titre || !v.clubId || !v.date || (!fichier && !edition)) return message(t("val.journal"));
  const bouton = form.querySelector('button[type="submit"]');
  const libelle = bouton.textContent;
  occupe(form, true);
  let conv = null;
  if (fichier) {
    // Le convertisseur de PDF n'est téléchargé que par l'administrateur qui en a besoin.
    try { const { convertirPDF } = await import("./journal.js"); conv = await convertirPDF(fichier, (i, n) => { bouton.textContent = t("admin.jConversion", { i, n }); }); }
    catch (e) { message(t("val.pdf")); bouton.textContent = libelle; return occupe(form, false); }
    if (conv.pages.length > 40) { message(t("val.pdfGros")); bouton.textContent = libelle; return occupe(form, false); }
  }
  const meta = { titre: v.titre, numero: v.numero, periode: v.periode, clubId: v.clubId, visibility: v.visibility || "club", pole: "", publieLe: v.date + "T12:00:00.000Z" };
  // Chaque nouvelle version des pages porte un nouveau numéro : les téléphones ne gardent pas l'ancienne.
  if (conv) Object.assign(meta, { nbPages: conv.pages.length, couverture: conv.couverture, pagesV: versionImage() });
  try {
    let id;
    const ancien = edition ? (etat.journaux || []).find((x) => x.id === edition.id) || {} : {};
    if (edition) {
      id = edition.id;
      if (conv) await viderSousCollection("journaux", id, "pages");
      await updateDoc(doc(db, "journaux", id), { ...meta, majLe: serverTimestamp(), majPar: etat.user.uid });
    } else {
      id = nouvelId();
      await setDoc(doc(db, "journaux", id), { ...meta, auteur: etat.user.uid, createdAt: serverTimestamp() });
    }
    if (conv) {
      let faites = 0;
      await parLots(conv.pages.map((p, i) => [p, i]), async ([p, i]) => {
        await setDoc(doc(db, "journaux", id, "pages", idPage(meta, i + 1)), { n: i + 1, image: p.image, blocs: p.blocs });
        medias.set(`journaux/${id}/pages/${idPage(meta, i + 1)}`, p.image);
        bouton.textContent = t("admin.jEnvoi", { i: ++faites, n: conv.pages.length });
      }, 3);
    }
    delete etat.pagesJournal[id];
    journaliser(edition ? "modification" : "creation", "journaux", meta.titre, meta.clubId);
    finPublication(edition ? t("admin.modifOk", { titre: meta.titre }) : t("admin.jOk", { titre: meta.titre, n: conv.pages.length }), "journaux", { ...ancien, ...meta, id });
  } catch (err) { message(texteErreur(err)); bouton.textContent = libelle; occupe(form, false); }
}
async function soumettreSondage(form, v) {
  const options = [...new Set(String(v.options || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean))].slice(0, 12);
  if (!v.question || !v.clubId) return message(t("val.sondage"));
  if (options.length < 2) return message(t("val.options"));
  if (v.visibility === "pole" && !v.pole) return message(t("val.pole"));
  const s = {
    question: v.question, description: v.description || "", options, multiple: form.elements.multiple.checked,
    clubId: v.clubId, visibility: v.visibility || "club", pole: v.visibility === "pole" ? v.pole : "", cloture: v.cloture || ""
  };
  occupe(form, true);
  try {
    const edition = etat.edition;
    let local;
    if (edition) {
      await updateDoc(doc(db, "sondages", edition.id), { ...s, majLe: serverTimestamp() });
      local = { ...((etat.sondages || []).find((x) => x.id === edition.id) || {}), ...s, id: edition.id };
      journaliser("modification", "sondages", s.question, s.clubId);
    } else {
      const fiche = { ...s, anonyme: form.elements.anonyme.checked, ouvert: true, auteur: etat.user.uid };
      const ref = await addDoc(collection(db, "sondages"), { ...fiche, createdAt: serverTimestamp() });
      local = { ...fiche, id: ref.id, createdAt: new Date().toISOString() };
      journaliser("creation", "sondages", s.question, s.clubId);
    }
    if (edition) delete etat.votes[edition.id];
    finPublication(t(edition ? "admin.modifOk" : "sondage.ok", { titre: s.question }), "sondages", local);
  } catch (err) { message(texteErreur(err)); occupe(form, false); }
}
const TAILLE_MORCEAU = 700000;
function lireEnBase64(fichier) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] || "");
    r.onerror = () => ko(new Error("lecture"));
    r.readAsDataURL(fichier);
  });
}
async function soumettreDocument(form, v) {
  const fichier = form.querySelector("#fichierDoc").files[0];
  const edition = etat.edition;
  const ancien = edition ? sourceDe("documents").find((x) => x.id === edition.id) || {} : {};
  let lien = v.lien || "";
  if (lien && !/^https?:\/\//i.test(lien)) lien = "https://" + lien;
  if (!v.titre || !v.clubId) return message(t("val.doc"));
  if (!fichier && !lien && !ancien.fichier) return message(t("val.docFichier"));
  if (fichier && fichier.size > 5 * 1024 * 1024) return message(t("val.docGros"));
  if (v.visibility === "pole" && !v.pole) return message(t("val.pole"));
  const d = {
    titre: v.titre, categorie: v.categorie || "autre", description: v.description || "", clubId: v.clubId,
    visibility: v.visibility || "club", pole: v.visibility === "pole" ? v.pole : "", lien: fichier ? "" : lien,
    publieLe: (v.date || jourAujourdhui()) + "T12:00:00.000Z"
  };
  const bouton = form.querySelector('button[type="submit"]');
  occupe(form, true);
  try {
    let morceaux = null;
    if (fichier) {
      const b64 = await lireEnBase64(fichier);
      morceaux = [];
      for (let i = 0; i < b64.length; i += TAILLE_MORCEAU) morceaux.push(b64.slice(i, i + TAILLE_MORCEAU));
      d.fichier = { nom: fichier.name.slice(0, 120), type: fichier.type || "application/octet-stream", taille: fichier.size, morceaux: morceaux.length };
    } else if (lien) d.fichier = null;
    let id;
    if (edition) {
      id = edition.id;
      await updateDoc(doc(db, "documents", id), { ...d, majLe: serverTimestamp() });
      if (morceaux || (lien && ancien.fichier)) await viderSousCollection("documents", id, "morceaux");
    } else {
      id = (await addDoc(collection(db, "documents"), { ...d, auteur: etat.user.uid, createdAt: serverTimestamp() })).id;
    }
    if (morceaux) {
      let faits = 0;
      await parLots(morceaux.map((m, i) => [m, i]), async ([m, i]) => {
        await setDoc(doc(db, "documents", id, "morceaux", String(i).padStart(3, "0")), { n: i, data: m });
        bouton.textContent = t("doc.envoi", { i: ++faits, n: morceaux.length });
      }, 3);
    }
    delete etat.docsPrets[id];
    journaliser(edition ? "modification" : "creation", "documents", d.titre, d.clubId);
    finPublication(t(edition ? "admin.modifOk" : "doc.ok", { titre: d.titre }), "documents", { ...ancien, ...d, id });
  } catch (err) { message(texteErreur(err)); occupe(form, false); }
}
async function supprimerPublication(col, id, x = {}) {
  const sous = { events: ["reponses", "inscrits", "photos", "media"], news: ["media"], journaux: ["pages"], sondages: ["votes"], documents: ["morceaux"] }[col] || [];
  await Promise.all(sous.map((s) => viderSousCollection(col, id, s)));
  await deleteDoc(doc(db, col, id));
  if (col === "events") delete etat.reponses[id];
  if (col === "journaux") delete etat.pagesJournal[id];
  journaliser("suppression", col, x.titre || x.question || "", x.clubId || "");
}
// Retire tout de suite de l'écran ; si le serveur refuse, l'élément revient avec un message.
async function supprimerSurPlace(col, id) {
  const cle = col === "opportunites" ? "opportunites" : LISTES[col];
  const avant = etat[cle] || [];
  const x = avant.find((y) => y.id === id) || {};
  etat[cle] = avant.filter((y) => y.id !== id);
  etat.info = { type: "ok", texte: t("admin.supprOk") };
  if (route() === "evenement" || route() === "documents") aller(route() === "evenement" ? "evenements" : "documents"); else afficher(false);
  try { await supprimerPublication(col, id, x); }
  catch (e) { etat[cle] = avant; etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
}

/* ---------- Contenus publiés (admin) ---------- */
function adminContenus() {
  if (etat.events === null) return chargement();
  const tri = (a, b) => String(b.publieLe || "").localeCompare(String(a.publieLe || ""));
  const evs = etat.events.filter((e) => peutGerer(e.clubId)).sort((x, y) => debutComplet(y).localeCompare(debutComplet(x)));
  const nws = (etat.news || []).filter((n) => peutGerer(n.clubId));
  const jrs = (etat.journaux || []).filter((j) => peutGerer(j.clubId)).sort(tri);
  const sds = (etat.sondages || []).filter((s) => peutGerer(s.clubId));
  const dcs = (etat.documents || []).filter((d) => peutGerer(d.clubId)).sort(tri);
  const section = (cle, liste, rendu, vide) => `<details class="carte section-admin" open><summary><h2>${esc(t(cle, { n: liste.length }))}</h2></summary>${liste.length ? liste.map(rendu).join("") : `<p class="gris">${te(vide)}</p>`}</details>`;
  return `<p class="petit gris">${te("admin.contenusAide")}</p>
    ${section("admin.evN", evs, (e) => carteEvent(e, true), "admin.aucunEv")}
    ${section("admin.newsN", nws, (n) => carteNews(n, true), "admin.aucuneNews")}
    ${section("admin.jN", jrs, (j) => carteJournal(j, true), "admin.aucunJournal")}
    ${section("admin.sondagesN", sds, (s) => `<article class="carte"><p class="ligne-pastilles">${pastilleClub(s.clubId)} ${pastilleVis(s)} ${s.anonyme ? `<span class="pastille contour">${te("sondage.anonymePastille")}</span>` : ""} <span class="pastille ${sondageOuvert(s) ? "or" : "contour"}">${te(sondageOuvert(s) ? "sondage.ouvert" : "sondage.clos")}</span></p><h3>${esc(s.question)}</h3>${actionsAdmin("sondages", s)}</article>`, "sondage.aucun")}
    ${section("admin.docsN", dcs, (d) => `<article class="carte"><p class="ligne-pastilles"><span class="pastille contour">${te("doc.cat." + (CATEGORIES_DOC.includes(d.categorie) ? d.categorie : "autre"))}</span> ${pastilleClub(d.clubId)} ${pastilleVis(d)}</p><h3>${esc(d.titre)}</h3>${actionsAdmin("documents", d)}</article>`, "doc.aucun")}`;
}

/* ---------- Sondages ---------- */
const sondageOuvert = (s) => s.ouvert !== false && (!s.cloture || s.cloture >= jourAujourdhui());
async function chargerVote(s) {
  etat.votes[s.id] = { chargement: true };
  const uid = etat.user.uid;
  let mien = null, tous = null;
  try {
    // Sondage nominatif : la liste des votes contient déjà le mien (une seule demande au lieu de deux).
    if (!s.anonyme) {
      tous = (await getDocs(collection(db, "sondages", s.id, "votes"))).docs.map((x) => ({ uid: x.id, ...x.data() }));
      const m = tous.find((x) => x.uid === uid);
      mien = m ? m.choix || null : null;
    } else {
      const d = await getDoc(doc(db, "sondages", s.id, "votes", uid));
      if (d.exists()) mien = d.data().choix || null;
    }
  } catch (e) { /* lecture refusée */ }
  etat.votes[s.id] = { mien, tous };
  rafraichir();
}
function resultatsSondage(s, v) {
  const n = s.options.map(() => 0);
  let votants = 0;
  if (s.anonyme) {
    (Array.isArray(s.resultats) ? s.resultats : []).forEach((x, i) => { if (i < n.length) n[i] = Number(x) || 0; });
    votants = Number(s.nbVotants) || 0;
  } else if (v && v.tous) {
    v.tous.forEach((x) => { votants++; (x.choix || []).forEach((i) => { if (i >= 0 && i < n.length) n[i]++; }); });
  }
  return { n, votants };
}
function carteSondage(s) {
  if (etat.votes[s.id] === undefined) chargerVote(s);
  const v = etat.votes[s.id];
  if (!v || v.chargement) return `<article class="carte"><h3>${esc(s.question)}</h3>${chargement()}</article>`;
  const ouvert = sondageOuvert(s);
  const aVote = Array.isArray(v.mien) && v.mien.length;
  const enEdition = etat.voteEdition === s.id;
  const tete = `<p class="ligne-pastilles">${pastilleClub(s.clubId)} ${pastilleVis(s)} ${s.anonyme ? `<span class="pastille contour">${te("sondage.anonymePastille")}</span>` : ""} <span class="pastille ${ouvert ? "or" : "contour"}">${te(ouvert ? "sondage.ouvert" : "sondage.clos")}</span></p>
    <h3>${esc(s.question)}</h3>${s.description ? `<p class="description petit">${esc(s.description)}</p>` : ""}
    ${s.cloture ? `<p class="petit gris">${esc(t("sondage.jusquau", { date: fmt({ day: "numeric", month: "long" }, dateDe(s.cloture)) }))}</p>` : ""}`;
  if (ouvert && (!aVote || enEdition)) {
    const type = s.multiple ? "checkbox" : "radio";
    return `<article class="carte">${tete}
      <form class="form-vote" data-id="${esc(s.id)}" novalidate>
        <fieldset class="choix"><legend class="cache">${esc(s.question)}</legend>
          ${s.options.map((o, i) => `<label><input type="${type}" name="choix" value="${i}"${aVote && v.mien.includes(i) ? " checked" : ""}> ${esc(o)}</label>`).join("")}
        </fieldset>
        <p class="petit gris">${te(s.anonyme ? "sondage.noteAnonyme" : "sondage.notePublic")}</p>
        <button class="btn plein" type="submit">${te(aVote ? "sondage.enregistrerVote" : "sondage.voter")}</button>
      </form></article>`;
  }
  const r = resultatsSondage(s, v);
  const total = Math.max(1, s.multiple ? r.votants : r.n.reduce((a, b) => a + b, 0));
  const voix = (i) => (!s.anonyme && v.tous ? v.tous.filter((x) => (x.choix || []).includes(i)) : []);
  return `<article class="carte">${tete}
    <div class="resultats">${s.options.map((o, i) => {
      const pct = Math.round((r.n[i] / total) * 100);
      const qui = voix(i);
      return `<div class="resultat${aVote && v.mien.includes(i) ? " mien" : ""}">
        <div class="resultat-tete"><span>${esc(o)}</span><strong>${pct} % · ${r.n[i]}</strong></div>
        <div class="barre"><span style="width:${pct}%"></span></div>
        ${qui.length ? `<p class="petit gris">${nomsDe(qui)}</p>` : ""}
      </div>`;
    }).join("")}</div>
    <p class="petit gris">${esc(t("sondage.votants", { n: r.votants }))}${s.anonyme ? " · " + te("sondage.majAnonyme") : ""}</p>
    ${aVote && ouvert ? `<button class="lien-btn" type="button" data-action="vote-modifier" data-id="${esc(s.id)}">${te("sondage.modifierVote")}</button>` : ""}
    ${!aVote && !ouvert ? `<p class="petit gris">${te("sondage.pasVote")}</p>` : ""}
  </article>`;
}
function pageSondages() {
  if (!estMembre()) return reserveMembres("sondage.titre");
  if (etat.sondages === null) return `<h1>${te("sondage.titre")}</h1>` + chargement();
  const ouverts = etat.sondages.filter(sondageOuvert);
  const clos = etat.sondages.filter((s) => !sondageOuvert(s));
  return `<h1>${te("sondage.titre")}</h1>${blocInfo()}
    ${ouverts.length ? ouverts.map(carteSondage).join("") : `<p class="gris">${te("sondage.aucunOuvert")}</p>`}
    ${clos.length ? `<h2>${te("sondage.termines")}</h2>${clos.map(carteSondage).join("")}` : ""}`;
}
async function voter(form) {
  const id = form.dataset.id;
  const s = (etat.sondages || []).find((x) => x.id === id);
  if (!s) return;
  const choix = new FormData(form).getAll("choix").map(Number).filter((i) => i >= 0 && i < s.options.length);
  if (!choix.length) { etat.info = { type: "erreur", texte: t("sondage.choisir") }; return afficher(false); }
  const p = etat.profil;
  const uid = etat.user.uid;
  const donnees = s.anonyme ? { choix, majLe: new Date().toISOString() } : { choix, prenom: p.prenom, nom: p.nom, majLe: new Date().toISOString() };
  // Le résultat s'affiche aussitôt avec mon vote ; il part ensuite au serveur.
  const avant = etat.votes[id];
  const tous = avant && avant.tous ? avant.tous.filter((x) => x.uid !== uid).concat(s.anonyme ? [] : [{ uid, ...donnees }]) : avant && avant.tous;
  etat.votes[id] = { mien: choix, tous };
  etat.voteEdition = null;
  etat.info = { type: "ok", texte: t("sondage.merci") };
  afficher(false);
  try { await setDoc(doc(db, "sondages", id, "votes", uid), donnees); }
  catch (e) { etat.votes[id] = avant; etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
}

/* ---------- Boîte à idées anonyme ---------- */
const CATEGORIES_IDEE = ["idee", "probleme", "remarque", "autre"];
function pageIdees() {
  if (!estMembre()) return reserveMembres("idee.titre");
  if (etat.ideeEnvoyee) {
    return `<h1>${te("idee.titre")}</h1><section class="carte centre-carte"><h2>${te("idee.merciTitre")}</h2><p>${te("idee.merci")}</p>
      <button class="btn contour" type="button" data-action="idee-autre">${te("idee.autre")}</button></section>`;
  }
  return `<h1>${te("idee.titre")}</h1>
    <section class="carte">
      <p>${te("idee.intro")}</p>
      <p class="petit gris">${esc(t("idee.anonymat", { club: nomClub(etat.profil.clubId) }))}</p>
      <div id="msg" aria-live="polite"></div>
      <form id="form-idee" novalidate>
        <div class="champ"><label for="categorie">${te("idee.categorie")}</label><select id="categorie" name="categorie">${CATEGORIES_IDEE.map((c) => `<option value="${c}">${te("idee.cat." + c)}</option>`).join("")}</select></div>
        <div class="champ"><label for="texte">${te("idee.texte")}</label><textarea id="texte" name="texte" rows="6" maxlength="3000" required></textarea></div>
        <button class="btn plein large" type="submit">${te("idee.envoyer")}</button>
      </form>
    </section>`;
}

/* ---------- Opportunités (stages, emplois…) ---------- */
const TYPES_OPP = ["stage", "emploi", "alternance", "benevolat", "autre"];
function carteOpportunite(o) {
  const expire = o.dateLimite && o.dateLimite < jourAujourdhui();
  const peut = etat.user && (o.auteur === etat.user.uid || estAdmin());
  const lien = lienSur(o.lien);
  return `<article class="carte">
    <p class="ligne-pastilles"><span class="pastille or">${te("opp.type." + (TYPES_OPP.includes(o.type) ? o.type : "autre"))}</span>${expire ? ` <span class="pastille contour">${te("opp.expiree")}</span>` : ""}</p>
    <h3>${esc(o.titre)}</h3>
    <p class="petit gris">${esc([o.organisation, o.lieu].filter(Boolean).join(" · "))}</p>
    ${o.dateLimite ? `<p class="petit">${esc(t("opp.jusquau", { date: fmt({ day: "numeric", month: "long", year: "numeric" }, dateDe(o.dateLimite)) }))}</p>` : ""}
    ${o.description ? `<p class="description court">${esc(o.description)}</p>` : ""}
    <div class="rangee">
      ${lien ? `<a class="btn contour petit-btn" href="${esc(lien)}" target="_blank" rel="noopener">${te("opp.voir")}</a>` : ""}
      ${o.contact ? `<a class="btn contour petit-btn" href="mailto:${esc(o.contact)}">${te("opp.contacter")}</a>` : ""}
    </div>
    <p class="petit gris">${esc(t("opp.par", { nom: o.auteurNom || "" }))}</p>
    ${peut ? `<div class="rangee actions-admin"><button class="lien-btn" type="button" data-action="opp-modifier" data-id="${esc(o.id)}">${te("admin.modifier")}</button><button class="lien-btn danger" type="button" data-action="opp-suppr" data-id="${esc(o.id)}">${te("supprimer")}</button></div>` : ""}
  </article>`;
}
function formOpportunite() {
  const o = etat.oppForm || {};
  const v = (k) => esc(o[k] ?? "");
  return `<section class="carte info">
    <h2>${te(o.id ? "opp.modifierTitre" : "opp.proposerTitre")}</h2>
    <div id="msg" aria-live="polite"></div>
    <form id="form-opp" novalidate>
      <div class="champ"><label for="o_titre">${te("opp.titreChamp")}</label><input id="o_titre" name="titre" maxlength="160" value="${v("titre")}" required></div>
      <div class="deux">
        <div class="champ"><label for="o_type">${te("opp.typeChamp")}</label><select id="o_type" name="type">${TYPES_OPP.map((x) => `<option value="${x}"${x === o.type ? " selected" : ""}>${te("opp.type." + x)}</option>`).join("")}</select></div>
        <div class="champ"><label for="o_limite">${te("opp.limite")}</label><input id="o_limite" name="dateLimite" type="date" value="${v("dateLimite")}"></div>
      </div>
      <div class="deux">
        <div class="champ"><label for="o_org">${te("opp.organisation")}</label><input id="o_org" name="organisation" maxlength="120" value="${v("organisation")}"></div>
        <div class="champ"><label for="o_lieu">${te("admin.lieu")}</label><input id="o_lieu" name="lieu" maxlength="120" value="${v("lieu")}"></div>
      </div>
      <div class="champ"><label for="o_desc">${te("opp.description")}</label><textarea id="o_desc" name="description" rows="5" maxlength="4000">${v("description")}</textarea></div>
      <div class="champ"><label for="o_lien">${te("opp.lien")}</label><input id="o_lien" name="lien" inputmode="url" value="${v("lien")}"></div>
      <div class="champ"><label for="o_contact">${te("opp.contact")}</label><input id="o_contact" name="contact" type="email" inputmode="email" value="${v("contact")}"></div>
      <button class="btn plein large" type="submit">${te(o.id ? "admin.enregistrerModifs" : "opp.publier")}</button>
      <button class="btn contour large" type="button" data-action="opp-annuler">${te("annuler")}</button>
    </form></section>`;
}
function pageOpportunites() {
  if (!estMembre()) return reserveMembres("opp.titre");
  if (etat.opportunites === null) return `<h1>${te("opp.titre")}</h1>` + chargement();
  const f = etat.filtreOpp;
  const liste = etat.opportunites.filter((o) => f === "tous" || o.type === f);
  const actives = liste.filter((o) => !o.dateLimite || o.dateLimite >= jourAujourdhui()).sort((a, b) => msTemps(b.createdAt) - msTemps(a.createdAt));
  const expirees = liste.filter((o) => o.dateLimite && o.dateLimite < jourAujourdhui());
  return `<h1>${te("opp.titre")}</h1>
    <p class="gris petit">${te("opp.intro")}</p>
    ${blocInfo()}
    ${etat.oppForm ? formOpportunite() : `<button class="btn or" type="button" data-action="opp-proposer">${te("opp.proposer")}</button>`}
    <div class="puces">${["tous"].concat(TYPES_OPP).map((x) => `<button type="button" class="puce ${f === x ? "actif" : ""}" data-action="filtre-opp" data-v="${x}">${te(x === "tous" ? "tous" : "opp.type." + x)}</button>`).join("")}</div>
    ${actives.length ? actives.map(carteOpportunite).join("") : `<p class="gris centre">${te("opp.aucune")}</p>`}
    ${expirees.length ? `<details class="carte"><summary>${esc(t("opp.expirees", { n: expirees.length }))}</summary>${expirees.map(carteOpportunite).join("")}</details>` : ""}`;
}
async function soumettreOpportunite(form, v) {
  if (!v.titre) return message(t("val.opp"));
  let lien = v.lien || "";
  if (lien && !/^https?:\/\//i.test(lien)) lien = "https://" + lien;
  const o = {
    titre: v.titre, type: TYPES_OPP.includes(v.type) ? v.type : "autre", organisation: v.organisation || "", lieu: v.lieu || "",
    description: v.description || "", lien, contact: v.contact || "", dateLimite: v.dateLimite || ""
  };
  // L'annonce apparaît aussitôt dans la liste ; elle part ensuite au serveur.
  const form0 = etat.oppForm || {};
  const existant = form0.id;
  const avant = etat.opportunites || [];
  const majLe = new Date().toISOString();
  const nouvelle = existant ? null : {
    ...o, auteur: etat.user.uid, auteurNom: `${etat.profil.prenom} ${etat.profil.nom}`, clubId: etat.profil.clubId || "", visibility: "members", majLe
  };
  const local = existant ? { ...(avant.find((x) => x.id === existant) || {}), ...o, majLe } : { ...nouvelle, id: "nouveau-" + versionImage(), createdAt: majLe };
  etat.opportunites = avant.filter((x) => x.id !== local.id).concat([local]);
  etat.oppForm = null;
  etat.info = { type: "ok", texte: t(existant ? "admin.modifOk" : "opp.ok", { titre: o.titre }) };
  afficher(false);
  try {
    if (existant) {
      await updateDoc(doc(db, "opportunites", existant), { ...o, majLe });
      journaliser("modification", "opportunites", o.titre, form0.clubId);
    } else {
      const ref = await addDoc(collection(db, "opportunites"), { ...nouvelle, createdAt: serverTimestamp() });
      local.id = ref.id;
      journaliser("creation", "opportunites", o.titre, etat.profil.clubId);
    }
    rafraichir();
  } catch (e) {
    etat.opportunites = avant; etat.oppForm = { ...form0, ...o };
    etat.info = { type: "erreur", texte: texteErreur(e) };
    afficher(false);
  }
}

/* ---------- Documents internes ---------- */
async function preparerDocument(id) {
  const d = (etat.documents || []).find((x) => x.id === id);
  if (!d || !d.fichier) return;
  etat.docsPrets[id] = "chargement";
  afficher(false);
  try {
    const s = await getDocs(collection(db, "documents", id, "morceaux"));
    const b64 = s.docs.map((x) => x.data()).sort((a, b) => a.n - b.n).map((x) => x.data).join("");
    const binaire = atob(b64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    etat.docsPrets[id] = URL.createObjectURL(new Blob([octets], { type: d.fichier.type || "application/octet-stream" }));
  } catch (e) { delete etat.docsPrets[id]; etat.info = { type: "erreur", texte: texteErreur(e) }; }
  afficher(false);
}
const tailleLisible = (o) => (o > 1048576 ? (o / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(o / 1024)) + " Ko");
function carteDocument(d) {
  const pret = etat.docsPrets[d.id];
  let action = "";
  if (d.fichier) {
    action = pret === "chargement" ? `<span class="petit gris">${te("chargement")}</span>`
      : pret ? `<a class="btn plein petit-btn" href="${pret}" target="_blank" rel="noopener" download="${esc(d.fichier.nom)}">${te("doc.ouvrir")}</a>`
        : `<button class="btn contour petit-btn" type="button" data-action="preparer-doc" data-id="${esc(d.id)}">${esc(t("doc.telecharger", { taille: tailleLisible(d.fichier.taille || 0) }))}</button>`;
  } else if (lienSur(d.lien)) action = `<a class="btn contour petit-btn" href="${esc(lienSur(d.lien))}" target="_blank" rel="noopener">${te("doc.ouvrirLien")}</a>`;
  return `<article class="carte">
    <p class="ligne-pastilles">${pastilleClub(d.clubId)} ${pastilleVis(d)}<span class="petit gris date">${esc(texteDatePublication(d.publieLe))}</span></p>
    <h3>${esc(d.titre)}</h3>
    ${d.description ? `<p class="petit">${esc(d.description)}</p>` : ""}
    <div class="rangee">${action}</div>
    ${estAdmin() && peutGerer(d.clubId) ? actionsAdmin("documents", d) : ""}
  </article>`;
}
function pageDocuments() {
  if (!estMembre()) return reserveMembres("doc.titre");
  if (etat.documents === null) return `<h1>${te("doc.titre")}</h1>` + chargement();
  const groupes = CATEGORIES_DOC.map((c) => [c, etat.documents.filter((d) => (CATEGORIES_DOC.includes(d.categorie) ? d.categorie : "autre") === c)
    .sort((a, b) => String(b.publieLe || "").localeCompare(String(a.publieLe || "")))]).filter(([, l]) => l.length);
  return `<h1>${te("doc.titre")}</h1>${blocInfo()}
    ${groupes.length ? groupes.map(([c, l]) => `<h2>${te("doc.cat." + c)}</h2>${l.map(carteDocument).join("")}`).join("") : `<p class="gris centre">${te("doc.aucun")}</p>`}
    ${estAdmin() ? `<p class="petit gris centre">${te("doc.ajouterAide")}</p>` : ""}`;
}

/* ---------- Contact : message, candidature, partenariat ---------- */
const TYPES_CONTACT = ["message", "candidature", "partenaire"];
const FORMULES = ["associate", "partenaire", "autre"];
function pageContact() {
  const type = TYPES_CONTACT.includes(param()) ? param() : "message";
  if (etat.contactEnvoye) {
    return `<h1>${te("contact.titre")}</h1><section class="carte centre-carte">
      <h2>${te(type === "message" ? "contact.okTitre" : "contact.okTitre2")}</h2>
      <p>${esc(t(type === "message" ? "contact.okTexte" : "contact.okTexte2", { cellule: nomCellule(etat.contactEnvoye) }))}</p>
      <button class="btn contour" type="button" data-action="contact-autre">${te("contact.autre")}</button></section>`;
  }
  const p = etat.profil;
  const choisi = etat.contactCellule || (p && club(p.clubId) ? p.clubId : CLUBS[0].id);
  const champ = (id, cle, attrs = "", valeur = "") => `<div class="champ"><label for="${id}">${te(cle)}</label><input id="${id}" name="${id}" ${attrs} value="${esc(valeur)}"></div>`;
  let specifiques = "";
  if (type === "message") {
    specifiques = `<div class="champ"><label for="objet">${te("contact.objet")}</label><select id="objet" name="objet">${OBJETS.map((o) => `<option value="${o}">${te("contact." + o)}</option>`).join("")}</select></div>
      <div class="champ"><label for="c_message">${te("contact.message")}</label><textarea id="c_message" name="message" rows="5" maxlength="4000" required></textarea></div>`;
  } else if (type === "candidature") {
    specifiques = `${champ("telephone", "parcours.telephone", 'type="tel" autocomplete="tel" maxlength="30"')}
      <div class="deux">${champ("ecole", "cand.ecole", 'maxlength="120"')}${champ("filiere", "cand.filiere", 'maxlength="120"')}</div>
      ${champ("annee", "cand.annee", 'maxlength="60" placeholder="BA2, MA1…"')}
      <div class="champ"><label for="team">${te("cand.team")}</label><select id="team" name="team">${optionsPoles()}</select></div>
      ${champ("linkedin", "parcours.linkedin", 'inputmode="url" maxlength="200"')}
      <div class="champ"><label for="c_message">${te("cand.motivation")}</label><textarea id="c_message" name="message" rows="6" maxlength="4000" required></textarea></div>`;
  } else {
    specifiques = `${champ("organisation", "part.organisation", 'maxlength="120" autocomplete="organization"')}
      ${champ("fonction", "part.fonction", 'maxlength="120"')}
      ${champ("telephone", "parcours.telephone", 'type="tel" autocomplete="tel" maxlength="30"')}
      <fieldset class="choix"><legend>${te("part.formule")}</legend>${FORMULES.map((f, i) => `<label><input type="radio" name="formule" value="${f}"${i === 0 ? " checked" : ""}> ${te("part.f." + f)}</label>`).join("")}</fieldset>
      <div class="champ"><label for="c_message">${te("contact.message")}</label><textarea id="c_message" name="message" rows="5" maxlength="4000" required></textarea></div>`;
  }
  return `<h1>${te("contact.titre")}</h1>
    <div class="onglets">${TYPES_CONTACT.map((x) => `<a href="#/contact/${x}" class="${x === type ? "actif" : ""}">${te("contact.type." + x)}</a>`).join("")}</div>
    ${type !== "message" ? `<p class="gris petit">${te("contact.intro." + type)}</p>` : ""}
    <section class="carte">
      <div id="msg" aria-live="polite"></div>
      <form id="form-contact" data-type="${type}" novalidate>
        <fieldset class="choix"><legend>${te("contact.cellule")}</legend>
          ${CLUBS.map((c) => `<label><input type="radio" name="clubId" value="${c.id}"${c.id === choisi ? " checked" : ""}> <span><strong>${esc(nomCellule(c.id))}</strong> · ${esc(c.nom)}</span></label>`).join("")}
        </fieldset>
        <div class="champ"><label for="c_nom">${te("contact.nom")}</label><input id="c_nom" name="nom" autocomplete="name" maxlength="120" value="${esc(p ? p.prenom + " " + p.nom : "")}" required></div>
        <div class="champ"><label for="c_email">${te("email")}</label><input id="c_email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="160" value="${esc(etat.user ? etat.user.email : "")}" required></div>
        ${specifiques}
        <div class="cache" aria-hidden="true"><label for="site">Site</label><input id="site" name="site" tabindex="-1" autocomplete="off"></div>
        <button class="btn plein large" type="submit">${te(type === "message" ? "contact.envoyer" : "contact.envoyer2")}</button>
        <p class="petit gris">${te("contact.note")}</p>
      </form>
    </section>`;
}
async function soumettreContact(form, v) {
  if (v.site) return; // champ piège rempli par un robot
  const type = form.dataset.type || "message";
  if (!v.clubId || !v.nom || !v.message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email || "")) return message(t("val.contact"));
  const m = { clubId: v.clubId, nom: v.nom, email: v.email, objet: type === "message" ? (v.objet || "o5") : type, message: v.message, creeLe: new Date().toISOString() };
  if (v.telephone) m.telephone = v.telephone.slice(0, 30);
  if (type === "candidature") m.details = { ecole: v.ecole || "", filiere: v.filiere || "", annee: v.annee || "", team: v.team || "", linkedin: v.linkedin || "" };
  if (type === "partenaire") m.details = { organisation: v.organisation || "", fonction: v.fonction || "", formule: v.formule || "" };
  if (etat.user) m.uid = etat.user.uid;
  occupe(form, true);
  try {
    await addDoc(collection(db, "messages"), m);
    etat.contactEnvoye = v.clubId; etat.messages = null;
    afficher();
  } catch (e) { message(texteErreur(e)); occupe(form, false); }
}

/* ---------- Messages, candidatures et boîte à idées (admin) ---------- */
function chargerIdees() {
  return uneFois("idees", async () => {
    try { etat.idees = await recents("idees", "creeLe", 200); }
    catch (e) { etat.idees = []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
    rafraichir();
  });
}
const typeMessage = (m) => (m.objet === "candidature" || m.objet === "partenaire" ? m.objet : "message");
function adminMessages() {
  const f = etat.filtreMessages;
  const filtres = ["tous", "message", "candidature", "partenaire", "idees"];
  const puces = `<div class="puces">${filtres.map((x) => `<button type="button" class="puce ${f === x ? "actif" : ""}" data-action="filtre-messages" data-v="${x}">${te("admin.msgFiltre." + x)}</button>`).join("")}</div>`;
  if (f === "idees") {
    if (etat.idees === null) { chargerIdees(); return puces + chargement(); }
    const carte = (i) => `<article class="carte">
        <p class="ligne-pastilles">${pastilleClub(i.clubId)} <span class="pastille contour">${te("idee.cat." + (CATEGORIES_IDEE.includes(i.categorie) ? i.categorie : "autre"))}</span><span class="petit gris date">${esc(texteDatePublication(i.creeLe))}</span></p>
        <p class="description">${esc(i.texte)}</p>
        <button class="lien-btn danger" type="button" data-action="suppr-idee" data-id="${esc(i.id)}">${te("supprimer")}</button>
      </article>`;
    return `${puces}<p class="petit gris">${te("admin.ideesAide")}</p>${etat.idees.length ? etat.idees.map(carte).join("") : `<p class="gris">${te("admin.ideesAucune")}</p>`}`;
  }
  if (etat.messages === null) { chargerMessages(); return puces + chargement(); }
  const details = (m) => {
    const d = m.details && typeof m.details === "object" ? m.details : {};
    const lignes = Object.entries(d).filter(([, x]) => x).map(([k, x]) => `<p class="petit"><strong>${te("det." + k)}</strong> ${k === "formule" ? te("part.f." + (FORMULES.includes(x) ? x : "autre")) : esc(x)}</p>`);
    if (m.telephone) lignes.unshift(`<p class="petit"><strong>${te("parcours.telephone")} :</strong> <a href="tel:${esc(String(m.telephone).replace(/[^+\d]/g, ""))}">${esc(m.telephone)}</a></p>`);
    return lignes.join("");
  };
  const libelle = (m) => (typeMessage(m) === "message" ? te("contact." + (OBJETS.includes(m.objet) ? m.objet : "o5")) : te("contact.type." + typeMessage(m)));
  const carte = (m) => `<article class="carte">
      <p class="ligne-pastilles">${pastilleClub(m.clubId)} <span class="pastille ${typeMessage(m) === "message" ? "contour" : "or"}">${libelle(m)}</span><span class="petit gris date">${esc(texteDatePublication(m.creeLe))}</span></p>
      <p><strong>${esc(m.nom)}</strong></p>
      ${details(m)}
      <p class="description">${esc(m.message)}</p>
      <div class="rangee">
        <a class="btn contour petit-btn" href="mailto:${esc(m.email)}">${te("admin.msgRepondre")}</a>
        <button class="lien-btn danger" type="button" data-action="suppr-message" data-id="${esc(m.id)}">${te("supprimer")}</button>
      </div>
      <p class="petit gris">${esc(m.email)}</p>
    </article>`;
  const liste = etat.messages.filter((m) => f === "tous" || typeMessage(m) === f);
  return `${puces}<p class="petit gris">${te("admin.msgAide")}</p>${liste.length ? liste.map(carte).join("") : `<p class="gris">${te("admin.msgAucun")}</p>`}`;
}

/* ---------- Suivi : statistiques et historique ---------- */
function chargerHistorique() {
  etat.historique = "chargement";
  return uneFois("historique", async () => {
    try { etat.historique = await recents("historique", "quand", 150); } catch (e) { etat.historique = []; }
    rafraichir();
  });
}
function chargerStats() {
  etat.stats = "chargement";
  return uneFois("stats", async () => {
    try { const s = await getDoc(doc(db, "stats", "global")); etat.stats = s.exists() ? s.data() : {}; } catch (e) { etat.stats = {}; }
    rafraichir();
  });
}
function adminSuivi() {
  if (etat.membres === null) { chargerMembres(); return chargement(); }
  if (etat.historique === null) chargerHistorique();
  if (etat.stats === null) chargerStats();
  const clubs = estSuper() ? CLUBS : CLUBS.filter((c) => c.id === etat.profil.clubId);
  const pers = personnesGestion();
  const ligneClub = (c) => {
    const l = pers.filter((u) => u.clubId === c.id);
    return `<tr><th scope="row">${esc(nomCourt(c.id))}</th><td>${l.filter((u) => u.statut !== "alumni").length}</td><td>${l.filter((u) => u.statut === "alumni").length}</td><td>${l.filter((u) => u.board).length}</td></tr>`;
  };
  const publics = (etat.membres || []).filter((u) => u.role === "pending").length;
  const stats = etat.stats && etat.stats !== "chargement" ? etat.stats : {};
  const ilYaUnAn = jourISO(new Date(Date.now() - 365 * 86400000));
  const passes = (etat.events || []).filter((e) => peutGerer(e.clubId) && statut(e) === "passes" && e.debut.slice(0, 10) >= ilYaUnAn)
    .sort((a, b) => debutComplet(b).localeCompare(debutComplet(a))).slice(0, 25);
  passes.forEach((e) => demanderReponses(e.id));
  const lignesEv = passes.map((e) => {
    const r = etat.reponses[e.id];
    const n = r && !r.chargement ? compteReponses(r) : null;
    return `<tr><th scope="row">${esc(e.titre)}<br><span class="petit gris">${esc(fmt({ day: "numeric", month: "short", year: "numeric" }, dateDe(e.debut)))}</span></th><td>${n ? n.oui : "…"}</td><td>${n ? n.peutetre : "…"}</td><td>${e.places || "—"}</td></tr>`;
  }).join("");
  const charges = passes.map((e) => etat.reponses[e.id]).filter((r) => r && !r.chargement);
  const moyenne = charges.length ? Math.round(charges.reduce((s, r) => s + compteReponses(r).oui, 0) / charges.length) : 0;
  const hist = Array.isArray(etat.historique) ? etat.historique : [];
  const ouverts = (etat.sondages || []).filter((s) => peutGerer(s.clubId) && sondageOuvert(s)).length;
  return `<section class="carte">
      <h2>${te("stats.membres")}</h2>
      <div class="tableau"><table><thead><tr><th></th><th>${te("stats.actifs")}</th><th>${te("badge.alumni")}</th><th>${te("badge.board")}</th></tr></thead><tbody>${clubs.map(ligneClub).join("")}</tbody></table></div>
      <p class="petit gris">${esc(t("stats.publics", { n: publics }))}</p>
    </section>
    <section class="chiffres">
      <div><strong>${stats.abonnes ?? "—"}</strong><span>${te("stats.abonnes")}</span></div>
      <div><strong>${(etat.events || []).filter((e) => peutGerer(e.clubId) && statut(e) !== "passes").length}</strong><span>${te("stats.aVenir")}</span></div>
      <div><strong>${ouverts}</strong><span>${te("stats.sondages")}</span></div>
      <div><strong>${(etat.opportunites || []).length}</strong><span>${te("stats.opps")}</span></div>
    </section>
    ${stats.majLe ? `<p class="petit gris">${esc(t("stats.majAbonnes", { date: texteDatePublication(stats.majLe) }))}</p>` : ""}
    <section class="carte">
      <h2>${te("stats.participation")}</h2>
      ${passes.length ? `<p class="petit">${esc(t("stats.moyenne", { n: moyenne }))}</p>
        <div class="tableau"><table><thead><tr><th>${te("stats.evenement")}</th><th>${te("rsvp.oui")}</th><th>${te("rsvp.peutetre")}</th><th>${te("stats.places")}</th></tr></thead><tbody>${lignesEv}</tbody></table></div>` : `<p class="gris">${te("stats.aucunPasse")}</p>`}
    </section>
    <section class="carte">
      <h2>${te("hist.titre")}</h2>
      ${etat.historique === "chargement" || etat.historique === null ? chargement() : hist.length ? `<ul class="historique">${hist.map((h) => `<li><span class="petit gris">${esc(new Date(h.quand).toLocaleString(LOCALES[etat.langue], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}</span> <strong>${esc(h.nom)}</strong> · ${[te("hist.action." + h.action), te("hist.cible." + h.cible)].filter(Boolean).join(" ")}${h.titre ? ` « ${esc(h.titre)} »` : ""}</li>`).join("")}</ul>` : `<p class="gris">${te("hist.vide")}</p>`}
    </section>`;
}

/* ---------- Outils du super-administrateur : fin d'année, boards, sauvegarde ---------- */
function personnesGestion() {
  const comptes = (etat.membres || []).filter((u) => ROLES_MEMBRES.includes(u.role)).map((u) => ({ ...u, cle: "u:" + u.uid }));
  const pris = new Set(comptes.filter((u) => u.visibleAnnuaire || u.ficheRecuperee).map((u) => String(u.email || "").toLowerCase()));
  const fiches = (etat.fiches || []).filter((f) => !f.email || !pris.has(f.email)).map((f) => ({ ...f, cle: "f:" + f.id }));
  return comptes.concat(fiches);
}
function adminFinAnnee() {
  const actifs = personnesGestion().filter((u) => u.statut !== "alumni").sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
  return `<section class="carte">
    <h2>${te("fin.titre")}</h2>
    <p class="gris petit">${te("fin.aide")}</p>
    <form id="form-fin-annee" novalidate>
      <div class="champ"><label for="anneeFin">${te("fin.annee")}</label><input id="anneeFin" name="annee" maxlength="9" value="${esc(anneeAcademique())}"></div>
      <label class="case-coche"><input type="checkbox" name="archiver" checked> <span>${te("fin.archiver")}</span></label>
      <label class="case-coche"><input type="checkbox" name="retirerBoard"> <span>${te("fin.retirerBoard")}</span></label>
      <fieldset class="choix"><legend>${esc(t("fin.sortants", { n: actifs.length }))}</legend>
        ${actifs.map((u) => `<label><input type="checkbox" name="alumni" value="${esc(u.cle)}"> <span>${esc(u.prenom)} ${esc(u.nom)} <span class="petit gris">· ${esc(nomCourt(u.clubId || ""))}${u.poste ? " · " + esc(u.poste) : ""}</span></span></label>`).join("")}
      </fieldset>
      <button class="btn plein large" type="submit">${te("fin.appliquer")}</button>
    </form></section>`;
}
async function soumettreFinAnnee(form, v) {
  const choisis = new Set(new FormData(form).getAll("alumni"));
  const archiver = form.elements.archiver.checked;
  const retirerBoard = form.elements.retirerBoard.checked;
  if (!/^\d{4}-\d{4}$/.test(v.annee || "")) return message(t("val.anneeAcad"));
  if (!window.confirm(t("fin.confirmer", { n: choisis.size }))) return;
  occupe(form, true);
  let n = 0;
  try {
    await chargerMembres(); // on repart des fiches à jour
    for (const u of personnesGestion().filter((x) => x.statut !== "alumni")) {
      const maj = {};
      const parcours = Array.isArray(u.parcours) ? [...u.parcours] : [];
      if (archiver && (u.poste || u.pole) && !parcours.some((x) => x.annee === v.annee && x.poste === (u.poste || "") && x.pole === (u.pole || ""))) {
        parcours.push({ annee: v.annee, pole: u.pole || "", poste: u.poste || "" });
        maj.parcours = parcours;
      }
      if (choisis.has(u.cle)) Object.assign(maj, { statut: "alumni", pole: "", poste: "" });
      if (retirerBoard && u.board) maj.board = false;
      if (!Object.keys(maj).length) continue;
      const [type, id] = u.cle.split(":");
      await updateDoc(doc(db, type === "u" ? "users" : "fiches", id), maj);
      n++;
    }
    journaliser("finAnnee", "users", v.annee, "");
    etat.membres = null; etat.fiches = null;
    etat.info = { type: "ok", texte: t("fin.ok", { n }) };
    afficher();
  } catch (e) { message(texteErreur(e)); occupe(form, false); }
}
const boardsAffiches = () => (etat.boards && etat.boards.length ? etat.boards : BOARDS.map((b) => ({ ...b, clubId: "bruxelles", membres: b.membres.map(([nom, poste]) => ({ nom, poste })) })))
  .slice().sort((a, b) => String(b.annee).localeCompare(String(a.annee)));
function pageBoard() {
  const tous = boardsAffiches();
  const clubsPresents = [...new Set(tous.map((b) => b.clubId))].filter((c) => club(c));
  const f = clubsPresents.includes(etat.filtreBoard) ? etat.filtreBoard : clubsPresents[0];
  const liste = tous.filter((b) => b.clubId === f);
  const bloc = (b) => `${imageOuChemin(b.image) ? photoStatique(imageOuChemin(b.image), esc(t("board.altImage", { annee: b.annee })), "photo") : ""}
    <div class="liste">${(b.membres || []).map((m) => `<div class="ligne"><span class="txt"><strong>${esc(m.nom)}</strong><span>${esc(m.poste)}</span></span></div>`).join("")}</div>`;
  if (!liste.length) return `<h1>${te("board.titre")}</h1><p class="gris">${te("board.aucun")}</p>`;
  const [actuel, ...anciens] = liste;
  return `<h1>${te("board.titre")}</h1>
    ${clubsPresents.length > 1 ? `<div class="puces">${clubsPresents.map((c) => `<button type="button" class="puce ${c === f ? "actif" : ""}" data-action="filtre-board" data-v="${c}">${esc(nomCourt(c))}</button>`).join("")}</div>` : ""}
    <p class="gris">${esc(nomClub(f))} · ${esc(actuel.annee)}</p>
    ${bloc(actuel)}
    ${anciens.length ? `<h2>${te("board.anciens")}</h2>${anciens.map((b) => `<details class="carte"><summary>${esc(t("board.annee", { annee: b.annee }))}</summary>${bloc(b)}</details>`).join("")}` : ""}`;
}
function adminBoards() {
  const enBase = etat.boards && etat.boards.length;
  const b = etat.boardForm;
  const formulaire = b ? `<form id="form-board" novalidate>
      <h3>${te(b.id ? "boardAdm.modifier" : "boardAdm.nouveau")}</h3>
      <div class="deux">
        <div class="champ"><label for="b_annee">${te("fin.annee")}</label><input id="b_annee" name="annee" maxlength="9" value="${esc(b.annee || anneeAcademique())}"></div>
        <div class="champ"><label for="b_club">${te("admin.club")}</label><select id="b_club" name="clubId">${optionsClubs(b.clubId || "bruxelles")}</select></div>
      </div>
      <div class="champ"><label for="b_membres">${te("boardAdm.membres")}</label><textarea id="b_membres" name="membres" rows="7">${esc((b.membres || []).map((m) => `${m.nom} ; ${m.poste}`).join("\n"))}</textarea><span class="aide">${te("boardAdm.membresAide")}</span></div>
      <div class="champ"><label for="b_image">${te("boardAdm.image")}</label>
        ${imageOuChemin(b.image) ? `<img class="apercu-image" src="${imageOuChemin(b.image)}" alt="">` : ""}
        <input id="b_image" type="file" accept="image/*" data-change="image-board"></div>
      <button class="btn plein large" type="submit">${te("enregistrer")}</button>
      <button class="btn contour large" type="button" data-action="board-annuler">${te("annuler")}</button>
    </form>` : `<button class="btn or" type="button" data-action="board-nouveau">${te("boardAdm.ajouter")}</button>`;
  return `<section class="carte">
    <h2>${te("boardAdm.titre")}</h2>
    <p class="gris petit">${te("boardAdm.aide")}</p>
    ${enBase ? "" : `<p class="petit">${te("boardAdm.importerAide")}</p><button class="btn contour" type="button" data-action="board-importer">${te("boardAdm.importer")}</button>`}
    ${enBase ? `<div class="liste">${boardsAffiches().map((x) => `<div class="ligne"><span class="txt"><strong>${esc(x.annee)}</strong><span>${esc(nomClub(x.clubId))} · ${esc(t("boardAdm.nb", { n: (x.membres || []).length }))}</span></span>
      <button class="lien-btn" type="button" data-action="board-modifier" data-id="${esc(x.id)}">${te("admin.modifier")}</button>
      <button class="lien-btn danger" type="button" data-action="board-suppr" data-id="${esc(x.id)}">${te("supprimer")}</button></div>`).join("")}</div>` : ""}
    ${enBase ? formulaire : ""}
  </section>`;
}
function lireFormBoard(form) {
  const v = Object.fromEntries(new FormData(form).entries());
  const membres = String(v.membres || "").split(/\r?\n/).map((l) => l.split(/\s*[;–—|]\s*|\s+-\s+/)).filter((p) => p[0] && p[0].trim())
    .map((p) => ({ nom: p[0].trim().slice(0, 80), poste: (p.slice(1).join(" ") || "").trim().slice(0, 80) })).slice(0, 30);
  return { ...(etat.boardForm || {}), annee: String(v.annee || "").trim(), clubId: v.clubId || "bruxelles", membres };
}
async function soumettreBoard(form) {
  const b = lireFormBoard(form);
  if (!/^\d{4}-\d{4}$/.test(b.annee)) return message(t("val.anneeAcad"));
  if (!b.membres.length) return message(t("val.boardMembres"));
  const id = b.id || `${b.clubId}-${b.annee}`;
  occupe(form, true);
  try {
    const fiche = { annee: b.annee, clubId: b.clubId, membres: b.membres, image: imageOuChemin(b.image) || "" };
    await setDoc(doc(db, "boards", id), fiche);
    journaliser(b.id ? "modification" : "creation", "boards", b.annee, b.clubId);
    etat.boardForm = null;
    etat.boards = (etat.boards || []).filter((x) => x.id !== id).concat([{ ...fiche, id }]);
    etat.info = { type: "ok", texte: t("boardAdm.ok", { annee: b.annee }) };
    afficher();
  } catch (e) { message(texteErreur(e)); occupe(form, false); }
}
async function sauvegarder(bouton) {
  const libelle = bouton.textContent;
  bouton.disabled = true;
  const res = { date: new Date().toISOString(), projet: "madiba-club", note: t("save.note") };
  const lireTout = async (...chemin) => {
    try { return (await getDocs(collection(db, ...chemin))).docs.map((d) => ({ id: d.id, ...d.data() })); }
    catch (e) { return { erreur: (e && e.code) || String(e) }; }
  };
  const cols = ["users", "fiches", "events", "news", "journaux", "sondages", "documents", "opportunites", "messages", "idees", "boards", "historique", "public", "config", "stats"];
  for (const c of cols) { bouton.textContent = t("save.encours", { c }); res[c] = await lireTout(c); }
  for (const e of Array.isArray(res.events) ? res.events : []) e._reponses = await lireTout("events", e.id, "reponses");
  for (const s of Array.isArray(res.sondages) ? res.sondages : []) if (!s.anonyme) s._votes = await lireTout("sondages", s.id, "votes");
  telecharger(`sauvegarde-madiba-${jourAujourdhui()}.json`, JSON.stringify(res, null, 1), "application/json");
  journaliser("sauvegarde", "sauvegarde", "", "");
  bouton.textContent = libelle; bouton.disabled = false;
}
// Allège en une fois toutes les images déjà enregistrées (à faire une fois, depuis un ordinateur).
async function optimiserImages(bouton) {
  if (!window.confirm(t("opt.confirmer"))) return;
  const libelle = bouton.textContent;
  bouton.disabled = true;
  let n = 0, gain = 0;
  const etape = (cle) => { bouton.textContent = t("opt.encours", { quoi: t(cle), n }); };
  const lireTout = async (...c) => (await getDocs(collection(db, ...c))).docs;
  const compter = (avant, apres) => { if (apres.length < avant.length) { gain += avant.length - apres.length; n++; } };
  try {
    // 1. Couvertures : rangées à part (téléchargées seulement quand on les voit), en WebP, avec une miniature.
    for (const col of ["events", "news"]) {
      etape("opt." + col);
      await parLots(await lireTout(col), async (d) => {
        const x = d.data();
        if (!imageSure(x.image)) return;
        const image = await reencoder(x.image, 1200, 320000, 0.8);
        const imageId = "c" + versionImage() + nouvelId().slice(0, 4);
        const miniature = await miniatureDe(image);
        await setDoc(doc(db, col, d.id, "media", imageId), { image });
        await updateDoc(doc(db, col, d.id), { imageId, miniature, image: deleteField() });
        compter(x.image, miniature);
      }, 3);
    }
    // 2. Photos de comptes rendus et pages de journaux : en WebP (gardées telles quelles si ce n'est pas plus léger).
    if (webpOk) {
      etape("opt.photos");
      for (const e of await lireTout("events")) {
        if (!e.data().nbPhotos) continue;
        await parLots(await lireTout("events", e.id, "photos"), async (p) => {
          const x = p.data(), image = await reencoder(x.image, 1400, 320000, 0.8);
          if (image !== x.image) { await setDoc(doc(db, "events", e.id, "photos", p.id), { ...x, image }); compter(x.image, image); }
        }, 3);
      }
      etape("opt.pages");
      for (const j of await lireTout("journaux")) {
        await parLots(await lireTout("journaux", j.id, "pages"), async (p) => {
          const x = p.data(), image = await reencoder(x.image, 1100, 820000, 0.74);
          if (image !== x.image) { await setDoc(doc(db, "journaux", j.id, "pages", p.id), { ...x, image }); compter(x.image, image); }
        }, 2);
      }
    }
    // 3. Vignettes des journaux et photos de profil.
    etape("opt.journaux");
    await parLots(await lireTout("journaux"), async (d) => {
      const x = d.data(), c = await reencoder(x.couverture, 168, 20000, 0.75);
      if (c !== x.couverture) { await updateDoc(doc(db, "journaux", d.id), { couverture: c }); compter(x.couverture, c); }
    });
    etape("opt.profils");
    for (const col of ["users", "fiches"]) {
      await parLots(await lireTout(col), async (d) => {
        const x = d.data(), ph = await reencoder(x.photo, 0, 40000, 0.8, 160);
        if (ph !== x.photo) { await updateDoc(doc(db, col, d.id), { photo: ph }); compter(x.photo, ph); }
      });
    }
    etape("opt.boards");
    await parLots(await lireTout("boards"), async (d) => {
      const x = d.data();
      if (!imageSure(x.image)) return;
      const im = await reencoder(x.image, 1100, 320000, 0.8);
      if (im !== x.image) { await updateDoc(doc(db, "boards", d.id), { image: im }); compter(x.image, im); }
    });
    journaliser("images", "outils", String(n), "");
    etat.info = { type: "ok", texte: t("opt.ok", { n, mo: (gain * 0.75 / 1e6).toFixed(1).replace(".", ",") }) };
    etat.membres = null; etat.fiches = null;
    ecrireLocal(cleVu("users"), ""); ecrireLocal(cleVu("fiches"), "");
    chargerContenus(true);
  } catch (e) { etat.info = { type: "erreur", texte: t("opt.erreur", { n }) + " " + texteErreur(e) }; }
  bouton.textContent = libelle; bouton.disabled = false;
  afficher(false);
}
async function exporterAnnuaire() {
  if (etat.membres === null) await chargerMembres();
  const lignes = [[t("prenom"), t("nom"), t("export.club"), t("export.statut"), t("badge.board"), t("badge.fondateur"), t("email"), t("parcours.telephone"), t("parcours.naissance"), t("parcours.entree"), t("parcours.poleActuel"), t("parcours.posteActuel"), t("parcours.etudes"), t("parcours.linkedin"), t("parcours.entreprise")]];
  personnesGestion()
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom)))
    .forEach((u) => lignes.push([u.prenom, u.nom, club(u.clubId) ? nomCourt(u.clubId) : "", u.statut === "alumni" ? t("badge.alumni") : t("badge.actif"), u.board ? "✓" : "", u.fondateur ? "✓" : "", u.email, u.telephone, u.naissance, u.anneeEntree, u.pole, u.poste, u.etudes, u.linkedin, u.entreprise]));
  telecharger(`annuaire-madiba-${jourAujourdhui()}.csv`, csv(lignes), "text/csv;charset=utf-8");
}
function adminOutils() {
  if (!estSuper()) return "";
  if (etat.membres === null) { chargerMembres(); return chargement(); }
  return `${adminFinAnnee()}${adminBoards()}
    <section class="carte">
      <h2>${te("opt.titre")}</h2>
      <p class="gris petit">${te("opt.aide")}</p>
      ${webpOk ? "" : `<p class="petit">${te("opt.webpNon")}</p>`}
      <button class="btn plein" type="button" data-action="optimiser-images">${te("opt.bouton")}</button>
    </section>
    <section class="carte">
      <h2>${te("save.titre")}</h2>
      <p class="gris petit">${te("save.aide")}</p>
      <button class="btn plein" type="button" data-action="sauvegarder">${te("save.bouton")}</button>
      <button class="btn contour" type="button" data-action="export-annuaire">${te("save.annuaire")}</button>
    </section>`;
}

/* ---------- Espace admin ---------- */
function pageAdmin() {
  if (!estAdmin()) return `<h1>${te("admin.titre")}</h1><section class="carte"><p>${te("admin.reserve")}</p></section>`;
  const onglets = ["publier", "contenus", "membres", "messages", "suivi"].concat(estSuper() ? ["codes", "outils"] : []);
  if (!onglets.includes(etat.adminOnglet)) etat.adminOnglet = "publier";
  const corps = { publier: adminPublier, contenus: adminContenus, membres: adminMembres, messages: adminMessages, suivi: adminSuivi, codes: adminCodes, outils: adminOutils }[etat.adminOnglet]();
  return `<h1>${te("admin.titre")}</h1>
    <p class="petit gris">${estSuper() ? te("admin.tous") : te("admin.vousGerez") + " " + esc(nomClub(etat.profil.clubId))}</p>
    <div class="onglets defile">${onglets.map((v) => `<button type="button" class="${etat.adminOnglet === v ? "actif" : ""}" data-action="onglet-admin" data-v="${v}">${te("admin.onglet." + v)}</button>`).join("")}</div>
    ${blocInfo()}${corps}`;
}

/* ---------- Plus ---------- */
function pagePlus() {
  const ligne = (tt, s, pastille) => `<div class="ligne inactif"><span class="txt"><strong>${esc(tt)}</strong><span>${esc(s)}</span></span><span class="pastille">${esc(pastille)}</span></div>`;
  const lien = (href, tt, s) => `<a class="ligne" href="${href}"><span class="txt"><strong>${esc(tt)}</strong><span>${esc(s)}</span></span>${ico("fleche")}</a>`;
  const membre = (href, cleT, cleS) => (estMembre() ? lien(href, t(cleT), t(cleS)) : ligne(t(cleT), t(cleS), t("plus.reserve")));
  return `<h1>${te("nav.plus")}</h1>
    <div class="surtitre">${te("plus.monEspace")}</div>
    <div class="liste">
      ${etat.user ? lien("#/compte", t("compte.titre"), etat.user.email || "") : lien("#/connexion", t("seConnecter"), t("plus.ouCreer"))}
      ${estAdmin() ? lien("#/admin", t("admin.titre"), t("plus.adminSous")) : ""}
    </div>
    <div class="surtitre">${te("plus.membres")}</div>
    <div class="liste">
      ${membre("#/annuaire", "annuaire.titre", "plus.annuaireSous")}
      ${membre("#/anniversaires", "anniv.titre", "plus.annivSous")}
      ${membre("#/opportunites", "opp.titre", "plus.oppSous")}
      ${membre("#/sondages", "sondage.titre", "plus.sondagesSous")}
      ${membre("#/documents", "doc.titre", "plus.docsSous")}
      ${membre("#/idees", "idee.titre", "plus.ideesSous")}
    </div>
    <div class="surtitre">${te("plus.reseau")}</div>
    <div class="liste">
      ${lien("#/board", t("board.titre"), t("plus.boardSous"))}
      ${lien("#/fondateurs", t("plus.fondateurs"), t("plus.fondateursSous"))}
      ${lien("#/contact/candidature", t("contact.type.candidature"), t("plus.candSous"))}
      ${lien("#/contact/partenaire", t("contact.type.partenaire"), t("plus.partSous"))}
      ${lien("#/contact", t("plus.contact"), t("plus.contactSous"))}
    </div>
    ${blocNotifications()}
    <div class="surtitre">${te("acc.suivre")}</div>
    ${blocReseaux()}
    <div class="surtitre">${te("langue.titre")}</div>
    <div class="puces">${LANGUES.map((l) => `<button type="button" class="puce ${etat.langue === l ? "actif" : ""}" data-action="langue" data-v="${l}">${te("langue." + l)}</button>`).join("")}</div>`;
}
function blocSondagesAccueil() {
  if (!estMembre() || !etat.sondages) return "";
  const n = etat.sondages.filter(sondageOuvert).length;
  return n ? `<a class="carte info anniv-jour" href="#/sondages"><span class="surtitre">${te("sondage.titre")}</span><strong>${esc(t("sondage.enCours", { n }))}</strong><span class="petit">${te("sondage.donnerAvis")}</span></a>` : "";
}

/* ---------- Gestion des formulaires, boutons et fichiers ---------- */
const FORMULAIRES = {
  "form-event": soumettreEvent,
  "form-news": soumettreNews,
  "form-journal": soumettreJournal,
  "form-sondage": soumettreSondage,
  "form-document": soumettreDocument,
  "form-opp": soumettreOpportunite,
  "form-contact": soumettreContact,
  "form-fin-annee": soumettreFinAnnee,
  "form-board": (form) => soumettreBoard(form),
  "form-idee": async (form, v) => {
    if (!v.texte) return message(t("val.idee"));
    // Merci affiché tout de suite ; si l'envoi échoue, le texte revient dans le formulaire.
    etat.ideeEnvoyee = true;
    afficher();
    try {
      await addDoc(collection(db, "idees"), { clubId: etat.profil.clubId, texte: v.texte.slice(0, 3000), categorie: CATEGORIES_IDEE.includes(v.categorie) ? v.categorie : "autre", creeLe: new Date().toISOString() });
      etat.idees = null;
    } catch (e) {
      etat.ideeEnvoyee = false; afficher();
      const f = document.getElementById("form-idee");
      if (f) { f.elements.texte.value = v.texte; f.elements.categorie.value = v.categorie; }
      message(texteErreur(e));
    }
  }
};
const ACTIONS = {
  "type": (el, v) => { reinitialiserPublication(); etat.typePublication = v; afficher(false); },
  "modifier": (el) => preparerEdition(el.dataset.col, el.dataset.id, false),
  "dupliquer": (el) => preparerEdition(el.dataset.col, el.dataset.id, true),
  "annuler-edition": () => { reinitialiserPublication(); etat.adminOnglet = "contenus"; afficher(); },
  "image-suppr": (el) => { capturerForm(el.closest("form")); etat.pubValeurs.image = ""; etat.pubImageModif = true; afficher(false, true); },
  "photo-cr-suppr": (el, v) => { capturerForm(el.closest("form")); etat.pubPhotos.splice(Number(v), 1); etat.pubPhotosModif = true; afficher(false, true); },
  "export-participants": async (el) => { el.disabled = true; try { await exporterParticipants(el.dataset.id); } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); } el.disabled = false; },
  "suppr": async (el) => {
    if (!window.confirm(t("admin.confirmer"))) return;
    await supprimerSurPlace(el.dataset.col, el.dataset.id);
  },
  "cloturer": async (el) => {
    const s = (etat.sondages || []).find((x) => x.id === el.dataset.id);
    if (!s) return;
    const avant = { ouvert: s.ouvert, cloture: s.cloture };
    const ouvert = s.ouvert === false;
    const maj = { ouvert, cloture: ouvert && s.cloture && s.cloture < jourAujourdhui() ? "" : s.cloture || "" };
    Object.assign(s, maj);
    etat.info = { type: "ok", texte: t(ouvert ? "sondage.rouvertOk" : "sondage.clotureOk") };
    afficher(false);
    try {
      await updateDoc(doc(db, "sondages", s.id), maj);
      journaliser(ouvert ? "reouverture" : "cloture", "sondages", s.question, s.clubId);
    } catch (e) { Object.assign(s, avant); etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
  },
  "agrandir": (el) => {
    const img = el.querySelector("img");
    if (!img || img.dataset.media) return;
    const fond = document.createElement("div");
    fond.className = "visionneuse";
    fond.innerHTML = `<img src="${img.src}" alt=""><button type="button" class="rond" aria-label="${te("fermer")}">×</button>`;
    fond.addEventListener("click", () => fond.remove());
    document.body.appendChild(fond);
  },
  "vote-modifier": (el) => { etat.voteEdition = el.dataset.id; afficher(false); },
  "idee-autre": () => { etat.ideeEnvoyee = false; afficher(); },
  "filtre-messages": (el, v) => { etat.filtreMessages = v; afficher(false); },
  "suppr-idee": async (el) => {
    if (!window.confirm(t("admin.msgConfirmer"))) return;
    const avant = etat.idees || [];
    etat.idees = avant.filter((i) => i.id !== el.dataset.id);
    etat.info = { type: "ok", texte: t("admin.msgSupprOk") };
    afficher(false);
    try { await deleteDoc(doc(db, "idees", el.dataset.id)); }
    catch (e) { etat.idees = avant; etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
  },
  "opp-proposer": () => { etat.oppForm = {}; afficher(false); },
  "opp-annuler": () => { etat.oppForm = null; afficher(false); },
  "opp-modifier": (el) => { etat.oppForm = { ...((etat.opportunites || []).find((o) => o.id === el.dataset.id) || {}) }; afficher(); },
  "opp-suppr": async (el) => {
    if (!window.confirm(t("admin.confirmer"))) return;
    await supprimerSurPlace("opportunites", el.dataset.id);
  },
  "filtre-opp": (el, v) => { etat.filtreOpp = v; afficher(false); },
  "preparer-doc": (el) => preparerDocument(el.dataset.id),
  "filtre-board": (el, v) => { etat.filtreBoard = v; afficher(false); },
  "board-nouveau": () => { etat.boardForm = { clubId: etat.profil.clubId || "bruxelles" }; afficher(false); },
  "board-annuler": () => { etat.boardForm = null; afficher(false); },
  "board-modifier": (el) => { etat.boardForm = { ...((etat.boards || []).find((b) => b.id === el.dataset.id) || {}) }; afficher(false); },
  "board-suppr": async (el) => {
    if (!window.confirm(t("admin.confirmer"))) return;
    const avant = etat.boards || [];
    etat.boards = avant.filter((b) => b.id !== el.dataset.id);
    etat.info = { type: "ok", texte: t("admin.supprOk") };
    afficher(false);
    try { await deleteDoc(doc(db, "boards", el.dataset.id)); journaliser("suppression", "boards", el.dataset.id, ""); }
    catch (e) { etat.boards = avant; etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
  },
  "board-importer": async (el) => {
    el.disabled = true;
    try {
      const liste = BOARDS.map((b) => ({ id: `bruxelles-${b.annee}`, annee: b.annee, clubId: "bruxelles", image: b.image, membres: b.membres.map(([nom, poste]) => ({ nom, poste })) }));
      await Promise.all(liste.map(({ id, ...b }) => setDoc(doc(db, "boards", id), b)));
      etat.boards = liste;
      etat.info = { type: "ok", texte: t("boardAdm.importOk") };
    } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; }
    afficher(false);
  },
  "sauvegarder": (el) => sauvegarder(el),
  "optimiser-images": (el) => optimiserImages(el),
  "export-annuaire": async (el) => { el.disabled = true; await exporterAnnuaire(); el.disabled = false; }
};
const CHANGEMENTS = {
  "image-pub": async (input) => {
    capturerForm(input.form);
    try { etat.pubValeurs.image = await reduireImage(input.files[0], 1200); etat.pubImageModif = true; }
    catch (e) { etat.info = { type: "erreur", texte: t("val.photo") }; }
    afficher(false, true);
  },
  "photos-cr": async (input) => {
    capturerForm(input.form);
    const fichiers = [...input.files].slice(0, Math.max(0, 8 - (etat.pubPhotos || []).length));
    for (const f of fichiers) {
      try { etat.pubPhotos.push(await reduireImage(f, 1400)); etat.pubPhotosModif = true; }
      catch (e) { etat.info = { type: "erreur", texte: t("val.photo") }; }
    }
    afficher(false, true);
  },
  "image-board": async (input) => {
    etat.boardForm = lireFormBoard(input.form);
    try { etat.boardForm.image = await reduireImage(input.files[0], 1100); }
    catch (e) { etat.info = { type: "erreur", texte: t("val.photo") }; }
    afficher(false, true);
  }
};

/* ---------- Connexion et inscription ---------- */
const optionsClubs = (choisi, avecReseau) => `<option value="">${te("choisir")}</option>`
  + CLUBS.concat(avecReseau ? [RESEAU] : []).map((c) => `<option value="${esc(c.id)}"${c.id === choisi ? " selected" : ""}>${esc(nomClub(c.id))}</option>`).join("");
const optionsPoles = (choisi) => `<option value="">${te("choisir")}</option>` + POLES.map((p) => `<option value="${esc(p)}"${p === choisi ? " selected" : ""}>${esc(p)}</option>`).join("");

// Champs communs à la création de compte : membre (avec le code du club) ou public.
function champsTypeCompte() {
  const m = etat.typeCompte === "membre";
  return `<fieldset class="choix"><legend>${te("insc.jeSuis")}</legend>
      <label><input type="radio" name="type" value="membre" data-change="type-compte"${m ? " checked" : ""}> ${te("insc.membre")}</label>
      <label><input type="radio" name="type" value="public" data-change="type-compte"${m ? "" : " checked"}> ${te("insc.public")}</label>
    </fieldset>
    ${m ? `<div class="champ"><label for="clubId">${te("insc.club")}</label><select id="clubId" name="clubId" required>${optionsClubs()}</select></div>
      <div class="champ"><label for="code">${te("code.label")}</label><input id="code" name="code" autocomplete="off" autocapitalize="characters" required><span class="aide">${te("code.aide")}</span></div>`
    : `<p class="petit gris">${te("insc.publicAide")}</p>`}`;
}
const champsNom = (v) => `<div class="deux">
    <div class="champ"><label for="prenom">${te("prenom")}</label><input id="prenom" name="prenom" autocomplete="given-name" value="${esc(v && v.prenom)}" required></div>
    <div class="champ"><label for="nom">${te("nom")}</label><input id="nom" name="nom" autocomplete="family-name" value="${esc(v && v.nom)}" required></div>
  </div>`;

// La connexion Google n'est téléchargée que sur la page de connexion (prête avant le clic).
let fenetreGoogle = null, prechargementGoogle = null;
const prechargerGoogle = () => (prechargementGoogle ||= import("./vendor/firebase-popup.js").then((m) => (fenetreGoogle = m)));
function pageAuth(mode) {
  prechargerGoogle().catch(() => { prechargementGoogle = null; });
  const insc = mode === "inscription";
  return `
    <div class="onglets">
      <a href="#/connexion" class="${insc ? "" : "actif"}">${te("seConnecter")}</a>
      <a href="#/inscription" class="${insc ? "actif" : ""}">${te("creerCompte")}</a>
    </div>
    <section class="carte">
      <h1>${te(insc ? "creerCompte" : "seConnecter")}</h1>
      <div id="msg" aria-live="polite"></div>
      <form id="form-${mode}" novalidate>
        ${insc ? champsNom() + champsTypeCompte() : ""}
        <div class="champ"><label for="email">${te("email")}</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="champ"><label for="mdp">${te(insc ? "mdpNouveau" : "mdp")}</label><input id="mdp" name="mdp" type="password" autocomplete="${insc ? "new-password" : "current-password"}" required></div>
        <button class="btn plein large" type="submit">${te(insc ? "insc.bouton" : "seConnecter")}</button>
      </form>
      ${insc ? "" : `<button class="lien-btn" type="button" data-action="oubli">${te("mdpOublie")}</button>`}
      <div class="separateur">${te("ou")}</div>
      <button class="btn contour large" type="button" data-action="google">${te("google")}</button>
    </section>`;
}

function pageProfilInitial() {
  return `<section class="carte info">
    <h2>${te("profil.completer")}</h2>
    <div id="msg" aria-live="polite"></div>
    <form id="form-profil" novalidate>
      ${champsNom()}${champsTypeCompte()}
      <button class="btn plein large" type="submit">${te("enregistrer")}</button>
    </form>
  </section>`;
}

/* ---------- Mon compte et parcours ---------- */
const CHAMPS_TEXTE = ["prenom", "nom", "anneeEntree", "pole", "poste", "etudes", "linkedin", "telephone", "naissance", "photo", "aspirations", "stage", "commentaire", "entreprise"];
function lireFormCompte(form) {
  const v = Object.fromEntries(new FormData(form).entries());
  const texte = (k) => String(v[k] || "").trim();
  const parcours = [];
  for (let i = 0; ("p_annee_" + i) in v; i++) parcours.push({ annee: texte("p_annee_" + i), pole: texte("p_pole_" + i), poste: texte("p_poste_" + i) });
  const d = { parcours, visibleAnnuaire: v.visibleAnnuaire === "on", disponible: v.disponible === "on" };
  CHAMPS_TEXTE.forEach((k) => { d[k] = texte(k); });
  return d;
}

// Une photo n'est acceptée que sous forme d'image intégrée (jamais une adresse externe).
const photoSure = (p) => (typeof p === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p) ? p : "");
const initiales = (u) => (String(u.prenom || "").charAt(0) + String(u.nom || "").charAt(0)).toUpperCase();
const avatar = (u) => (photoSure(u.photo) ? `<img class="avatar" src="${u.photo}" alt="">` : `<span class="avatar" aria-hidden="true">${esc(initiales(u))}</span>`);
function majMembreLocal(uid, maj) {
  const u = (etat.membres || []).find((x) => x.uid === uid);
  if (u) Object.assign(u, maj);
  if (etat.user && uid === etat.user.uid && etat.profil) Object.assign(etat.profil, maj);
}
const monEmail = () => String((etat.user && etat.user.email) || "").toLowerCase();
const maFiche = () => (etat.fiches || etat.mesFiches || []).find((f) => f.email && f.email === monEmail());
// Pour « Mon compte », une seule petite demande suffit : ma fiche de l'ancien annuaire, s'il y en a une.
function chargerMaFiche() {
  if (etat.mesFiches || !monEmail()) return;
  uneFois("ma-fiche", async () => {
    try { etat.mesFiches = (await getDocs(query(collection(db, "fiches"), where("email", "==", monEmail())))).docs.map((d) => ({ id: d.id, ...d.data() })); }
    catch (e) { etat.mesFiches = []; }
    rafraichir();
  });
}
// Photo de profil : 160 × 160 suffit pour une vignette nette, même sur un écran haute définition.
async function reduirePhoto(file) {
  const url = URL.createObjectURL(file);
  try { return encoder(dessiner(await ouvrirImage(url), 0, 160), 40000, 0.8); }
  finally { URL.revokeObjectURL(url); }
}

function pageCompte() {
  if (!etat.user) return pageAuth("connexion");
  const p = etat.profil;
  if (!p) return `<h1>${te("compte.titre")}</h1>` + pageProfilInitial() + `<button class="btn contour large" type="button" data-action="deconnexion">${te("deconnexion")}</button>`;
  const b = etat.brouillon || { ...p, parcours: Array.isArray(p.parcours) ? p.parcours : [] };
  let corps = `<h1>${te("compte.titre")}</h1>${blocInfo()}
    <section class="carte">
      <div class="identite">${avatar(p)}<div><p><strong>${esc(p.prenom)} ${esc(p.nom)}</strong></p><p class="gris petit">${esc(etat.user.email || "")}</p></div></div>
      <p>${pastilleClub(p.clubId)} ${pastilles(p)} <span class="pastille ${p.role === "pending" ? "contour" : ""}">${te("role." + p.role)}</span></p>
    </section>`;

  if (p.role === "pending") {
    corps += `<section class="carte info">
      <h2>${te("code.jai")}</h2><p class="gris">${te("code.explication")}</p>
      <div id="msg" aria-live="polite"></div>
      <form id="form-code" novalidate>
        <div class="champ"><label for="clubId">${te("insc.club")}</label><select id="clubId" name="clubId" required>${optionsClubs(p.clubId)}</select></div>
        <div class="champ"><label for="code">${te("code.label")}</label><input id="code" name="code" autocomplete="off" autocapitalize="characters" required></div>
        <button class="btn plein large" type="submit">${te("code.valider")}</button>
      </form></section>`;
  } else {
    if (etat.fiches === null) chargerMaFiche();
    if (maFiche() && !p.ficheRecuperee) {
      corps += `<section class="carte info"><h2>${te("fiche.retrouveTitre")}</h2><p>${te("fiche.retrouveTexte")}</p>
        <button class="btn plein" type="button" data-action="recuperer">${te("fiche.recuperer")}</button></section>`;
    }
    const lignes = b.parcours.map((x, i) => `<div class="parcours-ligne">
        <div class="deux">
          <div class="champ"><label for="p_annee_${i}">${te("parcours.annee")}</label><input id="p_annee_${i}" name="p_annee_${i}" placeholder="2025-2026" value="${esc(x.annee)}"></div>
          <div class="champ"><label for="p_pole_${i}">${te("parcours.pole")}</label><select id="p_pole_${i}" name="p_pole_${i}">${optionsPoles(x.pole)}</select></div>
        </div>
        <div class="champ"><label for="p_poste_${i}">${te("parcours.poste")}</label><input id="p_poste_${i}" name="p_poste_${i}" value="${esc(x.poste)}"></div>
        <button class="lien-btn danger" type="button" data-action="parcours-suppr" data-v="${i}">${te("parcours.retirer")}</button>
      </div>`).join("");
    const zone = (id, cle, lignesTexte) => `<div class="champ"><label for="${id}">${te(cle)}</label><textarea id="${id}" name="${id}" rows="${lignesTexte}" maxlength="1500">${esc(b[id])}</textarea></div>`;
    corps += `<section class="carte">
      <h2>${te("parcours.titre")}</h2><p class="gris petit">${te("parcours.intro")}</p>
      <div id="msg" aria-live="polite"></div>
      <form id="form-compte" novalidate>
        <div class="identite">${avatar(b)}
          <div class="champ"><label for="fichierPhoto">${te("parcours.photo")}</label><input id="fichierPhoto" type="file" accept="image/*" data-change="photo">
          ${photoSure(b.photo) ? `<button class="lien-btn danger" type="button" data-action="photo-retirer">${te("parcours.photoRetirer")}</button>` : ""}</div>
        </div>
        <input type="hidden" name="photo" value="${photoSure(b.photo)}">
        ${champsNom(b)}
        <div class="deux">
          <div class="champ"><label for="telephone">${te("parcours.telephone")}</label><input id="telephone" name="telephone" type="tel" autocomplete="tel" maxlength="25" value="${esc(b.telephone)}"></div>
          <div class="champ"><label for="naissance">${te("parcours.naissance")}</label><input id="naissance" name="naissance" type="date" value="${esc(b.naissance)}"></div>
        </div>
        <div class="deux">
          <div class="champ"><label for="anneeEntree">${te("parcours.entree")}</label><input id="anneeEntree" name="anneeEntree" inputmode="numeric" maxlength="4" placeholder="2024" value="${esc(b.anneeEntree)}"></div>
          <div class="champ"><label for="pole">${te("parcours.poleActuel")}</label><select id="pole" name="pole">${optionsPoles(b.pole)}</select></div>
        </div>
        <div class="champ"><label for="poste">${te("parcours.posteActuel")}</label><input id="poste" name="poste" maxlength="80" value="${esc(b.poste)}"></div>
        <h3>${te("parcours.anciens")}</h3>
        ${lignes || `<p class="gris petit">${te("parcours.vide")}</p>`}
        <button class="btn contour" type="button" data-action="parcours-ajout">${te("parcours.ajouter")}</button>
        <div class="champ"><label for="etudes">${te("parcours.etudes")}</label><input id="etudes" name="etudes" maxlength="160" value="${esc(b.etudes)}"></div>
        <div class="champ"><label for="linkedin">${te("parcours.linkedin")}</label><input id="linkedin" name="linkedin" inputmode="url" placeholder="https://www.linkedin.com/in/…" value="${esc(b.linkedin)}"></div>
        <div class="champ"><label for="entreprise">${te("parcours.entreprise")}</label><input id="entreprise" name="entreprise" maxlength="300" value="${esc(b.entreprise)}"></div>
        ${zone("aspirations", "parcours.aspirations", 2)}
        ${zone("stage", "parcours.stage", 2)}
        ${zone("commentaire", "parcours.commentaire", 2)}
        <label class="case-coche"><input type="checkbox" name="disponible"${b.disponible ? " checked" : ""}> <span>${te("parcours.disponible")}</span></label>
        <label class="case-coche"><input type="checkbox" name="visibleAnnuaire"${b.visibleAnnuaire ? " checked" : ""}> <span>${te("parcours.consentement")}</span></label>
        <button class="btn plein large" type="submit">${te("enregistrer")}</button>
      </form></section>`;
  }
  const langues = `<section class="carte"><h2>${te("langue.titre")}</h2><div class="puces">${LANGUES.map((l) => `<button type="button" class="puce ${etat.langue === l ? "actif" : ""}" data-action="langue" data-v="${l}">${te("langue." + l)}</button>`).join("")}</div></section>`;
  return corps + blocNotifications() + langues + `<button class="btn contour large" type="button" data-action="deconnexion">${te("deconnexion")}</button>`;
}

// Ce qu'un membre reprend de son ancienne fiche quand il la récupère.
function depuisFiche(f) {
  const d = { ficheRecuperee: true, visibleAnnuaire: true, disponible: !!f.disponible, parcours: Array.isArray(f.parcours) ? f.parcours : [] };
  CHAMPS_TEXTE.forEach((k) => { d[k] = String(f[k] || etat.profil[k] || ""); });
  return d;
}

/* ---------- Annuaire (membres uniquement) ---------- */
const lienSur = (url) => (/^https?:\/\//i.test(url || "") ? url : "");
// L'annuaire réunit les comptes des membres et les fiches reprises de l'ancien annuaire.
// Une ancienne fiche disparaît dès que son propriétaire l'a récupérée dans son compte.
function personnes() {
  const comptes = (etat.membres || []).filter((u) => ROLES_MEMBRES.includes(u.role));
  const pris = new Set(comptes.filter((u) => u.visibleAnnuaire || u.ficheRecuperee).map((u) => String(u.email || "").toLowerCase()));
  const visibles = comptes.filter((u) => u.visibleAnnuaire).map((u) => ({ ...u, cle: "u" + u.uid }));
  const anciennes = (etat.fiches || []).filter((f) => !f.email || !pris.has(f.email)).map((f) => ({ ...f, role: "member", cle: "f" + f.id }));
  return visibles.concat(anciennes);
}
const jourAnniv = (n) => fmt({ day: "numeric", month: "long" }, new Date(2000, +n.slice(5, 7) - 1, +n.slice(8, 10)));
function pageAnnuaire() {
  if (!estMembre()) {
    return `<h1>${te("annuaire.titre")}</h1><section class="carte"><p>${te("annuaire.reserve")}</p>
      <a class="btn contour" href="${etat.user ? "#/compte" : "#/connexion"}">${te(etat.user ? "code.jai" : "seConnecter")}</a></section>`;
  }
  if (etat.membres === null) { chargerMembres(); return `<h1>${te("annuaire.titre")}</h1>` + chargement(); }
  const rech = etat.rechAnnuaire.trim().toLowerCase();
  const f = etat.filtreAnnuaire;
  const filtres = ["tous"].concat(CLUBS.map((c) => c.id), ["board", "alumni", "anniv"]);
  const dateOk = (u) => /^\d{4}-\d{2}-\d{2}$/.test(u.naissance || "");
  let liste = personnes()
    .filter((u) => {
      if (f === "board") return !!u.board;
      if (f === "alumni") return u.statut === "alumni";
      if (f === "anniv") return dateOk(u);
      return f === "tous" || u.clubId === f;
    })
    .filter((u) => !rech || [u.prenom, u.nom, u.pole, u.poste, u.etudes, u.entreprise].join(" ").toLowerCase().includes(rech));
  if (f === "anniv") {
    // Du prochain anniversaire au plus lointain.
    const ceJour = jourISO(new Date()).slice(5);
    const rang = (u) => (u.naissance.slice(5) < ceJour ? "1" : "0") + u.naissance.slice(5);
    liste.sort((x, y) => rang(x).localeCompare(rang(y)));
  } else liste.sort((x, y) => String(x.nom).localeCompare(String(y.nom)));
  const bloc = (cle, valeur) => (valeur ? `<p class="petit"><strong>${te(cle)}</strong> ${esc(valeur)}</p>` : "");
  const fiche = (u) => {
    const parcours = (Array.isArray(u.parcours) ? u.parcours : []).filter((x) => x.annee || x.poste || x.pole);
    const li = lienSur(u.linkedin);
    return `<article class="carte">
      <div class="identite">${avatar(u)}<div>
        <p><strong>${esc(u.prenom)} ${esc(u.nom)}</strong></p>
        ${u.poste || u.pole ? `<p class="petit gris">${esc([u.poste, u.pole].filter(Boolean).join(" · "))}</p>` : ""}
        ${f === "anniv" ? `<p class="petit"><strong>${esc(jourAnniv(u.naissance))}</strong></p>` : ""}
      </div></div>
      <p>${pastilleClub(u.clubId)} ${pastilles(u)}${u.disponible ? ` <span class="pastille or">${te("annuaire.dispo")}</span>` : ""}</p>
      <details><summary>${te("annuaire.voir")}</summary>
        ${u.anneeEntree ? `<p class="petit">${esc(t("annuaire.entree", { annee: u.anneeEntree }))}</p>` : ""}
        ${u.etudes ? `<p class="petit">${esc(u.etudes)}</p>` : ""}
        ${parcours.length ? `<ul class="parcours">${parcours.map((x) => `<li><strong>${esc(x.annee)}</strong> ${esc([x.poste, x.pole].filter(Boolean).join(" · "))}</li>`).join("")}</ul>` : ""}
        ${bloc("annuaire.entreprise", u.entreprise)}${bloc("annuaire.aspirations", u.aspirations)}${bloc("annuaire.stage", u.stage)}
        ${u.commentaire ? `<p class="petit description">${esc(u.commentaire)}</p>` : ""}
        ${dateOk(u) ? `<p class="petit">${esc(t("annuaire.anniversaire", { date: jourAnniv(u.naissance) }))}</p>` : ""}
        ${u.email ? `<p class="petit"><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></p>` : ""}
        ${u.telephone ? `<p class="petit"><a href="tel:${esc(u.telephone.replace(/[^+\d]/g, ""))}">${esc(u.telephone)}</a></p>` : ""}
        ${li ? `<p class="petit"><a href="${esc(li)}" target="_blank" rel="noopener">LinkedIn</a></p>` : ""}
      </details>
    </article>`;
  };
  const nomFiltre = (v) => (v === "tous" ? t("tous") : v === "board" ? t("badge.board") : v === "alumni" ? t("badge.alumni") : v === "anniv" ? t("annuaire.anniv") : nomCourt(v));
  const moi = etat.profil;
  return `<h1>${te("annuaire.titre")}</h1>
    <div class="champ"><label for="rech" class="cache">${te("annuaire.recherche")}</label><input id="rech" type="search" placeholder="${te("annuaire.recherche")}" value="${esc(etat.rechAnnuaire)}" data-input="rech-annuaire"></div>
    <div class="puces">${filtres.map((v) => `<button type="button" class="puce ${f === v ? "actif" : ""}" data-action="filtre-annuaire" data-v="${v}">${esc(nomFiltre(v))}</button>`).join("")}</div>
    <div id="liste-annuaire">${liste.length ? liste.map(fiche).join("") : `<p class="gris centre">${te(f === "anniv" ? "annuaire.aucunAnniv" : "annuaire.vide")}</p>`}</div>
    ${moi.visibleAnnuaire || (maFiche() && !moi.ficheRecuperee) ? "" : `<p class="petit gris centre">${te("annuaire.absent")} <a href="#/compte">${te("compte.titre")}</a></p>`}`;
}

/* ---------- Espace admin ---------- */
const peutGerer = (clubId) => estSuper() || (!!etat.profil && !!clubId && etat.profil.clubId === clubId);

function adminMembres() {
  if (etat.membres === null) { chargerMembres(); return chargement(); }
  const visibles = etat.membres.filter((u) => estSuper() || peutGerer(u.clubId)).sort((x, y) => String(x.nom).localeCompare(String(y.nom)));
  const bouton = (u, r, cle, cls) => `<button type="button" class="btn ${cls} petit-btn" data-action="role" data-uid="${esc(u.uid)}" data-role="${r}">${te(cle)}</button>`;
  const bascule = (u, champ, valeur, cle, actif) => `<button type="button" class="puce ${actif ? "actif" : ""}" aria-pressed="${actif ? "true" : "false"}" data-action="badge" data-uid="${esc(u.uid)}" data-champ="${champ}" data-valeur="${valeur}">${te(cle)}</button>`;
  const fiche = (u) => {
    const moi = etat.user && u.uid === etat.user.uid;
    let actions = "";
    if (!moi && u.role === "pending" && u.clubId) actions = bouton(u, "member", "admin.valider", "plein");
    else if (!moi && u.role === "member") actions = (estSuper() ? bouton(u, "admin", "admin.nommer", "contour") : "") + bouton(u, "pending", "admin.retirer", "contour");
    else if (!moi && u.role === "admin" && estSuper()) actions = bouton(u, "member", "admin.retirerAdmin", "contour");
    const badges = ROLES_MEMBRES.includes(u.role) ? `<div class="puces">
        ${bascule(u, "statut", u.statut === "alumni" ? "actif" : "alumni", "badge.alumni", u.statut === "alumni")}
        ${bascule(u, "board", u.board ? "0" : "1", "badge.board", !!u.board)}
        ${bascule(u, "fondateur", u.fondateur ? "0" : "1", "badge.fondateur", !!u.fondateur)}
      </div>` : "";
    return `<article class="carte">
      <p><strong>${esc(u.prenom)} ${esc(u.nom)}</strong>${moi ? ` <span class="gris">${te("admin.vous")}</span>` : ""}</p>
      <p class="petit gris">${esc(u.email)}</p>
      <p>${pastilleClub(u.clubId)} ${pastilles(u)} <span class="pastille ${u.role === "pending" ? "contour" : ""}">${te("role." + u.role)}</span></p>
      ${badges}
      ${actions ? `<div class="rangee">${actions}</div>` : ""}
    </article>`;
  };
  const membres = visibles.filter((u) => u.role !== "pending");
  const publics = visibles.filter((u) => u.role === "pending");
  return `<p class="petit gris">${te("admin.badgesAide")}</p>
    <h2>${esc(t("admin.membresN", { n: membres.length }))}</h2>${membres.map(fiche).join("")}
    <h2>${esc(t("admin.publicsN", { n: publics.length }))}</h2>${publics.length ? publics.map(fiche).join("") : `<p class="gris">${te("admin.aucunPublic")}</p>`}`;
}

/* ---------- Reprise de l'ancien annuaire (fichier CSV exporté de Google Sheets) ---------- */
function lireCSV(texte) {
  const lignes = []; let ligne = [], champ = "", guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (guillemets) {
      if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); champ = ""; lignes.push(ligne); ligne = [];
    } else champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes.filter((l) => l.some((x) => String(x).trim() !== ""));
}
function normaliserPole(s) {
  const x = s.toLowerCase();
  if (!x) return "";
  if (/event/.test(x)) return "Team Event";
  if (/comm/.test(x)) return "Team Communication";
  if (/network/.test(x)) return "Team Network";
  if (/relation|publi/.test(x)) return "Team Relations publiques";
  if (/next africa|\bnac\b/.test(x)) return "Next Africa Connect";
  if (/business lab|\bmbl\b/.test(x)) return "Madiba Business Lab";
  if (/\brh\b|ressource|humain/.test(x)) return "Team RH";
  if (/board|bureau/.test(x)) return "Board";
  return s;
}
function lireHistorique(s) {
  if (!s) return [];
  return s.split(/\n|\s\/\s|\s_\s/).map((x) => x.trim()).filter(Boolean).map((m) => {
    const r = m.match(/^((?:19|20)\d\d(?:\s*[-–]\s*(?:(?:19|20)\d\d|\d\d))?)\s*[:·\-–]?\s*(.*)$/);
    return r ? { annee: r[1].replace(/\s+/g, ""), pole: "", poste: r[2].trim() } : { annee: "", pole: "", poste: m };
  }).slice(0, 15);
}
const POSTES_BOARD = { pres: "Président·e", vpe: "VP Externe", vpi: "VP Interne", vpo: "VP Opérationnel", tres: "Trésorier·e", rh: "Directeur·rice RH" };
function ficheDepuisLigne(o, i) {
  const g = (k) => String(o[k] ?? "").trim();
  const bd = g("bd").toLowerCase();
  const li = g("li");
  const id = /^[A-Za-z0-9-]{6,80}$/.test(g("id")) ? g("id") : "import-" + (i + 1);
  return {
    id,
    prenom: g("n"), nom: g("s"), email: g("em").toLowerCase(), telephone: g("tel"),
    naissance: /^\d{4}-\d{2}-\d{2}$/.test(g("b")) ? g("b") : "",
    linkedin: li && !/^https?:\/\//i.test(li) ? "https://" + li : li,
    photo: photoSure(g("ph")),
    etudes: [g("sch"), g("fi"), g("dg")].filter(Boolean).join(" · "),
    pole: normaliserPole(g("pole")) || (bd ? "Board" : ""),
    poste: g("role") || POSTES_BOARD[bd] || "",
    anneeEntree: /^(19|20)\d\d$/.test(g("y")) ? g("y") : "",
    clubId: /royaume|manchester|angleterre|united|\buk\b/i.test(g("ct")) ? "manchester" : "bruxelles",
    statut: g("st").toLowerCase() === "l" ? "alumni" : "actif",
    board: !!bd,
    aspirations: g("asp"), stage: g("int"), commentaire: g("cm"),
    parcours: lireHistorique(g("hist")),
    entreprise: [g("cur"), g("desc")].filter(Boolean).join(" — "),
    disponible: g("av").toLowerCase() === "true",
    importeLe: new Date().toISOString()
  };
}
function fichesDepuisCSV(texte) {
  const lignes = lireCSV(texte.replace(/^﻿/, ""));
  if (lignes.length < 2) return null;
  const entetes = lignes[0].map((x) => String(x).trim().toLowerCase());
  if (!entetes.includes("em") || !entetes.includes("n") || !entetes.includes("s")) return null;
  return lignes.slice(1).map((l, i) => {
    const o = {}; entetes.forEach((e, j) => { o[e] = l[j]; });
    return ficheDepuisLigne(o, i);
  }).filter((f) => f.prenom || f.nom);
}

function adminCodes() {
  const base = adminCodesBase();
  return etat.codes === null || etat.fiches === null || !estSuper() ? base : base + adminNotifications() + adminFondateurs();
}
function adminCodesBase() {
  if (!estSuper()) return "";
  if (etat.codes === null) { chargerCodes(); return chargement(); }
  if (etat.fiches === null) { chargerMembres(); return chargement(); }
  const a = etat.importApercu;
  return `<section class="carte">
    <h2>${te("admin.codesTitre")}</h2><p class="gris petit">${te("admin.codesAide")}</p>
    <div id="msg" aria-live="polite"></div>
    <form id="form-codes" novalidate>
      ${CLUBS.map((c) => `<div class="champ"><label for="code_${c.id}">${esc(c.nom)}</label><input id="code_${c.id}" name="${c.id}" autocomplete="off" minlength="4" value="${esc(etat.codes[c.id])}"></div>`).join("")}
      <button class="btn plein large" type="submit">${te("enregistrer")}</button>
    </form></section>
    <section class="carte">
      <h2>${te("imp.titre")}</h2><p class="gris petit">${te("imp.aide")}</p>
      <p class="petit">${esc(t("imp.deja", { n: etat.fiches.length }))}</p>
      <div class="champ"><label for="csv">${te("imp.choisir")}</label><input id="csv" type="file" accept=".csv,text/csv" data-change="csv"></div>
      ${a ? `<p>${esc(t("imp.trouve", { n: a.length, mails: a.filter((x) => x.email).length, photos: a.filter((x) => x.photo).length }))}</p>
        <button class="btn plein large" type="button" data-action="importer">${esc(t("imp.bouton", { n: a.length }))}</button>` : ""}
    </section>`;
}

const PAGES = {
  accueil: pageAccueil,
  connexion: () => pageAuth("connexion"),
  inscription: () => pageAuth("inscription"),
  evenements: pageEvenements,
  calendrier: pageCalendrier,
  news: pageNews,
  plus: pagePlus,
  compte: pageCompte,
  annuaire: pageAnnuaire,
  journal: pageJournal,
  board: pageBoard,
  contact: pageContact,
  anniversaires: pageAnniversaires,
  evenement: pageEvenement,
  sondages: pageSondages,
  idees: pageIdees,
  opportunites: pageOpportunites,
  documents: pageDocuments,
  fondateurs: pageFondateurs,
  admin: pageAdmin
};
const ONGLETS = ["accueil", "evenements", "calendrier", "news", "plus"];

/* ---------- Affichage ---------- */
function afficher(remonter = true, forcer = false) {
  if (!etat.pret) return;
  // On ne redessine pas un formulaire en cours de saisie quand des données arrivent en arrière-plan.
  if (!remonter && !forcer && document.activeElement && racine.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const r = PAGES[route()] ? route() : "accueil";
  const onglet = ONGLETS.includes(r) ? r : r === "journal" ? "news" : r === "evenement" ? "evenements" : "plus";
  document.documentElement.lang = etat.langue;
  document.body.classList.toggle("nuit", r === "accueil");
  racine.innerHTML = `
    <header class="entete">
      <a class="marque" href="#/accueil"><picture><source type="image/webp" srcset="icons/marque.webp"><img src="icons/icon-192.png" alt="" width="38" height="38"></picture><span class="nom titre">Madiba Club</span></a>
      <label class="cache" for="choix-langue">${te("langue.titre")}</label>
      <select id="choix-langue" class="langue" data-change="langue">${LANGUES.map((l) => `<option value="${l}"${l === etat.langue ? " selected" : ""}>${l.toUpperCase()}</option>`).join("")}</select>
      <a class="compte" href="${etat.user ? "#/compte" : "#/connexion"}">${te(etat.user ? "compte.court" : "seConnecter")}</a>
    </header>
    <main>${PAGES[r]()}</main>
    <nav class="nav" aria-label="${te("nav.label")}">
      ${ONGLETS.map((id) => `<a href="#/${id}" class="${id === onglet ? "actif" : ""}"${id === onglet ? ' aria-current="page"' : ""}>${ico(id)}${te("nav." + id)}</a>`).join("")}
    </nav>`;
  brancherMedias();
  if (remonter) window.scrollTo(0, 0);
}

function message(texte, type) {
  const m = document.getElementById("msg");
  if (m) m.innerHTML = texte ? `<div class="message ${type || "erreur"}" role="alert">${esc(texte)}</div>` : "";
  if (m && texte) m.scrollIntoView({ block: "center" });
}
function occupe(form, oui) {
  const b = form.querySelector('button[type="submit"]');
  if (b) b.disabled = oui;
}
async function changerLangue(l) {
  if (!LANGUES.includes(l)) return;
  try { await chargerLangue(l); } catch (e) { return; }
  etat.langue = l;
  try { localStorage.setItem("madiba-langue", l); } catch (e) { /* stockage indisponible */ }
  afficher(false, true);
}

/* ---------- Actions : formulaires ---------- */
racine.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const v = Object.fromEntries(new FormData(form).entries());
  for (const k in v) v[k] = String(v[k]).trim();
  message("");
  if (form.classList.contains("form-vote")) { await voter(form); return; }
  if (FORMULAIRES[form.id]) { await FORMULAIRES[form.id](form, v); return; }

  if (form.id === "form-connexion") {
    if (!v.email || !v.mdp) return message(t("val.emailMdp"));
    occupe(form, true);
    try { await signInWithEmailAndPassword(auth, v.email, v.mdp); }
    catch (e) { message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-inscription" || form.id === "form-profil") {
    const membre = v.type === "membre";
    const avecMail = form.id === "form-inscription";
    if (!v.prenom || !v.nom || (avecMail && (!v.email || !v.mdp)) || (membre && (!v.clubId || !v.code))) return message(t("val.tous"));
    const d = { prenom: v.prenom, nom: v.nom, type: v.type, clubId: v.clubId || "", code: v.code || "" };
    occupe(form, true);
    if (avecMail) {
      etat.inscription = d;
      try { await createUserWithEmailAndPassword(auth, v.email, v.mdp); }
      catch (e) { etat.inscription = null; message(texteErreur(e)); occupe(form, false); }
    } else {
      try { etat.profil = await creerProfil(etat.user, d); garderSession(); afficher(); chargerContenus(true); }
      catch (e) { message(texteErreur(e)); occupe(form, false); }
    }
  }

  if (form.id === "form-code") {
    if (!v.clubId || !v.code) return message(t("val.tous"));
    occupe(form, true);
    try {
      if (!(await validerCode(etat.user.uid, v.clubId, v.code))) { message(t("code.refuse")); return occupe(form, false); }
      await updateDoc(doc(db, "users", etat.user.uid), { role: "member", clubId: v.clubId });
      etat.profil = { ...etat.profil, role: "member", clubId: v.clubId };
      garderSession();
      etat.info = { type: "ok", texte: t("code.ok", { club: nomClub(v.clubId) }) };
      afficher(); chargerContenus(true);
    } catch (e) { message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-compte") {
    const d = lireFormCompte(form);
    if (!d.prenom || !d.nom) return message(t("val.nom"));
    if (d.anneeEntree && !/^(19|20)\d\d$/.test(d.anneeEntree)) return message(t("val.annee"));
    if (d.linkedin && !/^https?:\/\//i.test(d.linkedin)) d.linkedin = "https://" + d.linkedin;
    if (d.naissance && !/^(19|20)\d\d-\d\d-\d\d$/.test(d.naissance)) return message(t("val.naissance"));
    d.photo = photoSure(d.photo);
    d.parcours = d.parcours.filter((x) => x.annee || x.pole || x.poste).slice(0, 15);
    // Enregistré à l'écran tout de suite ; en cas de refus du serveur, on revient en arrière.
    const avant = etat.profil;
    etat.profil = { ...etat.profil, ...d }; etat.brouillon = null;
    majMembreLocal(etat.user.uid, d);
    garderSession();
    etat.info = { type: "ok", texte: t("compte.enregistre") };
    afficher();
    try {
      await updateDoc(doc(db, "users", etat.user.uid), d);
      if ((avant.pole || "") !== (d.pole || "")) chargerContenus(true); // le pôle change ce que l'on peut voir
    } catch (e) {
      etat.profil = avant; etat.brouillon = d; majMembreLocal(etat.user.uid, avant); garderSession();
      etat.info = { type: "erreur", texte: texteErreur(e) };
      afficher();
    }
  }

  if (form.id === "form-notif") {
    if (v.vapidKey.length < 60) return message(t("val.cleNotif"));
    occupe(form, true);
    try {
      await setDoc(doc(db, "public", "config"), { vapidKey: v.vapidKey });
      etat.configPublique = { vapidKey: v.vapidKey };
      etat.info = { type: "ok", texte: t("notif.cleOk") };
      afficher();
    } catch (e) { message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-fondateurs") {
    const d = lireFormFondateurs(form);
    d.liste = d.liste.filter((x) => x.nom).slice(0, 12);
    occupe(form, true);
    try {
      await setDoc(doc(db, "public", "fondateurs"), d);
      etat.fondateurs = d; etat.fondBrouillon = null;
      etat.info = { type: "ok", texte: t("fond.ok") };
      afficher();
    } catch (e) { message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-codes") {
    const codes = {};
    for (const c of CLUBS) {
      if (!v[c.id] || v[c.id].length < 4) return message(t("val.code"));
      codes[c.id] = v[c.id];
    }
    occupe(form, true);
    try {
      await setDoc(doc(db, "config", "codes"), codes);
      journaliser("codes", "config", "", "");
      etat.codes = codes;
      etat.info = { type: "ok", texte: t("admin.codesOk") };
      afficher();
    } catch (e) { message(texteErreur(e)); occupe(form, false); }
  }
});

/* ---------- Actions : boutons ---------- */
racine.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const { action, v } = el.dataset;
  etat.info = null; etat.infoNotif = null; // le message de confirmation précédent disparaît à l'action suivante
  if (ACTIONS[action]) { await ACTIONS[action](el, v); return; }

  if (action === "statut") { etat.filtreStatut = v; afficher(false); }
  if (action === "club") { etat.filtreClub = v; afficher(false); }
  if (action === "onglet-admin") { etat.adminOnglet = v; afficher(false); }
  if (action === "filtre-annuaire") { etat.filtreAnnuaire = v; afficher(false); }
  if (action === "langue") changerLangue(v);
  if (action === "mois") {
    const d = new Date(etat.mois.a, etat.mois.m + Number(v), 1);
    etat.mois = { a: d.getFullYear(), m: d.getMonth() };
    afficher(false);
  }

  if (action === "parcours-ajout" || action === "parcours-suppr") {
    const d = lireFormCompte(document.getElementById("form-compte"));
    if (action === "parcours-ajout") d.parcours.push({ annee: "", pole: "", poste: "" });
    else d.parcours.splice(Number(v), 1);
    etat.brouillon = d;
    afficher(false);
  }

  if (action === "mode-journal") { etat.modeJournal = v; afficher(false); }
  if (action === "filtre-anniv") { etat.filtreAnniv = v; afficher(false); }
  if (action === "rsvp") {
    try { await repondre(el.dataset.id, v); }
    catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
  }
  if (action === "notif-activer" || action === "notif-desactiver") {
    el.disabled = true;
    try {
      if (action === "notif-activer") { await activerNotifications(); etat.infoNotif = { type: "ok", texte: t("notif.ok") }; }
      else { await desactiverNotifications(); etat.infoNotif = { type: "ok", texte: t("notif.off") }; }
    } catch (e) {
      const cle = "err." + ((e && e.code) || "");
      etat.infoNotif = { type: "erreur", texte: dico()[cle] && /^err\.notif\//.test(cle) ? t(cle) : t("err.notif/erreur") };
    }
    afficher(false, true);
  }
  if (action === "contact-autre") { etat.contactEnvoye = ""; afficher(); }
  if (action === "fond-ajout" || action === "fond-suppr") {
    const d = lireFormFondateurs(document.getElementById("form-fondateurs"));
    if (action === "fond-ajout") d.liste.push({ nom: "", role: "", bio: "", linkedin: "", photo: "" });
    else d.liste.splice(Number(v), 1);
    etat.fondBrouillon = d;
    afficher(false);
  }
  if (action === "suppr-message") {
    if (!window.confirm(t("admin.msgConfirmer"))) return;
    const avant = etat.messages || [];
    etat.messages = avant.filter((m) => m.id !== el.dataset.id);
    etat.info = { type: "ok", texte: t("admin.msgSupprOk") };
    afficher(false);
    try { await deleteDoc(doc(db, "messages", el.dataset.id)); }
    catch (e) { etat.messages = avant; etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
  }
  if (action === "video") {
    document.getElementById("video").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1" title="${te("acc.videoTitre")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }
  if (action === "photo-retirer") {
    etat.brouillon = { ...lireFormCompte(document.getElementById("form-compte")), photo: "" };
    afficher(false);
  }

  if (action === "recuperer") {
    const f = maFiche();
    if (!f) return;
    el.disabled = true;
    try {
      const maj = depuisFiche(f);
      await updateDoc(doc(db, "users", etat.user.uid), maj);
      etat.profil = { ...etat.profil, ...maj }; etat.brouillon = null;
      majMembreLocal(etat.user.uid, maj); garderSession();
      etat.info = { type: "ok", texte: t("fiche.recupOk") };
    } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; }
    afficher();
  }

  if (action === "importer" && etat.importApercu) {
    const liste = etat.importApercu;
    el.disabled = true;
    let faits = 0;
    try {
      for (const f of liste) {
        const { id, ...donnees } = f;
        await setDoc(doc(db, "fiches", id), donnees);
        faits++;
        el.textContent = t("imp.encours", { i: faits, n: liste.length });
      }
      etat.info = { type: "ok", texte: t("imp.ok", { n: faits }) };
      journaliser("import", "fiches", String(faits), "");
    } catch (e) { etat.info = { type: "erreur", texte: t("imp.partiel", { i: faits, n: liste.length }) + " " + texteErreur(e) }; }
    etat.importApercu = null; etat.membres = null; etat.fiches = null;
    afficher();
  }

  if (action === "role" || action === "badge") {
    const maj = action === "role" ? { role: el.dataset.role }
      : { [el.dataset.champ]: el.dataset.champ === "statut" ? el.dataset.valeur : el.dataset.valeur === "1" };
    const uid = el.dataset.uid;
    const u = (etat.membres || []).find((x) => x.uid === uid);
    const avant = u ? Object.fromEntries(Object.keys(maj).map((k) => [k, u[k]])) : null;
    majMembreLocal(uid, maj);
    etat.info = { type: "ok", texte: t("admin.majOk") };
    afficher(false);
    try {
      await updateDoc(doc(db, "users", uid), maj);
      journaliser(action === "role" ? "role" : "pastille", "users", u ? `${u.prenom} ${u.nom}` : "", u ? u.clubId : "");
    } catch (e) { if (avant) majMembreLocal(uid, avant); etat.info = { type: "erreur", texte: texteErreur(e) }; afficher(false); }
  }

  if (action === "google") {
    message("");
    try {
      const m = fenetreGoogle || (await prechargerGoogle());
      await m.signInWithPopup(auth, new m.GoogleAuthProvider(), m.browserPopupRedirectResolver);
    } catch (e) { message(texteErreur(e)); }
  }
  if (action === "oubli") {
    const email = (document.getElementById("email") || {}).value || "";
    if (!email.trim()) return message(t("val.emailDabord"));
    try { await sendPasswordResetEmail(auth, email.trim()); message(t("mdpEnvoye"), "ok"); }
    catch (e) { message(texteErreur(e)); }
  }
  if (action === "deconnexion") {
    // On efface aussi la copie locale des données : un téléphone prêté ne garde rien du compte.
    fermeture = true;
    try { await signOut(auth); } catch (e) { /* déjà déconnecté */ }
    try { Object.keys(localStorage).filter((k) => k === SESSION || k.startsWith("madiba-vu:")).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* stockage indisponible */ }
    try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { /* rien à effacer */ }
    location.hash = "#/accueil";
    location.reload();
  }
  if (action === "installer" && etat.installer) { etat.installer.prompt(); etat.installer = null; afficher(); }
});

racine.addEventListener("change", async (ev) => {
  const c = ev.target.dataset && ev.target.dataset.change;
  if (CHANGEMENTS[c] && ev.target.files && ev.target.files[0]) { await CHANGEMENTS[c](ev.target); return; }
  if (c === "langue") changerLangue(ev.target.value);
  if (c === "photo" && ev.target.files[0]) {
    const brouillon = lireFormCompte(ev.target.form);
    try { brouillon.photo = await reduirePhoto(ev.target.files[0]); etat.brouillon = brouillon; afficher(false, true); }
    catch (e) { message(t("val.photo")); }
  }
  if (c === "photo-fondateur" && ev.target.files[0]) {
    const d = lireFormFondateurs(ev.target.form);
    try { d.liste[Number(ev.target.dataset.i)].photo = await reduirePhoto(ev.target.files[0]); etat.fondBrouillon = d; afficher(false, true); }
    catch (e) { etat.info = { type: "erreur", texte: t("val.photo") }; afficher(false, true); }
  }
  if (c === "csv" && ev.target.files[0]) {
    etat.info = null;
    const liste = fichesDepuisCSV(await ev.target.files[0].text());
    if (!liste || !liste.length) { etat.importApercu = null; etat.info = { type: "erreur", texte: t("imp.erreurFichier") }; }
    else etat.importApercu = liste;
    afficher(false, true);
  }
  if (c === "type-compte") {
    // On garde ce qui est déjà saisi quand le formulaire change de forme.
    const form = ev.target.form;
    const garde = {};
    form.querySelectorAll("input:not([type=radio]), select").forEach((x) => { if (x.name) garde[x.name] = x.value; });
    etat.typeCompte = ev.target.value;
    afficher(false, true);
    const nouveau = document.getElementById(form.id);
    if (nouveau) for (const k in garde) { const x = nouveau.elements[k]; if (x && !(x instanceof RadioNodeList)) x.value = garde[k]; }
  }
});

racine.addEventListener("input", (ev) => {
  if (ev.target.dataset && ev.target.dataset.input === "rech-annuaire") {
    etat.rechAnnuaire = ev.target.value;
    const pos = ev.target.selectionStart;
    racine.querySelector("main").innerHTML = pageAnnuaire();
    const champ = document.getElementById("rech");
    if (champ) { champ.focus(); try { champ.setSelectionRange(pos, pos); } catch (e) { /* champ de recherche */ } }
  }
});

window.addEventListener("hashchange", () => { if (!etat.garderInfo) etat.info = null; etat.garderInfo = false; etat.brouillon = null; etat.fondBrouillon = null; etat.contactEnvoye = ""; etat.ideeEnvoyee = false; etat.voteEdition = null; afficher(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); etat.installer = e; if (route() === "accueil") afficher(false); });
// On démarre dès que les textes de la langue sont là (en secours : le français).
chargerLangue(etat.langue).catch(() => chargerLangue("fr").then(() => { etat.langue = "fr"; })).finally(demarrer);
// Les fichiers de l'application sont gardés sur l'appareil. Après une mise à jour sur GitHub,
// la nouvelle version s'installe en arrière-plan ; on propose de l'afficher.
if ("serviceWorker" in navigator) {
  const dejaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!dejaControle || document.querySelector(".maj-dispo")) return;
    const saisie = document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (performance.now() < 8000 && !saisie) { location.reload(); return; }
    const b = document.createElement("div");
    b.className = "maj-dispo"; b.setAttribute("role", "status");
    b.innerHTML = `<span>${te("maj.dispo")}</span><button class="btn or petit-btn" type="button">${te("maj.recharger")}</button>`;
    b.querySelector("button").addEventListener("click", () => location.reload());
    document.body.appendChild(b);
  });
}
