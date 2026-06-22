const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  // On applique la configuration recommandée par ESLint
  js.configs.recommended,

  {
    // On cible tous les fichiers JavaScript du projet
    files: ["**/*.js"],
    
    languageOptions: {
      ecmaVersion: 2022,
      // On spécifie qu'on tourne sous Node.js (pour autoriser require, module.exports, etc.)
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.jest, // Pour que le linter comprenne 'describe', 'it', 'expect' dans tes tests
      },
    },

    // Ici, tu peux ajuster tes propres règles selon tes préférences
    rules: {
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }], // Ignore les arguments inutilisés s'ils commencent par un underscore (ex: _req)
      "no-console": "off", // Pratique pour garder tes console.log de debug ou de démarrage serveur
      "eqeqeq": "error", // Force l'utilisation de === et !== au lieu de == et !=
      "curly": "error", // Force les accolades pour les blocs if/else
    },
  },

  // Dossiers à ignorer par le Linter
  {
    ignores: ["node_modules/", "coverage/"]
  }
];