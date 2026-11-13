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

// Les clubs du réseau. Pour en ajouter un : une ligne ici (et son nom dans i18n.js).
const CLUBS = [
  { id: "bruxelles", nom: "Madiba Bruxelles", classe: "c-noir" },
  { id: "manchester", nom: "Madiba Manchester", classe: "c-or" }
];
const RESEAU = { id: "reseau", nom: "Madiba", classe: "c-reseau" };
// Les pôles (équipes). Pour en ajouter un : un nom de plus ici.
const POLES = ["Board", "Public Relations", "Network & Communication", "Events"];
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
  events: null, news: null, erreurContenus: "", membres: null, codes: null,
  filtreStatut: "avenir", filtreClub: "tous",
  mois: { a: aujourdhui.getFullYear(), m: aujourdhui.getMonth() },
  adminOnglet: "publier", typePublication: "event", info: null,
  typeCompte: "membre", brouillon: null, rechAnnuaire: "", filtreAnnuaire: "tous"
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
const route = () => (location.hash.replace(/^#\/?/, "") || "accueil").split("?")[0];
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
  etat.user = user; etat.profil = null; etat.erreurProfil = ""; etat.membres = null; etat.codes = null; etat.brouillon = null;
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
  afficher(false);
}
async function chargerMembres() {
  try {
    const snap = await getDocs(collection(db, "users"));
    etat.membres = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  } catch (e) { etat.membres = []; etat.info = { type: "erreur", texte: texteErreur(e) }; }
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
    if (etat.news.length) {
      contenus += `<div class="titre-section"><h2>${te("acc.dernieres")}</h2><a href="#/news">${te("toutVoir")}</a></div>` + etat.news.slice(0, 2).map((n) => carteNews(n, false, true)).join("");
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
      <h2>${te("acc.partenairesTitre")}</h2>
      <p class="partenaires">${PARTENAIRES.map(esc).join(" · ")}</p>
    </section>`;
  return haut + erreurContenus() + contenus + presentation + blocInstallation();
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
  if (etat.news !== null) liste = etat.news.length ? etat.news.map((n) => carteNews(n)).join("") : `<p class="gris centre">${te("news.aucune")}</p>`;
  return `<h1>${te("nav.news")}</h1>${erreurContenus()}${liste}`;
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
function lireFormCompte(form) {
  const v = Object.fromEntries(new FormData(form).entries());
  const texte = (k) => String(v[k] || "").trim();
  const parcours = [];
  for (let i = 0; ("p_annee_" + i) in v; i++) parcours.push({ annee: texte("p_annee_" + i), pole: texte("p_pole_" + i), poste: texte("p_poste_" + i) });
  return {
    prenom: texte("prenom"), nom: texte("nom"), anneeEntree: texte("anneeEntree"), pole: texte("pole"), poste: texte("poste"),
    etudes: texte("etudes"), linkedin: texte("linkedin"), parcours, visibleAnnuaire: v.visibleAnnuaire === "on"
  };
}

function pageCompte() {
  if (!etat.user) return pageAuth("connexion");
  const p = etat.profil;
  if (!p) return `<h1>${te("compte.titre")}</h1>` + pageProfilInitial() + `<button class="btn contour large" type="button" data-action="deconnexion">${te("deconnexion")}</button>`;
  const b = etat.brouillon || { ...p, parcours: Array.isArray(p.parcours) ? p.parcours : [] };
  let corps = `<h1>${te("compte.titre")}</h1>${blocInfo()}
    <section class="carte">
      <p><strong>${esc(p.prenom)} ${esc(p.nom)}</strong></p>
      <p class="gris">${esc(etat.user.email || "")}</p>
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
    const lignes = b.parcours.map((x, i) => `<div class="parcours-ligne">
        <div class="deux">
          <div class="champ"><label for="p_annee_${i}">${te("parcours.annee")}</label><input id="p_annee_${i}" name="p_annee_${i}" placeholder="2025-2026" value="${esc(x.annee)}"></div>
          <div class="champ"><label for="p_pole_${i}">${te("parcours.pole")}</label><select id="p_pole_${i}" name="p_pole_${i}">${optionsPoles(x.pole)}</select></div>
        </div>
        <div class="champ"><label for="p_poste_${i}">${te("parcours.poste")}</label><input id="p_poste_${i}" name="p_poste_${i}" value="${esc(x.poste)}"></div>
        <button class="lien-btn danger" type="button" data-action="parcours-suppr" data-v="${i}">${te("parcours.retirer")}</button>
      </div>`).join("");
    corps += `<section class="carte">
      <h2>${te("parcours.titre")}</h2><p class="gris petit">${te("parcours.intro")}</p>
      <div id="msg" aria-live="polite"></div>
      <form id="form-compte" novalidate>
        ${champsNom(b)}
        <div class="deux">
          <div class="champ"><label for="anneeEntree">${te("parcours.entree")}</label><input id="anneeEntree" name="anneeEntree" inputmode="numeric" maxlength="4" placeholder="2024" value="${esc(b.anneeEntree)}"></div>
          <div class="champ"><label for="pole">${te("parcours.poleActuel")}</label><select id="pole" name="pole">${optionsPoles(b.pole)}</select></div>
        </div>
        <div class="champ"><label for="poste">${te("parcours.posteActuel")}</label><input id="poste" name="poste" maxlength="80" value="${esc(b.poste)}"></div>
        <h3>${te("parcours.anciens")}</h3>
        ${lignes || `<p class="gris petit">${te("parcours.vide")}</p>`}
        <button class="btn contour" type="button" data-action="parcours-ajout">${te("parcours.ajouter")}</button>
        <div class="champ"><label for="etudes">${te("parcours.etudes")}</label><input id="etudes" name="etudes" maxlength="120" value="${esc(b.etudes)}"></div>
        <div class="champ"><label for="linkedin">${te("parcours.linkedin")}</label><input id="linkedin" name="linkedin" inputmode="url" placeholder="https://www.linkedin.com/in/…" value="${esc(b.linkedin)}"></div>
        <label class="case-coche"><input type="checkbox" name="visibleAnnuaire"${b.visibleAnnuaire ? " checked" : ""}> <span>${te("parcours.consentement")}</span></label>
        <button class="btn plein large" type="submit">${te("enregistrer")}</button>
      </form></section>`;
  }
  const langues = `<section class="carte"><h2>${te("langue.titre")}</h2><div class="puces">${LANGUES.map((l) => `<button type="button" class="puce ${etat.langue === l ? "actif" : ""}" data-action="langue" data-v="${l}">${te("langue." + l)}</button>`).join("")}</div></section>`;
  return corps + langues + `<button class="btn contour large" type="button" data-action="deconnexion">${te("deconnexion")}</button>`;
}

/* ---------- Annuaire (membres uniquement) ---------- */
const lienSur = (url) => (/^https?:\/\//i.test(url || "") ? url : "");
function pageAnnuaire() {
  if (!estMembre()) {
    return `<h1>${te("annuaire.titre")}</h1><section class="carte"><p>${te("annuaire.reserve")}</p>
      <a class="btn contour" href="${etat.user ? "#/compte" : "#/connexion"}">${te(etat.user ? "code.jai" : "seConnecter")}</a></section>`;
  }
  if (etat.membres === null) { chargerMembres(); return `<h1>${te("annuaire.titre")}</h1>` + chargement(); }
  const rech = etat.rechAnnuaire.trim().toLowerCase();
  const filtres = ["tous"].concat(CLUBS.map((c) => c.id), ["board", "alumni"]);
  const liste = etat.membres
    .filter((u) => ROLES_MEMBRES.includes(u.role) && u.visibleAnnuaire)
    .filter((u) => {
      const f = etat.filtreAnnuaire;
      if (f === "board") return !!u.board;
      if (f === "alumni") return u.statut === "alumni";
      return f === "tous" || u.clubId === f;
    })
    .filter((u) => !rech || [u.prenom, u.nom, u.pole, u.poste, u.etudes].join(" ").toLowerCase().includes(rech))
    .sort((x, y) => String(x.nom).localeCompare(String(y.nom)));
  const fiche = (u) => {
    const parcours = (Array.isArray(u.parcours) ? u.parcours : []).filter((x) => x.annee || x.poste || x.pole);
    const li = lienSur(u.linkedin);
    return `<article class="carte">
      <p><strong>${esc(u.prenom)} ${esc(u.nom)}</strong></p>
      <p>${pastilleClub(u.clubId)} ${pastilles(u)}</p>
      ${u.poste || u.pole ? `<p class="petit gris">${esc([u.poste, u.pole].filter(Boolean).join(" · "))}</p>` : ""}
      <details><summary>${te("annuaire.voir")}</summary>
        ${u.anneeEntree ? `<p class="petit">${esc(t("annuaire.entree", { annee: u.anneeEntree }))}</p>` : ""}
        ${u.etudes ? `<p class="petit">${esc(u.etudes)}</p>` : ""}
        ${parcours.length ? `<ul class="parcours">${parcours.map((x) => `<li><strong>${esc(x.annee)}</strong> ${esc([x.poste, x.pole].filter(Boolean).join(" · "))}</li>`).join("")}</ul>` : ""}
        ${u.email ? `<p class="petit"><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></p>` : ""}
        ${li ? `<p class="petit"><a href="${esc(li)}" target="_blank" rel="noopener">LinkedIn</a></p>` : ""}
      </details>
    </article>`;
  };
  return `<h1>${te("annuaire.titre")}</h1>
    <div class="champ"><label for="rech" class="cache">${te("annuaire.recherche")}</label><input id="rech" type="search" placeholder="${te("annuaire.recherche")}" value="${esc(etat.rechAnnuaire)}" data-input="rech-annuaire"></div>
    <div class="puces">${filtres.map((v) => `<button type="button" class="puce ${etat.filtreAnnuaire === v ? "actif" : ""}" data-action="filtre-annuaire" data-v="${v}">${esc(v === "tous" ? t("tous") : v === "board" ? t("badge.board") : v === "alumni" ? t("badge.alumni") : nomCourt(v))}</button>`).join("")}</div>
    <div id="liste-annuaire">${liste.length ? liste.map(fiche).join("") : `<p class="gris centre">${te("annuaire.vide")}</p>`}</div>
    ${etat.profil.visibleAnnuaire ? "" : `<p class="petit gris centre">${te("annuaire.absent")} <a href="#/compte">${te("compte.titre")}</a></p>`}`;
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
      ${ligne(t("plus.fondateurs"), t("plus.fondateursSous"), t("bientot"))}
      ${ligne(t("plus.contact"), t("plus.contactSous"), t("bientot"))}
    </div>
    <div class="surtitre">${te("langue.titre")}</div>
    <div class="puces">${LANGUES.map((l) => `<button type="button" class="puce ${etat.langue === l ? "actif" : ""}" data-action="langue" data-v="${l}">${te("langue." + l)}</button>`).join("")}</div>`;
}

/* ---------- Espace admin ---------- */
function champClub(avecReseau) {
  if (estSuper()) return `<div class="champ"><label for="clubId">${te("admin.club")}</label><select id="clubId" name="clubId" required>${optionsClubs(etat.profil.clubId, avecReseau)}</select></div>`;
  return `<input type="hidden" name="clubId" value="${esc(etat.profil.clubId)}"><p class="petit gris">${te("admin.pour")} <strong>${esc(nomClub(etat.profil.clubId))}</strong></p>`;
}
function champVisibilite(avecPole) {
  const choix = ["public", "members", "club"].concat(avecPole ? ["pole"] : []);
  return `<div class="champ"><label for="visibility">${te("admin.qui")}</label>
      <select id="visibility" name="visibility">${choix.map((v) => `<option value="${v}">${te("admin.vis." + v)}</option>`).join("")}</select></div>
    ${avecPole ? `<div class="champ"><label for="pole">${te("admin.pole")}</label><select id="pole" name="pole">${optionsPoles()}</select><span class="aide">${te("admin.poleAide")}</span></div>` : ""}`;
}

function adminPublier() {
  const ev = etat.typePublication === "event";
  const formulaire = ev ? `<form id="form-event" novalidate>
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
      <button type="button" class="puce ${ev ? "" : "actif"}" data-action="type" data-v="news">${te("admin.uneNews")}</button>
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

function adminCodes() {
  if (!estSuper()) return "";
  if (etat.codes === null) { chargerCodes(); return chargement(); }
  return `<section class="carte">
    <h2>${te("admin.codesTitre")}</h2><p class="gris petit">${te("admin.codesAide")}</p>
    <div id="msg" aria-live="polite"></div>
    <form id="form-codes" novalidate>
      ${CLUBS.map((c) => `<div class="champ"><label for="code_${c.id}">${esc(c.nom)}</label><input id="code_${c.id}" name="${c.id}" autocomplete="off" minlength="4" value="${esc(etat.codes[c.id])}"></div>`).join("")}
      <button class="btn plein large" type="submit">${te("enregistrer")}</button>
    </form></section>`;
}

function pageAdmin() {
  if (!estAdmin()) return `<h1>${te("admin.titre")}</h1><section class="carte"><p>${te("admin.reserve")}</p></section>`;
  const onglets = ["publier", "contenus", "membres"].concat(estSuper() ? ["codes"] : []);
  if (!onglets.includes(etat.adminOnglet)) etat.adminOnglet = "publier";
  const corps = { publier: adminPublier, contenus: adminContenus, membres: adminMembres, codes: adminCodes }[etat.adminOnglet]();
  return `<h1>${te("admin.titre")}</h1>
    <p class="petit gris">${estSuper() ? te("admin.tous") : te("admin.vousGerez") + " " + esc(nomClub(etat.profil.clubId))}</p>
    <div class="onglets">${onglets.map((v) => `<button type="button" class="${etat.adminOnglet === v ? "actif" : ""}" data-action="onglet-admin" data-v="${v}">${te("admin.onglet." + v)}</button>`).join("")}</div>
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
  admin: pageAdmin
};
const ONGLETS = ["accueil", "evenements", "calendrier", "news", "plus"];

/* ---------- Affichage ---------- */
function afficher(remonter = true, forcer = false) {
  if (!etat.pret) return;
  // On ne redessine pas un formulaire en cours de saisie quand des données arrivent en arrière-plan.
  if (!remonter && !forcer && document.activeElement && racine.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  const r = PAGES[route()] ? route() : "accueil";
  const onglet = ONGLETS.includes(r) ? r : "plus";
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
  etat.info = null; // le message de confirmation précédent disparaît à l'action suivante

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

racine.addEventListener("change", (ev) => {
  const c = ev.target.dataset && ev.target.dataset.change;
  if (c === "langue") changerLangue(ev.target.value);
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

window.addEventListener("hashchange", () => { if (!etat.garderInfo) etat.info = null; etat.garderInfo = false; etat.brouillon = null; afficher(); });
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); etat.installer = e; if (route() === "accueil") afficher(false); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
