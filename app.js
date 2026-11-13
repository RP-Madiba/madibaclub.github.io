// Application Madiba Club — socle (étape 3) : navigation, comptes membres, installation.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Les clubs du réseau. Pour en ajouter un : une ligne de plus ici.
const CLUBS = [
  { id: "bruxelles", nom: "Madiba Bruxelles", pays: "Belgique" },
  { id: "manchester", nom: "Madiba Manchester", pays: "Royaume-Uni" }
];
const ROLES = { pending: "En attente de validation", member: "Membre", admin: "Administrateur", superadmin: "Super-administrateur" };

const fb = initializeApp(firebaseConfig);
const auth = getAuth(fb);
const db = getFirestore(fb);

const etat = { pret: false, user: null, profil: null, erreurProfil: "", inscription: null, installer: null };
const racine = document.getElementById("app");

/* ---------- Outils ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nomClub = (id) => (CLUBS.find((c) => c.id === id) || {}).nom || "Club non précisé";
const estMembre = () => !!etat.profil && ["member", "admin", "superadmin"].includes(etat.profil.role);
const route = () => (location.hash.replace(/^#\/?/, "") || "accueil").split("?")[0];
const aller = (r) => { if (route() === r) afficher(); else location.hash = "#/" + r; };

const ICO = {
  accueil: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  evenements: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h5"/>',
  calendrier: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  news: '<path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5"/>',
  plus: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  fleche: '<path d="M9 6l6 6-6 6"/>'
};
const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICO[n]}</svg>`;

const ERREURS = {
  "auth/email-already-in-use": "Un compte existe déjà avec cette adresse e-mail. Utilisez l'onglet « Se connecter ».",
  "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
  "auth/weak-password": "Le mot de passe doit contenir au moins 6 caractères.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "Aucun compte ne correspond à cette adresse e-mail.",
  "auth/missing-password": "Indiquez votre mot de passe.",
  "auth/too-many-requests": "Trop de tentatives. Réessayez dans quelques minutes.",
  "auth/network-request-failed": "Pas de connexion internet. Réessayez.",
  "auth/popup-closed-by-user": "La fenêtre Google a été fermée avant la fin de la connexion.",
  "auth/popup-blocked": "Votre navigateur a bloqué la fenêtre Google. Autorisez les fenêtres pop-up puis réessayez.",
  "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase (Authentication › Paramètres › Domaines autorisés).",
  "auth/operation-not-allowed": "Cette méthode de connexion n'est pas activée dans Firebase.",
  "permission-denied": "Accès refusé par la base de données. Les règles de sécurité ne sont peut-être pas encore publiées."
};
const texteErreur = (e) => ERREURS[e && e.code] || "Une erreur est survenue. Réessayez. (" + ((e && e.code) || "inconnue") + ")";

/* ---------- Comptes ---------- */
async function chargerProfil(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  if (!etat.inscription) return null;
  const profil = await creerProfil(user, etat.inscription);
  etat.inscription = null;
  return profil;
}

async function creerProfil(user, d) {
  const profil = { prenom: d.prenom, nom: d.nom, email: user.email || "", clubId: d.clubId, role: "pending" };
  await setDoc(doc(db, "users", user.uid), { ...profil, createdAt: serverTimestamp() });
  return profil;
}

onAuthStateChanged(auth, async (user) => {
  etat.user = user; etat.profil = null; etat.erreurProfil = "";
  if (user) {
    try { etat.profil = await chargerProfil(user); }
    catch (e) { etat.erreurProfil = texteErreur(e); }
  }
  etat.pret = true;
  if (user && ["connexion", "inscription"].includes(route())) aller("accueil"); else afficher();
});

/* ---------- Pages ---------- */
function pageAccueil() {
  let haut;
  if (!etat.user) {
    haut = `<section class="hero">
      <img src="icons/logo-or.png" alt="Madiba Club">
      <h1>Un réseau, plusieurs villes.</h1>
      <p>Suivez les activités du Madiba Club à Bruxelles, à Manchester et bientôt ailleurs.</p>
      <div class="actions">
        <a class="btn or" href="#/inscription">Créer un compte</a>
        <a class="btn contour-clair" href="#/connexion">Se connecter</a>
      </div>
    </section>`;
  } else if (etat.erreurProfil) {
    haut = `<div class="message erreur" role="alert">${esc(etat.erreurProfil)}</div>`;
  } else if (!etat.profil) {
    haut = pageProfilInitial();
  } else {
    const p = etat.profil;
    haut = `<section class="hero">
      <img src="icons/logo-or.png" alt="Madiba Club">
      <h1>Bonjour ${esc(p.prenom)}</h1>
      <p>${esc(nomClub(p.clubId))} · ${esc(ROLES[p.role] || p.role)}</p>
    </section>`;
    if (p.role === "pending") {
      haut += `<section class="carte info">
        <h2>Votre demande est enregistrée</h2>
        <p>Un administrateur de votre club doit valider votre compte. Vous aurez ensuite accès à l'espace réservé aux membres, dont l'annuaire.</p>
      </section>`;
    }
  }
  return haut + `
    <section class="carte">
      <h2>Nos clubs</h2>
      ${CLUBS.map((c) => `<p><strong>${esc(c.nom)}</strong> <span class="gris">· ${esc(c.pays)}</span></p>`).join("")}
    </section>
    ${blocInstallation()}`;
}

function blocInstallation() {
  const installee = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if (installee) return "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (etat.installer) {
    return `<section class="carte"><h2>Installer l'application</h2>
      <p class="gris">Ajoutez Madiba Club à votre écran d'accueil, comme une application classique.</p>
      <button class="btn plein" type="button" data-action="installer">Installer</button></section>`;
  }
  if (ios) {
    return `<section class="carte"><h2>Installer sur iPhone</h2>
      <ol class="etapes"><li>Ouvrez cette page dans Safari.</li><li>Touchez le bouton Partager (le carré avec une flèche vers le haut).</li><li>Choisissez « Sur l'écran d'accueil », puis « Ajouter ».</li></ol></section>`;
  }
  return `<section class="carte"><h2>Installer l'application</h2>
    <p class="gris">Dans Chrome, ouvrez le menu (les trois points en haut à droite), puis choisissez « Installer l'application » ou « Ajouter à l'écran d'accueil ».</p></section>`;
}

const optionsClubs = () => `<option value="">Choisir…</option>` + CLUBS.map((c) => `<option value="${esc(c.id)}">${esc(c.nom)}</option>`).join("");

function pageAuth(mode) {
  const insc = mode === "inscription";
  return `
    <div class="onglets" role="tablist">
      <a href="#/connexion" class="${insc ? "" : "actif"}">Se connecter</a>
      <a href="#/inscription" class="${insc ? "actif" : ""}">Créer un compte</a>
    </div>
    <section class="carte">
      <h1>${insc ? "Créer un compte" : "Se connecter"}</h1>
      <div id="msg" aria-live="polite"></div>
      <form id="form-${mode}" novalidate>
        ${insc ? `<div class="deux">
          <div class="champ"><label for="prenom">Prénom</label><input id="prenom" name="prenom" autocomplete="given-name" required></div>
          <div class="champ"><label for="nom">Nom</label><input id="nom" name="nom" autocomplete="family-name" required></div>
        </div>
        <div class="champ"><label for="clubId">Votre club</label><select id="clubId" name="clubId" required>${optionsClubs()}</select></div>` : ""}
        <div class="champ"><label for="email">Adresse e-mail</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="champ"><label for="mdp">Mot de passe${insc ? " (6 caractères minimum)" : ""}</label><input id="mdp" name="mdp" type="password" autocomplete="${insc ? "new-password" : "current-password"}" required></div>
        <button class="btn plein large" type="submit">${insc ? "Créer mon compte" : "Se connecter"}</button>
      </form>
      ${insc ? "" : `<button class="lien-btn" type="button" data-action="oubli">Mot de passe oublié ?</button>`}
      <div class="separateur">ou</div>
      <button class="btn contour large" type="button" data-action="google">Continuer avec Google</button>
      ${insc ? `<p class="petit gris">Votre compte sera validé par un administrateur de votre club avant l'accès à l'espace membres.</p>` : ""}
    </section>`;
}

function pageProfilInitial() {
  return `<section class="carte info">
    <h1>Complétez votre profil</h1>
    <p class="gris">Encore une étape pour terminer la création de votre compte.</p>
    <div id="msg" aria-live="polite"></div>
    <form id="form-profil" novalidate>
      <div class="deux">
        <div class="champ"><label for="prenom">Prénom</label><input id="prenom" name="prenom" autocomplete="given-name" required></div>
        <div class="champ"><label for="nom">Nom</label><input id="nom" name="nom" autocomplete="family-name" required></div>
      </div>
      <div class="champ"><label for="clubId">Votre club</label><select id="clubId" name="clubId" required>${optionsClubs()}</select></div>
      <button class="btn plein large" type="submit">Enregistrer</button>
    </form>
  </section>`;
}

function pageBientot(titre, texte) {
  return `<h1>${esc(titre)}</h1><section class="carte"><p>${esc(texte)}</p><p class="gris petit">Cette rubrique est en cours de construction.</p></section>`;
}

function pagePlus() {
  const ligne = (t, s, pastille) => `<div class="ligne inactif"><span class="txt"><strong>${esc(t)}</strong><span>${esc(s)}</span></span><span class="pastille">${esc(pastille)}</span></div>`;
  const compte = etat.user
    ? `<a class="ligne" href="#/compte"><span class="txt"><strong>Mon compte</strong><span>${esc(etat.user.email || "")}</span></span>${ico("fleche")}</a>`
    : `<a class="ligne" href="#/connexion"><span class="txt"><strong>Se connecter</strong><span>Ou créer un compte membre</span></span>${ico("fleche")}</a>`;
  return `<h1>Plus</h1>
    <div class="surtitre">Mon espace</div>
    <div class="liste">${compte}</div>
    <div class="surtitre">Le réseau</div>
    <div class="liste">
      ${ligne("Les fondateurs", "Celles et ceux qui ont créé le Madiba Club", "Bientôt")}
      ${ligne("Contact", "Écrire à la cellule Belgique ou Royaume-Uni", "Bientôt")}
    </div>
    <div class="surtitre">Espace membres</div>
    <div class="liste">
      ${ligne("Annuaire", "Membres actifs, board et alumni", estMembre() ? "Bientôt" : "Membres")}
    </div>`;
}

function pageCompte() {
  if (!etat.user) return pageAuth("connexion");
  const p = etat.profil;
  return `<h1>Mon compte</h1>
    <section class="carte">
      ${p ? `<p><strong>${esc(p.prenom)} ${esc(p.nom)}</strong></p>` : ""}
      <p class="gris">${esc(etat.user.email || "")}</p>
      ${p ? `<p><span class="pastille or">${esc(nomClub(p.clubId))}</span> <span class="pastille ${p.role === "pending" ? "" : "noir"}">${esc(ROLES[p.role] || p.role)}</span></p>` : ""}
    </section>
    <button class="btn contour large" type="button" data-action="deconnexion">Se déconnecter</button>`;
}

const PAGES = {
  accueil: pageAccueil,
  connexion: () => pageAuth("connexion"),
  inscription: () => pageAuth("inscription"),
  evenements: () => pageBientot("Événements", "Vous retrouverez ici les événements à venir, en cours et passés de chaque club."),
  calendrier: () => pageBientot("Calendrier", "Vous retrouverez ici le calendrier des activités, club par club."),
  news: () => pageBientot("News", "Vous retrouverez ici les actualités du réseau Madiba."),
  plus: pagePlus,
  compte: pageCompte
};
const ONGLETS = [["accueil", "Accueil"], ["evenements", "Événements"], ["calendrier", "Calendrier"], ["news", "News"], ["plus", "Plus"]];

/* ---------- Affichage ---------- */
function afficher() {
  if (!etat.pret) return;
  const r = PAGES[route()] ? route() : "accueil";
  const onglet = ["connexion", "inscription", "compte"].includes(r) ? "plus" : r;
  const boutonCompte = etat.user
    ? `<a class="compte" href="#/compte">Mon compte</a>`
    : `<a class="compte" href="#/connexion">Se connecter</a>`;
  racine.innerHTML = `
    <header class="entete">
      <img src="icons/icon-192.png" alt="">
      <span class="nom titre">Madiba Club</span>
      ${boutonCompte}
    </header>
    <main>${PAGES[r]()}</main>
    <nav class="nav" aria-label="Navigation principale">
      ${ONGLETS.map(([id, nom]) => `<a href="#/${id}" class="${id === onglet ? "actif" : ""}"${id === onglet ? ' aria-current="page"' : ""}>${ico(id)}${nom}</a>`).join("")}
    </nav>`;
  window.scrollTo(0, 0);
}

function message(texte, type) {
  const m = document.getElementById("msg");
  if (m) m.innerHTML = texte ? `<div class="message ${type || "erreur"}" role="alert">${esc(texte)}</div>` : "";
}

function occupe(form, oui) {
  const b = form.querySelector('button[type="submit"]');
  if (b) b.disabled = oui;
}

/* ---------- Actions ---------- */
racine.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const v = Object.fromEntries(new FormData(form).entries());
  for (const k in v) v[k] = String(v[k]).trim();
  message("");

  if (form.id === "form-connexion") {
    if (!v.email || !v.mdp) return message("Indiquez votre e-mail et votre mot de passe.");
    occupe(form, true);
    try { await signInWithEmailAndPassword(auth, v.email, v.mdp); }
    catch (e) { message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-inscription") {
    if (!v.prenom || !v.nom || !v.clubId || !v.email || !v.mdp) return message("Tous les champs sont obligatoires.");
    occupe(form, true);
    etat.inscription = { prenom: v.prenom, nom: v.nom, clubId: v.clubId };
    try { await createUserWithEmailAndPassword(auth, v.email, v.mdp); }
    catch (e) { etat.inscription = null; message(texteErreur(e)); occupe(form, false); }
  }

  if (form.id === "form-profil") {
    if (!v.prenom || !v.nom || !v.clubId) return message("Tous les champs sont obligatoires.");
    occupe(form, true);
    try { etat.profil = await creerProfil(etat.user, v); afficher(); }
    catch (e) { message(texteErreur(e)); occupe(form, false); }
  }
});

racine.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-action]");
  if (!el) return;
  const action = el.dataset.action;

  if (action === "google") {
    message("");
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (e) { message(texteErreur(e)); }
  }
  if (action === "oubli") {
    const email = (document.getElementById("email") || {}).value || "";
    if (!email.trim()) return message("Saisissez d'abord votre adresse e-mail dans le champ ci-dessus.");
    try { await sendPasswordResetEmail(auth, email.trim()); message("Un e-mail de réinitialisation vient de vous être envoyé.", "ok"); }
    catch (e) { message(texteErreur(e)); }
  }
  if (action === "deconnexion") {
    await signOut(auth);
    aller("accueil");
  }
  if (action === "installer" && etat.installer) {
    etat.installer.prompt();
    etat.installer = null;
    afficher();
  }
});

window.addEventListener("hashchange", afficher);
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); etat.installer = e; if (route() === "accueil") afficher(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
