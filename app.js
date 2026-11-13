// Application Madiba Club — version 3 : codes membres, visibilité par club et par pôle,
// parcours interne, pastilles, annuaire, accueil illustré, trois langues.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
  collection, getDocs, query, where, addDoc, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";
import { T } from "./i18n.js";
import { convertirPDF } from "./journal.js";

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
const auth = getAuth(fb);
const db = getFirestore(fb);

function langueInitiale() {
  try { const s = localStorage.getItem("madiba-langue"); if (LANGUES.includes(s)) return s; } catch (e) { /* stockage indisponible */ }
  const n = (navigator.language || "fr").slice(0, 2).toLowerCase();
  return LANGUES.includes(n) ? n : "fr";
}

const aujourdhui = new Date();
const etat = {
  langue: langueInitiale(),
  pret: false, user: null, profil: null, erreurProfil: "", inscription: null, installer: null,
  events: null, news: null, journaux: null, pagesJournal: {}, modeJournal: "pages", erreurContenus: "", membres: null, fiches: null, codes: null, importApercu: null,
  filtreStatut: "avenir", filtreClub: "tous",
  mois: { a: aujourdhui.getFullYear(), m: aujourdhui.getMonth() },
  adminOnglet: "publier", typePublication: "event", info: null,
  messages: null, configPublique: null, infoNotif: null, fondateurs: null, fondBrouillon: null, contactEnvoye: "", contactCellule: "", typeCompte: "membre", brouillon: null, rechAnnuaire: "", filtreAnnuaire: "tous"
};
const racine = document.getElementById("app");

/* ---------- Outils ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function t(cle, vars) {
  let s = (T[etat.langue] && T[etat.langue][cle]) ?? T.fr[cle] ?? cle;
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
  gauche: '<path d="M15 6l-6 6 6 6"/>'
};
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;

function texteErreur(e) {
  const code = (e && e.code) || "";
  const cle = "err." + code;
  if (T.fr[cle]) return t(cle);
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

async function chargerProfil(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (snap.exists()) return snap.data();
  if (!etat.inscription) return null;
  const profil = await creerProfil(user, etat.inscription);
  etat.inscription = null;
  return profil;
}

onAuthStateChanged(auth, async (user) => {
  etat.user = user; etat.profil = null; etat.erreurProfil = ""; etat.membres = null; etat.fiches = null; etat.codes = null; etat.brouillon = null; etat.importApercu = null; etat.pagesJournal = {}; etat.messages = null;
  if (user) {
    try { etat.profil = await chargerProfil(user); }
    catch (e) { etat.erreurProfil = texteErreur(e); }
  }
  etat.pret = true;
  if (user && ["connexion", "inscription"].includes(route())) aller("accueil"); else afficher();
  chargerContenus();
});

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
  if (nom === "events") {
    if (role() === "admin") r.push(query(ref, where("visibility", "==", "pole"), where("clubId", "==", p.clubId)));
    else if (p.pole) r.push(query(ref, where("visibility", "==", "pole"), where("clubId", "==", p.clubId), where("pole", "==", p.pole)));
  }
  return r;
}
async function lire(nom) {
  const res = await Promise.allSettled(requetes(nom).map((q) => getDocs(q)));
  if (res[0].status === "rejected") throw res[0].reason;
  const parId = {};
  res.forEach((x) => { if (x.status === "fulfilled") x.value.docs.forEach((d) => { parId[d.id] = { id: d.id, ...d.data() }; }); });
  return Object.values(parId);
}
async function chargerContenus() {
  try {
    const [ev, nw] = await Promise.all([lire("events"), lire("news")]);
    etat.events = ev.filter((e) => typeof e.debut === "string" && e.debut.length >= 10);
    etat.news = nw.sort((x, y) => String(y.publieLe || "").localeCompare(String(x.publieLe || "")));
    etat.erreurContenus = "";
  } catch (e) {
    etat.events = etat.events || []; etat.news = etat.news || [];
    etat.erreurContenus = texteErreur(e);
  }
  try { etat.journaux = await lire("journaux"); } catch (e) { etat.journaux = etat.journaux || []; }
  try { const f = await getDoc(doc(db, "public", "fondateurs")); etat.fondateurs = f.exists() ? f.data() : {}; } catch (e) { etat.fondateurs = etat.fondateurs || {}; }
  try { const c = await getDoc(doc(db, "public", "config")); etat.configPublique = c.exists() ? c.data() : {}; } catch (e) { etat.configPublique = etat.configPublique || {}; }
  majJeton();
  afficher(false);
}
async function chargerMembres() {
  try {
    const [u, f] = await Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "fiches"))]);
    etat.membres = u.docs.map((d) => ({ uid: d.id, ...d.data() }));
    etat.fiches = f.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { etat.membres = etat.membres || []; etat.fiches = etat.fiches || []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
  afficher(false);
}
async function chargerCodes() {
  try {
    const snap = await getDoc(doc(db, "config", "codes"));
    etat.codes = snap.exists() ? snap.data() : {};
  } catch (e) { etat.codes = {}; etat.info = { type: "erreur", texte: texteErreur(e) }; }
  afficher(false);
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
const chargement = () => `<p class="gris centre">${te("chargement")}</p>`;
const erreurContenus = () => (etat.erreurContenus ? `<div class="message erreur" role="alert">${esc(etat.erreurContenus)}</div>` : "");
const blocInfo = () => (etat.info ? `<div class="message ${etat.info.type}" role="alert">${esc(etat.info.texte)}</div>` : "");

function carteEvent(e, admin) {
  const d = dateDe(e.debut);
  const st = statut(e);
  return `<article class="event">
    <div class="jour ${(club(e.clubId) || RESEAU).classe}"><span>${esc(fmt({ month: "short" }, d))}</span><strong>${d.getDate()}</strong></div>
    <div class="corps">
      <h3>${esc(e.titre)}</h3>
      <p class="petit gris">${esc(texteDate(e))}${e.lieu ? " · " + esc(e.lieu) : ""}</p>
      <p>${pastilleClub(e.clubId)} ${pastilleVis(e)}${st === "encours" ? ` <span class="pastille or">${te("ev.encours")}</span>` : ""}</p>
      ${e.description && !admin ? `<p class="description">${esc(e.description)}</p>` : ""}
      ${admin ? `<button class="lien-btn danger" type="button" data-action="suppr" data-col="events" data-id="${esc(e.id)}">${te("supprimer")}</button>` : ""}
    </div>
  </article>`;
}
function carteNews(n, admin, court) {
  return `<article class="carte">
    <p class="ligne-pastilles">${pastilleClub(n.clubId)} ${pastilleVis(n)}<span class="petit gris date">${esc(texteDatePublication(n.publieLe))}</span></p>
    <h3>${esc(n.titre)}</h3>
    ${court || admin ? "" : `<p class="description">${esc(n.texte)}</p>`}
    ${admin ? `<button class="lien-btn danger" type="button" data-action="suppr" data-col="news" data-id="${esc(n.id)}">${te("supprimer")}</button>` : ""}
  </article>`;
}

/* ---------- Accueil ---------- */
function pageAccueil() {
  const p = etat.profil;
  let actions, sous;
  if (!etat.user) {
    sous = te("acc.sous");
    actions = `<a class="btn or" href="#/inscription">${te("creerCompte")}</a><a class="btn contour-clair" href="#/evenements">${te("acc.voirEvents")}</a>`;
  } else if (p) {
    sous = esc(t("acc.bonjour", { prenom: p.prenom })) + (p.clubId ? " · " + esc(nomClub(p.clubId)) : "");
    actions = (estAdmin() ? `<a class="btn or" href="#/admin">${te("admin.titre")}</a>` : "")
      + (estMembre() ? `<a class="btn contour-clair" href="#/annuaire">${te("annuaire.titre")}</a>` : `<a class="btn contour-clair" href="#/evenements">${te("acc.voirEvents")}</a>`);
  } else { sous = te("acc.sous"); actions = ""; }

  let haut = `<section class="hero-photo">
      <img src="images/groupe.jpg" alt="${te("acc.altGroupe")}">
      <div class="texte">
        <h1>${te("acc.titre1")}<br><span>${te("acc.titre2")}</span></h1>
        <p>${sous}</p>
        ${actions ? `<div class="actions">${actions}</div>` : ""}
      </div>
    </section>`;
  if (etat.user && etat.erreurProfil) haut += `<div class="message erreur" role="alert">${esc(etat.erreurProfil)}</div>`;
  if (etat.user && !p && !etat.erreurProfil) haut += pageProfilInitial();
  haut += blocInfo();
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
      <img class="photo" src="images/maroc.jpg" alt="${te("acc.altMaroc")}" loading="lazy">
      ${salle("acc.s1lieu", "acc.s1titre", "acc.s1texte")}
      ${salle("acc.s2lieu", "acc.s2titre", "acc.s2texte")}
      ${salle("acc.s3lieu", "acc.s3titre", "acc.s3texte")}
      ${salle("acc.s4lieu", "acc.s4titre", "acc.s4texte")}
    </section>
    <section class="bloc">
      <img class="photo haute" src="images/histoire.jpg" alt="${te("acc.altHistoire")}" loading="lazy">
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
function carteJournal(j, admin) {
  const sous = [j.numero, j.periode].filter(Boolean).join(" · ");
  return `<article class="carte journal">
    ${imageSure(j.couverture) ? `<img class="couverture" src="${j.couverture}" alt="">` : ""}
    <div class="corps">
      <p class="ligne-pastilles"><span class="pastille or-plein">${te("journal.pastille")}</span> ${pastilleClub(j.clubId)} ${pastilleVis(j)}</p>
      <h3>${esc(j.titre)}</h3>
      ${sous ? `<p class="petit gris">${esc(sous)}</p>` : ""}
      ${admin ? `<button class="lien-btn danger" type="button" data-action="suppr-journal" data-id="${esc(j.id)}">${te("supprimer")}</button>`
        : `<a class="btn contour petit-btn" href="#/journal/${esc(j.id)}">${te("journal.lire")}</a>`}
    </div>
  </article>`;
}
async function chargerPages(id) {
  try {
    const snap = await getDocs(collection(db, "journaux", id, "pages"));
    etat.pagesJournal[id] = snap.docs.map((d) => d.data()).sort((a, b) => (a.n || 0) - (b.n || 0));
  } catch (e) { etat.pagesJournal[id] = []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
  afficher(false);
}
function pageJournal() {
  if (etat.journaux === null) return chargement();
  const id = param();
  const j = etat.journaux.find((x) => x.id === id);
  const retour = `<a class="lien-btn" href="#/news">${ico("gauche")} ${te("journal.retour")}</a>`;
  if (!j) return `${retour}<section class="carte"><p>${te("journal.introuvable")}</p></section>`;
  const pages = etat.pagesJournal[id];
  if (!pages) chargerPages(id);
  const sous = [j.numero, j.periode].filter(Boolean).join(" · ");
  let corps = chargement();
  if (pages && etat.modeJournal === "pages") {
    corps = `<div class="j-pages">${pages.map((p) => (imageSure(p.image) ? `<img src="${p.image}" alt="${esc(t("journal.page", { n: p.n }))}" loading="lazy">` : "")).join("")}</div>`;
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
function pageBoard() {
  const bloc = (b) => `<img class="photo" src="${b.image}" alt="${esc(t("board.altImage", { annee: b.annee }))}" loading="lazy">
    <div class="liste">${b.membres.map(([nom, poste]) => `<div class="ligne"><span class="txt"><strong>${esc(nom)}</strong><span>${esc(poste)}</span></span></div>`).join("")}</div>`;
  const [actuel, ...anciens] = BOARDS;
  return `<h1>${te("board.titre")}</h1>
    <p class="gris">Madiba Bruxelles · ${esc(actuel.annee)}</p>
    ${bloc(actuel)}
    <h2>${te("board.anciens")}</h2>
    ${anciens.map((b) => `<details class="carte"><summary>${esc(t("board.annee", { annee: b.annee }))}</summary>${bloc(b)}</details>`).join("")}`;
}
const blocReseaux = () => `<div class="rangee">${RESEAUX.map(([nom, url]) => `<a class="btn contour petit-btn" href="${url}" target="_blank" rel="noopener">${nom}</a>`).join("")}</div>`;

/* ---------- Contact : le message part vers la cellule choisie ---------- */
const OBJETS = ["o1", "o2", "o3", "o4", "o5"];
const nomCellule = (id) => t("contact." + ((club(id) || {}).pays || "be"));
function pageContact() {
  if (etat.contactEnvoye) {
    return `<h1>${te("contact.titre")}</h1><section class="carte centre-carte">
      <h2>${te("contact.okTitre")}</h2>
      <p>${esc(t("contact.okTexte", { cellule: nomCellule(etat.contactEnvoye) }))}</p>
      <button class="btn contour" type="button" data-action="contact-autre">${te("contact.autre")}</button></section>`;
  }
  const p = etat.profil;
  const choisi = etat.contactCellule || (p && club(p.clubId) ? p.clubId : CLUBS[0].id);
  return `<h1>${te("contact.titre")}</h1>
    <section class="carte">
      <div id="msg" aria-live="polite"></div>
      <form id="form-contact" novalidate>
        <fieldset class="choix"><legend>${te("contact.cellule")}</legend>
          ${CLUBS.map((c) => `<label><input type="radio" name="clubId" value="${c.id}"${c.id === choisi ? " checked" : ""}> <span><strong>${esc(nomCellule(c.id))}</strong> · ${esc(c.nom)}</span></label>`).join("")}
        </fieldset>
        <div class="champ"><label for="c_nom">${te("contact.nom")}</label><input id="c_nom" name="nom" autocomplete="name" maxlength="120" value="${esc(p ? p.prenom + " " + p.nom : "")}" required></div>
        <div class="champ"><label for="c_email">${te("email")}</label><input id="c_email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="160" value="${esc(etat.user ? etat.user.email : "")}" required></div>
        <div class="champ"><label for="objet">${te("contact.objet")}</label><select id="objet" name="objet">${OBJETS.map((o) => `<option value="${o}">${te("contact." + o)}</option>`).join("")}</select></div>
        <div class="champ"><label for="c_message">${te("contact.message")}</label><textarea id="c_message" name="message" rows="5" maxlength="4000" required></textarea></div>
        <div class="cache" aria-hidden="true"><label for="site">Site</label><input id="site" name="site" tabindex="-1" autocomplete="off"></div>
        <button class="btn plein large" type="submit">${te("contact.envoyer")}</button>
        <p class="petit gris">${te("contact.note")}</p>
      </form>
    </section>`;
}

async function chargerMessages() {
  try {
    const ref = collection(db, "messages");
    const snap = await getDocs(estSuper() ? ref : query(ref, where("clubId", "==", etat.profil.clubId)));
    etat.messages = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => String(y.creeLe || "").localeCompare(String(x.creeLe || "")));
  } catch (e) { etat.messages = []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
  afficher(false);
}
function adminMessages() {
  if (etat.messages === null) { chargerMessages(); return chargement(); }
  const carte = (m) => `<article class="carte">
      <p class="ligne-pastilles">${pastilleClub(m.clubId)} <span class="pastille contour">${te("contact." + (OBJETS.includes(m.objet) ? m.objet : "o5"))}</span><span class="petit gris date">${esc(texteDatePublication(m.creeLe))}</span></p>
      <p><strong>${esc(m.nom)}</strong></p>
      <p class="description">${esc(m.message)}</p>
      <div class="rangee">
        <a class="btn contour petit-btn" href="mailto:${esc(m.email)}">${te("admin.msgRepondre")}</a>
        <button class="lien-btn danger" type="button" data-action="suppr-message" data-id="${esc(m.id)}">${te("supprimer")}</button>
      </div>
      <p class="petit gris">${esc(m.email)}</p>
    </article>`;
  return `<p class="petit gris">${te("admin.msgAide")}</p>${etat.messages.length ? etat.messages.map(carte).join("") : `<p class="gris">${te("admin.msgAucun")}</p>`}`;
}

/* ---------- Les fondateurs : page publique, remplie par le super-administrateur ---------- */
function pageFondateurs() {
  if (etat.fondateurs === null) return `<h1>${te("fond.titre")}</h1>` + chargement();
  const f = etat.fondateurs;
  const liste = Array.isArray(f.liste) ? f.liste : [];
  const vide = !f.histoire && !liste.length;
  return `<section class="hero-logo"><img src="icons/logo-or.png" alt="Madiba Club"><h1>${te("fond.titre")}</h1>${f.annee ? `<p>${esc(t("fond.depuis", { annee: f.annee }))}</p>` : ""}</section>
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
  const m = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js");
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

function pageAuth(mode) {
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
const monEmail = () => String((etat.user && etat.user.email) || "").toLowerCase();
const maFiche = () => (etat.fiches || []).find((f) => f.email && f.email === monEmail());
function reduirePhoto(file) {
  return new Promise((ok, ko) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const cote = 240, c = document.createElement("canvas");
      const r = Math.max(cote / img.width, cote / img.height), w = img.width * r, h = img.height * r;
      c.width = cote; c.height = cote;
      c.getContext("2d").drawImage(img, (cote - w) / 2, (cote - h) / 2, w, h);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ko(new Error("image")); };
    img.src = url;
  });
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
    if (etat.fiches === null) chargerMembres();
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

/* ---------- Plus ---------- */
function pagePlus() {
  const ligne = (tt, s, pastille) => `<div class="ligne inactif"><span class="txt"><strong>${esc(tt)}</strong><span>${esc(s)}</span></span><span class="pastille">${esc(pastille)}</span></div>`;
  const lien = (href, tt, s) => `<a class="ligne" href="${href}"><span class="txt"><strong>${esc(tt)}</strong><span>${esc(s)}</span></span>${ico("fleche")}</a>`;
  return `<h1>${te("nav.plus")}</h1>
    <div class="surtitre">${te("plus.monEspace")}</div>
    <div class="liste">
      ${etat.user ? lien("#/compte", t("compte.titre"), etat.user.email || "") : lien("#/connexion", t("seConnecter"), t("plus.ouCreer"))}
      ${estAdmin() ? lien("#/admin", t("admin.titre"), t("plus.adminSous")) : ""}
    </div>
    <div class="surtitre">${te("plus.membres")}</div>
    <div class="liste">${estMembre() ? lien("#/annuaire", t("annuaire.titre"), t("plus.annuaireSous")) : ligne(t("annuaire.titre"), t("plus.annuaireSous"), t("plus.reserve"))}</div>
    <div class="surtitre">${te("plus.reseau")}</div>
    <div class="liste">
      ${lien("#/board", t("board.titre"), t("plus.boardSous"))}
      ${lien("#/fondateurs", t("plus.fondateurs"), t("plus.fondateursSous"))}
      ${lien("#/contact", t("plus.contact"), t("plus.contactSous"))}
    </div>
    ${blocNotifications()}
    <div class="surtitre">${te("acc.suivre")}</div>
    ${blocReseaux()}
    <div class="surtitre">${te("langue.titre")}</div>
    <div class="puces">${LANGUES.map((l) => `<button type="button" class="puce ${etat.langue === l ? "actif" : ""}" data-action="langue" data-v="${l}">${te("langue." + l)}</button>`).join("")}</div>`;
}

/* ---------- Espace admin ---------- */
function champClub(avecReseau) {
  if (estSuper()) return `<div class="champ"><label for="clubId">${te("admin.club")}</label><select id="clubId" name="clubId" required>${optionsClubs(etat.profil.clubId, avecReseau)}</select></div>`;
  return `<input type="hidden" name="clubId" value="${esc(etat.profil.clubId)}"><p class="petit gris">${te("admin.pour")} <strong>${esc(nomClub(etat.profil.clubId))}</strong></p>`;
}
function champVisibilite(avecPole, defaut) {
  const choix = ["public", "members", "club"].concat(avecPole ? ["pole"] : []);
  return `<div class="champ"><label for="visibility">${te("admin.qui")}</label>
      <select id="visibility" name="visibility">${choix.map((v) => `<option value="${v}"${v === defaut ? " selected" : ""}>${te("admin.vis." + v)}</option>`).join("")}</select></div>
    ${avecPole ? `<div class="champ"><label for="pole">${te("admin.pole")}</label><select id="pole" name="pole">${optionsPoles()}</select><span class="aide">${te("admin.poleAide")}</span></div>` : ""}`;
}

function adminPublier() {
  const ev = etat.typePublication === "event";
  const jr = etat.typePublication === "journal";
  const formulaire = jr ? `<form id="form-journal" novalidate>
      <p class="petit gris">${te("admin.jAide")}</p>
      <div class="champ"><label for="titre">${te("admin.jTitre")}</label><input id="titre" name="titre" maxlength="120" value="Le Journal du Madiba" required></div>
      <div class="deux">
        <div class="champ"><label for="numero">${te("admin.jNumero")}</label><input id="numero" name="numero" maxlength="40" placeholder="N°1 · 2025-2026"></div>
        <div class="champ"><label for="date">${te("admin.jDate")}</label><input id="date" name="date" type="date" required></div>
      </div>
      <div class="champ"><label for="periode">${te("admin.jPeriode")}</label><input id="periode" name="periode" maxlength="60" placeholder="Janvier-Février 2026"></div>
      ${champClub(false)}
      ${champVisibilite(false, "club")}
      <div class="champ"><label for="pdf">${te("admin.jFichier")}</label><input id="pdf" type="file" accept="application/pdf,.pdf" required></div>
      <button class="btn plein large" type="submit">${te("admin.publierJournal")}</button>
    </form>` : ev ? `<form id="form-event" novalidate>
      <div class="champ"><label for="titre">${te("admin.evTitre")}</label><input id="titre" name="titre" maxlength="120" required></div>
      ${champClub(false)}
      <div class="deux">
        <div class="champ"><label for="dateDebut">${te("admin.dateDebut")}</label><input id="dateDebut" name="dateDebut" type="date" required></div>
        <div class="champ"><label for="heureDebut">${te("admin.heure")}</label><input id="heureDebut" name="heureDebut" type="time"></div>
      </div>
      <div class="deux">
        <div class="champ"><label for="dateFin">${te("admin.dateFin")}</label><input id="dateFin" name="dateFin" type="date"></div>
        <div class="champ"><label for="heureFin">${te("admin.heureFin")}</label><input id="heureFin" name="heureFin" type="time"></div>
      </div>
      <div class="champ"><label for="lieu">${te("admin.lieu")}</label><input id="lieu" name="lieu" maxlength="120"></div>
      <div class="champ"><label for="description">${te("admin.description")}</label><textarea id="description" name="description" rows="4" maxlength="2000"></textarea></div>
      ${champVisibilite(true)}
      <button class="btn plein large" type="submit">${te("admin.publierEv")}</button>
    </form>` : `<form id="form-news" novalidate>
      <div class="champ"><label for="titre">${te("admin.newsTitre")}</label><input id="titre" name="titre" maxlength="120" required></div>
      ${champClub(true)}
      <div class="champ"><label for="texte">${te("admin.texte")}</label><textarea id="texte" name="texte" rows="6" maxlength="4000" required></textarea></div>
      ${champVisibilite(false)}
      <button class="btn plein large" type="submit">${te("admin.publierNews")}</button>
    </form>`;
  return `<div class="puces">
      <button type="button" class="puce ${ev ? "actif" : ""}" data-action="type" data-v="event">${te("admin.unEvent")}</button>
      <button type="button" class="puce ${!ev && !jr ? "actif" : ""}" data-action="type" data-v="news">${te("admin.uneNews")}</button>
      <button type="button" class="puce ${jr ? "actif" : ""}" data-action="type" data-v="journal">${te("admin.unJournal")}</button>
    </div>
    <section class="carte"><div id="msg" aria-live="polite"></div>${formulaire}</section>`;
}

const peutGerer = (clubId) => estSuper() || (!!etat.profil && !!clubId && etat.profil.clubId === clubId);

function adminContenus() {
  if (etat.events === null) return chargement();
  const evs = etat.events.filter((e) => peutGerer(e.clubId)).sort((x, y) => debutComplet(y).localeCompare(debutComplet(x)));
  const nws = etat.news.filter((n) => peutGerer(n.clubId));
  return `<h2>${te("admin.evPublies")}</h2>${evs.length ? evs.map((e) => carteEvent(e, true)).join("") : `<p class="gris">${te("admin.aucunEv")}</p>`}
    <h2>${te("admin.newsPubliees")}</h2>${nws.length ? nws.map((n) => carteNews(n, true)).join("") : `<p class="gris">${te("admin.aucuneNews")}</p>`}
    <h2>${te("admin.jPublies")}</h2>${(etat.journaux || []).filter((j) => peutGerer(j.clubId)).length ? fil().filter((x) => x.genre === "journal" && peutGerer(x.clubId)).map((j) => carteJournal(j, true)).join("") : `<p class="gris">${te("admin.aucunJournal")}</p>`}
    <p class="petit gris">${te("admin.corriger")}</p>`;
}

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

function pageAdmin() {
  if (!estAdmin()) return `<h1>${te("admin.titre")}</h1><section class="carte"><p>${te("admin.reserve")}</p></section>`;
  const onglets = ["publier", "contenus", "membres", "messages"].concat(estSuper() ? ["codes"] : []);
  if (!onglets.includes(etat.adminOnglet)) etat.adminOnglet = "publier";
  const corps = { publier: adminPublier, contenus: adminContenus, membres: adminMembres, messages: adminMessages, codes: adminCodes }[etat.adminOnglet]();
  return `<h1>${te("admin.titre")}</h1>
    <p class="petit gris">${estSuper() ? te("admin.tous") : te("admin.vousGerez") + " " + esc(nomClub(etat.profil.clubId))}</p>
    <div class="onglets defile">${onglets.map((v) => `<button type="button" class="${etat.adminOnglet === v ? "actif" : ""}" data-action="onglet-admin" data-v="${v}">${te("admin.onglet." + v)}</button>`).join("")}</div>
    ${blocInfo()}${corps}`;
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
  const onglet = ONGLETS.includes(r) ? r : r === "journal" ? "news" : "plus";
  document.documentElement.lang = etat.langue;
  document.body.classList.toggle("nuit", r === "accueil");
  racine.innerHTML = `
    <header class="entete">
      <a class="marque" href="#/accueil"><img src="icons/icon-192.png" alt=""><span class="nom titre">Madiba Club</span></a>
      <label class="cache" for="choix-langue">${te("langue.titre")}</label>
      <select id="choix-langue" class="langue" data-change="langue">${LANGUES.map((l) => `<option value="${l}"${l === etat.langue ? " selected" : ""}>${l.toUpperCase()}</option>`).join("")}</select>
      <a class="compte" href="${etat.user ? "#/compte" : "#/connexion"}">${te(etat.user ? "compte.court" : "seConnecter")}</a>
    </header>
    <main>${PAGES[r]()}</main>
    <nav class="nav" aria-label="${te("nav.label")}">
      ${ONGLETS.map((id) => `<a href="#/${id}" class="${id === onglet ? "actif" : ""}"${id === onglet ? ' aria-current="page"' : ""}>${ico(id)}${te("nav." + id)}</a>`).join("")}
    </nav>`;
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
function changerLangue(l) {
  if (!LANGUES.includes(l)) return;
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
      try { etat.profil = await creerProfil(etat.user, d); afficher(); chargerContenus(); }
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
      etat.info = { type: "ok", texte: t("code.ok", { club: nomClub(v.clubId) }) };
      afficher(); chargerContenus();
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
    occupe(form, true);
    try {
      await updateDoc(doc(db, "users", etat.user.uid), d);
      etat.profil = { ...etat.profil, ...d }; etat.brouillon = null; etat.membres = null;
      etat.info = { type: "ok", texte: t("compte.enregistre") };
      afficher(); chargerContenus();
    } catch (e) { message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-event") {
    if (!v.titre || !v.clubId || !v.dateDebut) return message(t("val.event"));
    if (v.visibility === "pole" && !v.pole) return message(t("val.pole"));
    const e = {
      titre: v.titre, clubId: v.clubId, lieu: v.lieu, description: v.description, visibility: v.visibility || "public",
      pole: v.visibility === "pole" ? v.pole : "",
      debut: v.dateDebut + (v.heureDebut ? "T" + v.heureDebut : ""),
      fin: v.dateFin || v.heureFin ? (v.dateFin || v.dateDebut) + (v.heureFin ? "T" + v.heureFin : "") : ""
    };
    if (e.fin && finComplete(e) < debutComplet(e)) return message(t("val.fin"));
    occupe(form, true);
    try {
      await addDoc(collection(db, "events"), { ...e, auteur: etat.user.uid, createdAt: serverTimestamp() });
      etat.info = { type: "ok", texte: t("admin.evOk", { titre: e.titre }) };
      etat.adminOnglet = "contenus";
      afficher(); chargerContenus();
    } catch (err) { message(texteErreur(err)); occupe(form, false); }
  }

  if (form.id === "form-news") {
    if (!v.titre || !v.clubId || !v.texte) return message(t("val.news"));
    occupe(form, true);
    try {
      await addDoc(collection(db, "news"), {
        titre: v.titre, clubId: v.clubId, texte: v.texte, visibility: v.visibility || "public",
        publieLe: new Date().toISOString(), auteur: etat.user.uid, createdAt: serverTimestamp()
      });
      etat.info = { type: "ok", texte: t("admin.newsOk", { titre: v.titre }) };
      etat.adminOnglet = "contenus";
      afficher(); chargerContenus();
    } catch (err) { message(texteErreur(err)); occupe(form, false); }
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

  if (form.id === "form-contact") {
    if (v.site) return; // champ piège rempli par un robot
    if (!v.clubId || !v.nom || !v.message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email || "")) return message(t("val.contact"));
    occupe(form, true);
    try {
      const m = { clubId: v.clubId, nom: v.nom, email: v.email, objet: v.objet || "o5", message: v.message, creeLe: new Date().toISOString() };
      if (etat.user) m.uid = etat.user.uid;
      await addDoc(collection(db, "messages"), m);
      etat.contactEnvoye = v.clubId; etat.messages = null;
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

  if (form.id === "form-journal") {
    const fichier = form.querySelector("#pdf").files[0];
    if (!v.titre || !v.clubId || !v.date || !fichier) return message(t("val.journal"));
    const bouton = form.querySelector('button[type="submit"]');
    const libelle = bouton.textContent;
    occupe(form, true);
    let conv;
    try { conv = await convertirPDF(fichier, (i, n) => { bouton.textContent = t("admin.jConversion", { i, n }); }); }
    catch (e) { message(t("val.pdf")); bouton.textContent = libelle; return occupe(form, false); }
    if (conv.pages.length > 40) { message(t("val.pdfGros")); bouton.textContent = libelle; return occupe(form, false); }
    try {
      const ref = await addDoc(collection(db, "journaux"), {
        titre: v.titre, numero: v.numero, periode: v.periode, clubId: v.clubId, visibility: v.visibility || "club", pole: "",
        nbPages: conv.pages.length, couverture: conv.couverture, publieLe: v.date + "T12:00:00.000Z",
        auteur: etat.user.uid, createdAt: serverTimestamp()
      });
      for (let i = 0; i < conv.pages.length; i++) {
        bouton.textContent = t("admin.jEnvoi", { i: i + 1, n: conv.pages.length });
        await setDoc(doc(db, "journaux", ref.id, "pages", String(i + 1).padStart(3, "0")), { n: i + 1, image: conv.pages[i].image, blocs: conv.pages[i].blocs });
      }
      etat.info = { type: "ok", texte: t("admin.jOk", { titre: v.titre, n: conv.pages.length }) };
      etat.adminOnglet = "contenus";
      afficher(); chargerContenus();
    } catch (err) { message(texteErreur(err)); bouton.textContent = libelle; occupe(form, false); }
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

  if (action === "statut") { etat.filtreStatut = v; afficher(false); }
  if (action === "club") { etat.filtreClub = v; afficher(false); }
  if (action === "type") { etat.typePublication = v; afficher(false); }
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
  if (action === "notif-activer" || action === "notif-desactiver") {
    el.disabled = true;
    try {
      if (action === "notif-activer") { await activerNotifications(); etat.infoNotif = { type: "ok", texte: t("notif.ok") }; }
      else { await desactiverNotifications(); etat.infoNotif = { type: "ok", texte: t("notif.off") }; }
    } catch (e) {
      const cle = "err." + ((e && e.code) || "");
      etat.infoNotif = { type: "erreur", texte: T.fr[cle] && /^err\.notif\//.test(cle) ? t(cle) : t("err.notif/erreur") };
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
    el.disabled = true;
    try {
      await deleteDoc(doc(db, "messages", el.dataset.id));
      etat.messages = (etat.messages || []).filter((m) => m.id !== el.dataset.id);
      etat.info = { type: "ok", texte: t("admin.msgSupprOk") };
    } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; }
    afficher(false);
  }
  if (action === "video") {
    document.getElementById("video").innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${VIDEO}?autoplay=1" title="${te("acc.videoTitre")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }
  if (action === "suppr-journal") {
    if (!window.confirm(t("admin.confirmer"))) return;
    el.disabled = true;
    try {
      const id = el.dataset.id;
      const pages = await getDocs(collection(db, "journaux", id, "pages"));
      for (const d of pages.docs) await deleteDoc(doc(db, "journaux", id, "pages", d.id));
      await deleteDoc(doc(db, "journaux", id));
      delete etat.pagesJournal[id];
      etat.info = { type: "ok", texte: t("admin.supprOk") };
    } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; }
    await chargerContenus();
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
      etat.profil = { ...etat.profil, ...maj }; etat.brouillon = null; etat.membres = null;
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
    } catch (e) { etat.info = { type: "erreur", texte: t("imp.partiel", { i: faits, n: liste.length }) + " " + texteErreur(e) }; }
    etat.importApercu = null; etat.membres = null; etat.fiches = null;
    afficher();
  }

  if (action === "suppr") {
    if (!window.confirm(t("admin.confirmer"))) return;
    el.disabled = true;
    try {
      await deleteDoc(doc(db, el.dataset.col, el.dataset.id));
      etat.info = { type: "ok", texte: t("admin.supprOk") };
    } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; }
    await chargerContenus();
  }

  if (action === "role" || action === "badge") {
    el.disabled = true;
    const maj = action === "role" ? { role: el.dataset.role }
      : { [el.dataset.champ]: el.dataset.champ === "statut" ? el.dataset.valeur : el.dataset.valeur === "1" };
    try {
      await updateDoc(doc(db, "users", el.dataset.uid), maj);
      const u = (etat.membres || []).find((x) => x.uid === el.dataset.uid);
      if (u) Object.assign(u, maj);
      if (etat.user && el.dataset.uid === etat.user.uid) Object.assign(etat.profil, maj);
      etat.info = { type: "ok", texte: t("admin.majOk") };
    } catch (e) { etat.info = { type: "erreur", texte: texteErreur(e) }; }
    afficher(false);
  }

  if (action === "google") {
    message("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { message(texteErreur(e)); }
  }
  if (action === "oubli") {
    const email = (document.getElementById("email") || {}).value || "";
    if (!email.trim()) return message(t("val.emailDabord"));
    try { await sendPasswordResetEmail(auth, email.trim()); message(t("mdpEnvoye"), "ok"); }
    catch (e) { message(texteErreur(e)); }
  }
  if (action === "deconnexion") { await signOut(auth); aller("accueil"); }
  if (action === "installer" && etat.installer) { etat.installer.prompt(); etat.installer = null; afficher(); }
});

racine.addEventListener("change", async (ev) => {
  const c = ev.target.dataset && ev.target.dataset.change;
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

window.addEventListener("hashchange", () => { if (!etat.garderInfo) etat.info = null; etat.garderInfo = false; etat.brouillon = null; etat.fondBrouillon = null; etat.contactEnvoye = ""; afficher(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); etat.installer = e; if (route() === "accueil") afficher(false); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
