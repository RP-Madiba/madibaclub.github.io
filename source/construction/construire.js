// Construit la version à mettre sur GitHub, à partir du code source lisible.
//   node construire.js <dossier-source> <dossier-sortie>
// • Firebase : seules les fonctions utilisées sont gardées (paquet allégé, découpé) ;
// • code et styles compactés ; styles intégrés à la page (une demande de moins) ;
// • un fichier de textes par langue ; photos en WebP, en deux tailles ;
// • service worker avec un nom de version calculé automatiquement.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const esbuild = require("esbuild");
const sharp = require("sharp");

const SRC = path.resolve(process.argv[2]);
const OUT = path.resolve(process.argv[3]);
const ici = __dirname;

const ecrire = (f, c) => { fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.writeFileSync(path.join(OUT, f), c); };
const copier = (f) => { fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true }); fs.copyFileSync(path.join(SRC, f), path.join(OUT, f)); };
const lire = (f) => fs.readFileSync(path.join(SRC, f), "utf8");

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // 1. Firebase allégé : trois entrées, les parties communes dans des morceaux partagés.
  const vendor = await esbuild.build({
    entryPoints: { firebase: path.join(ici, "src/fb.js"), "firebase-messaging": path.join(ici, "src/fb-messaging.js"), "firebase-popup": path.join(ici, "src/fb-popup.js") },
    bundle: true, splitting: true, format: "esm", minify: true, target: "es2019", legalComments: "none",
    outdir: path.join(OUT, "vendor"), chunkNames: "fb-[hash]", metafile: true, logLevel: "warning",
    nodePaths: [path.join(ici, "node_modules")]
  });
  // Morceaux dont dépend firebase.js (à précharger dès le début).
  const sorties = vendor.metafile.outputs;
  const cleFb = Object.keys(sorties).find((k) => k.endsWith("vendor/firebase.js"));
  const dependances = sorties[cleFb].imports.filter((i) => i.kind === "import-statement").map((i) => "vendor/" + path.basename(i.path));

  // 2. Code de l'application compacté (les noms de fichiers importés restent les mêmes).
  const compacter = async (f, cible = ["es2020", "safari13", "chrome80"]) => (await esbuild.transform(lire(f), { loader: "js", format: "esm", minify: true, target: cible, legalComments: "none" })).code;
  ecrire("app.js", await compacter("app.js"));
  ecrire("journal.js", await compacter("journal.js"));
  copier("firebase-config.js");

  // 3. Un fichier de textes par langue : on ne télécharge que la sienne.
  const { T } = await import(path.join(SRC, "i18n.js"));
  for (const l of Object.keys(T)) ecrire(`i18n-${l}.js`, "export default " + JSON.stringify(T[l]) + ";\n");

  // 4. Styles compactés et intégrés à la page.
  const css = (await esbuild.transform(lire("style.css"), { loader: "css", minify: true })).code.trim();
  let html = lire("index.html");
  html = html.replace('<link rel="stylesheet" href="style.css">', `<style>${css}</style>`);
  const precharger = ["app.js", "firebase-config.js", "vendor/firebase.js", ...dependances].map((f) => `<link rel="modulepreload" href="${f}">`).join("\n");
  html = html.replace("<!--PRECHARGEMENTS-->", precharger);
  html = html.replace(/<!--(?!PRECHARGEMENTS)[\s\S]*?-->\n?/g, "").replace(/\n\s+/g, "\n");
  ecrire("index.html", html);
  ecrire("polices.css", (await esbuild.transform(lire("polices.css"), { loader: "css", minify: true })).code);

  // 5. Images : WebP en deux tailles (+ l'original en secours), icônes et polices.
  const TAILLES = { groupe: [800, 1200], maroc: [600, 900], histoire: [500, 699], "board-2024": [600, 1000], "board-2025": [600, 1000], "board-2026": [600, 1000] };
  for (const f of fs.readdirSync(path.join(SRC, "images"))) {
    copier("images/" + f);
    const nom = path.basename(f, ".jpg");
    for (const w of TAILLES[nom] || []) ecrire(`images/${nom}-${w}.webp`, await sharp(path.join(SRC, "images", f)).resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer());
  }
  for (const f of fs.readdirSync(path.join(SRC, "icons"))) copier("icons/" + f);
  ecrire("icons/marque.webp", await sharp(path.join(SRC, "icons/icon-192.png")).resize(76, 76).webp({ quality: 82 }).toBuffer());
  ecrire("icons/logo-or.webp", await sharp(path.join(SRC, "icons/logo-or.png")).resize({ width: 520 }).webp({ quality: 85, alphaQuality: 90 }).toBuffer());
  for (const f of fs.readdirSync(path.join(SRC, "polices"))) copier("polices/" + f);
  for (const f of fs.readdirSync(path.join(SRC, "vendor"))) copier("vendor/" + f);
  copier("manifest.webmanifest");

  // 6. Service worker : liste des fichiers gardés sur l'appareil et nom de version.
  const liste = (d) => fs.readdirSync(path.join(OUT, d)).map((f) => d + "/" + f);
  const precache = ["./", "index.html", "app.js", "firebase-config.js", "manifest.webmanifest",
    ...Object.keys(T).map((l) => `i18n-${l}.js`),
    ...liste("vendor").filter((f) => /\/(firebase|fb-)/.test(f)),
    "polices.css", ...liste("polices").filter((f) => f.endsWith(".woff2")),
    "icons/marque.webp", "icons/icon-192.png"];
  const empreinte = crypto.createHash("sha256");
  for (const f of precache.filter((x) => x !== "./")) empreinte.update(fs.readFileSync(path.join(OUT, f)));
  for (const f of liste("images").concat(["journal.js"])) empreinte.update(fs.readFileSync(path.join(OUT, f)));
  const version = "madiba-" + empreinte.digest("hex").slice(0, 10);
  let sw = lire("sw.js")
    .replace(/const CACHE = "[^"]*";/, `const CACHE = "${version}";`)
    .replace(/const FICHIERS = \[[^\]]*\];/, `const FICHIERS = ${JSON.stringify(precache)};`);
  ecrire("sw.js", (await esbuild.transform(sw, { loader: "js", minify: true, target: "es2019" })).code);

  // 7. Le code source lisible, gardé à part (pour les prochaines modifications ; jamais téléchargé par l'application).
  for (const f of ["app.js", "i18n.js", "style.css", "polices.css", "index.html", "sw.js", "journal.js"]) {
    fs.mkdirSync(path.join(OUT, "source"), { recursive: true });
    fs.copyFileSync(path.join(SRC, f), path.join(OUT, "source", f));
  }
  for (const f of ["construire.js", "src/fb.js", "src/fb-messaging.js", "src/fb-popup.js"]) {
    fs.mkdirSync(path.dirname(path.join(OUT, "source/construction", f)), { recursive: true });
    fs.copyFileSync(path.join(ici, f), path.join(OUT, "source/construction", f));
  }
  ecrire("source/LISEZMOI.txt", "Code source lisible de l'application Madiba Club (version " + version + ").\n"
    + "Ce dossier n'est pas utilisé par l'application : il sert à la modifier plus tard.\n"
    + "Pour reconstruire : npm install esbuild@0.23.1 firebase@10.12.2 sharp@0.33.5, puis node construction/construire.js <source> <sortie>.\n");

  const poids = (f) => fs.statSync(path.join(OUT, f)).size;
  console.log("version", version);
  console.log("précharge :", ["app.js", "vendor/firebase.js", ...dependances].map((f) => `${f} ${(poids(f) / 1024).toFixed(0)} Ko`).join(", "));
})().catch((e) => { console.error(e); process.exit(1); });
