// Journal du Madiba : transforme un PDF en pages-images et en texte remis en forme.
// La conversion se fait dans le navigateur de l'administrateur, au moment de l'envoi.

const mediane = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// À partir des morceaux de texte d'une page (avec leur position), reconstruit des titres
// et des paragraphes dans l'ordre de lecture, colonnes comprises.
export function blocsDepuisItems(items, largeurPage) {
  const mots = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({ t: it.str, x: it.x, y: it.y, w: it.w, s: it.s }));
  if (!mots.length) return [];

  // 1. Lignes : morceaux à la même hauteur ; une grande distance horizontale sépare deux colonnes.
  mots.sort((a, b) => b.y - a.y || a.x - b.x);
  const rangees = [];
  for (const m of mots) {
    const r = rangees.find((q) => Math.abs(q.y - m.y) < Math.min(q.s, m.s) * 0.45);
    if (r) r.mots.push(m); else rangees.push({ y: m.y, s: m.s, mots: [m] });
  }
  // Un espace entre deux mots d'une même rangée n'est une séparation de colonnes que si
  // aucune ligne voisine ne le traverse (sinon c'est juste un texte justifié très aéré).
  const traverse = (m, milieu) => mots.some((v) => v !== m && Math.abs(v.y - m.y) > m.s * 0.45 && Math.abs(v.y - m.y) < m.s * 4.5
    && v.x < milieu - m.s * 0.3 && v.x + v.w > milieu + m.s * 0.3);
  // Titres décoratifs aux lettres espacées (« B U L L E T I N ») : on recolle les lettres.
  const espace = (t, min) => new RegExp("^(\\S ){" + min + ",}\\S$").test(t.trim());
  const coller = (t) => t.replace(/ /g, "").replace(/([A-Za-zÀ-ÿ])(\d)/g, "$1 $2").replace(/(\d)([A-Za-zÀ-ÿ])/g, "$1 $2");
  const assembler = (parts) => {
    const decoratif = parts.some((q) => espace(q.t, 2));
    let t = "";
    parts.forEach((q, i) => { t += (i && q.e > 0.12 && !/\s$/.test(t) ? " " : "") + (decoratif && espace(q.t, 1) ? coller(q.t) : q.t); });
    return t;
  };
  const lignes = [];
  for (const r of rangees) {
    r.mots.sort((a, b) => a.x - b.x);
    let courant = null;
    for (const m of r.mots) {
      const ecart = courant ? m.x - courant.x2 : 0;
      const colonne = courant && ecart > Math.max(m.s, courant.s) * 2.2 && !traverse(m, courant.x2 + ecart / 2);
      if (courant && !colonne) {
        courant.parts.push({ t: m.t, e: ecart / m.s });
        courant.x2 = Math.max(courant.x2, m.x + m.w); courant.s = Math.max(courant.s, m.s);
      } else {
        courant = { parts: [{ t: m.t, e: 0 }], x1: m.x, x2: m.x + m.w, y: m.y, s: m.s };
        lignes.push(courant);
      }
    }
  }
  lignes.forEach((l) => { l.t = assembler(l.parts); });

  // 2. Paragraphes : lignes voisines, de même taille, alignées dans la même colonne.
  lignes.sort((a, b) => b.y - a.y);
  const blocs = [];
  for (const l of lignes) {
    const b = blocs.find((q) => {
      const ecart = q.bas - l.y;
      const memeTaille = Math.abs(q.s - l.s) < q.s * 0.12;
      const recouvre = Math.min(q.x2, l.x2) - Math.max(q.x1, l.x1) > Math.min(q.x2 - q.x1, l.x2 - l.x1) * 0.3;
      return memeTaille && recouvre && ecart > 0 && ecart < q.s * 1.75;
    });
    if (b) { b.lignes.push(l.t); b.bas = l.y; b.x1 = Math.min(b.x1, l.x1); b.x2 = Math.max(b.x2, l.x2); }
    else blocs.push({ lignes: [l.t], haut: l.y, bas: l.y, x1: l.x1, x2: l.x2, s: l.s });
  }

  // 3. Taille du texte courant, pour reconnaître les titres.
  const tailles = [];
  blocs.forEach((b) => { const n = b.lignes.join(" ").length; for (let i = 0; i < n; i += 20) tailles.push(b.s); });
  const corps = mediane(tailles) || 10;

  // 4. Ordre de lecture : les blocs larges (titres, bandeaux) coupent la page en zones ;
  //    dans chaque zone, on lit colonne par colonne, de haut en bas.
  blocs.sort((a, b) => b.haut - a.haut || a.x1 - b.x1);
  const large = (b) => b.x2 - b.x1 > largeurPage * 0.62 || b.s > corps * 1.25;
  const ordonnes = [];
  let zone = [];
  const vider = () => {
    if (!zone.length) return;
    const parGauche = [...zone].sort((a, b) => a.x1 - b.x1);
    const colonnes = [];
    for (const b of parGauche) {
      const c = colonnes[colonnes.length - 1];
      if (c && b.x1 < c.x2 - (c.x2 - c.x1) * 0.25) { c.blocs.push(b); c.x2 = Math.max(c.x2, b.x2); }
      else colonnes.push({ x1: b.x1, x2: b.x2, blocs: [b] });
    }
    // Vraies colonnes de texte (elles se font face) : on lit colonne par colonne.
    // Blocs en quinconce (texte à gauche, puis à droite plus bas) : on lit de haut en bas.
    let faceAFace = false;
    for (let i = 0; i < colonnes.length && !faceAFace; i++) for (let j = i + 1; j < colonnes.length && !faceAFace; j++) {
      for (const a of colonnes[i].blocs) for (const b of colonnes[j].blocs) {
        const commun = Math.min(a.haut, b.haut) - Math.max(a.bas, b.bas);
        const petit = Math.min(a.haut - a.bas, b.haut - b.bas);
        if (petit > a.s * 2 && commun > petit * 0.5) faceAFace = true;
      }
    }
    if (faceAFace) colonnes.forEach((c) => { c.blocs.sort((a, b) => b.haut - a.haut); ordonnes.push(...c.blocs); });
    else ordonnes.push(...zone);
    zone = [];
  };
  for (const b of blocs) { if (large(b)) { vider(); ordonnes.push(b); } else zone.push(b); }
  vider();

  // 5. Mise en forme.
  return ordonnes.map((b) => {
    const texte = b.lignes.join(" ").replace(/\s+/g, " ").replace(/\s+([,.;])/g, "$1").trim();
    const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, "");
    const capitales = lettres.length > 2 && lettres === lettres.toUpperCase();
    let type = "p";
    if (b.s > corps * 1.9) type = "h1";
    else if (b.s > corps * 1.25 && texte.length < 140) type = "h2";
    else if (capitales && texte.length < 110) type = "h3";
    return { t: type, x: texte };
  }).filter((b) => b.x.length > 1);
}

// Retire les blocs vides et les répétitions immédiates.
export function nettoyer(blocs) {
  return blocs.filter((b, i) => b.x && !(i && blocs[i - 1].x === b.x));
}

let chargement = null;
function chargerPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!chargement) {
    chargement = new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "vendor/pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; ok(window.pdfjsLib); };
      s.onerror = () => { chargement = null; ko(new Error("pdfjs")); };
      document.head.appendChild(s);
    });
  }
  return chargement;
}

function enJpeg(canvas, maxCaracteres) {
  let qualite = 0.74, url = canvas.toDataURL("image/jpeg", qualite);
  while (url.length > maxCaracteres && qualite > 0.4) { qualite -= 0.08; url = canvas.toDataURL("image/jpeg", qualite); }
  return url;
}

// Convertit le fichier : renvoie { couverture, pages: [{ image, blocs }] }.
export async function convertirPDF(fichier, progression) {
  const pdfjs = await chargerPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
  const pages = [];
  let couverture = "";
  for (let n = 1; n <= pdf.numPages; n++) {
    if (progression) progression(n, pdf.numPages);
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    let largeur = 1100, image = "";
    // On réduit la taille de l'image si elle dépasse ce que la base accepte par page.
    for (let essai = 0; essai < 3; essai++) {
      const vue = page.getViewport({ scale: largeur / base.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vue.width); canvas.height = Math.round(vue.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vue }).promise;
      image = enJpeg(canvas, 820000);
      if (n === 1 && !couverture) {
        const c = document.createElement("canvas");
        c.width = 240; c.height = Math.round(240 * canvas.height / canvas.width);
        c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
        couverture = c.toDataURL("image/jpeg", 0.7);
      }
      if (image.length <= 820000) break;
      largeur = Math.round(largeur * 0.8);
    }
    const contenu = await page.getTextContent();
    const items = contenu.items.map((it) => ({
      str: it.str, x: it.transform[4], y: it.transform[5], w: it.width,
      s: Math.hypot(it.transform[0], it.transform[1]) || it.height || 10
    }));
    pages.push({ image, blocs: nettoyer(blocsDepuisItems(items, base.width)) });
  }
  return { couverture, pages };
}
