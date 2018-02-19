"use strict";

/* All Mozilla specific rules and enviroments at:
 * http://firefox-source-docs.mozilla.org/tools/lint/linters/eslint-plugin-mozilla.html
 */

module.exports = {
  "parserOptions": {
    "ecmaVersion": 8,
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": false,
      "experimentalObjectRestSpread": true
    }
  },
  env: {
    "es6": true,
    // "browser-window": false

  },
  extends: [
    "eslint:recommended",
    /* list of rules at:
     * https://dxr.mozilla.org/mozilla-central/source/tools/lint/eslint/eslint-plugin-mozilla/lib/configs/recommended.js
     */
    "plugin:mozilla/recommended",
  ],

  plugins: [
    "jsdoc",
    "json",
    "mozilla"
  ],

  rules: {
    "babel/new-cap": "off",
    "jsdoc/check-param-names": "warn",
    "jsdoc/check-tag-names": "warn",
    "jsdoc/check-types": "warn",
    "jsdoc/newline-after-description": "warn",
    "jsdoc/require-param": "warn",
    "jsdoc/require-param-description": "warn",
    "jsdoc/require-param-name": "warn",
    "jsdoc/require-param-type": "warn",
    "jsdoc/require-returns-description": "warn",
    "jsdoc/require-returns-type": "warn",
    "mozilla/balanced-listeners": "error",
    "mozilla/no-aArgs": "warn",
    "mozilla/use-chromeutils-import": "off", // TODO: "warn"?

    "comma-dangle": ["error", "always-multiline"],
    "eqeqeq": "error",
    "indent": ["warn", 2, {SwitchCase: 1}],
    "no-console": "warn",
    "no-shadow": "error",
    "no-unused-vars": "error",
    "no-var": "error",
    "no-warning-comments": ["warn", {"location": "anywhere"}],
    "prefer-const": "warn",
    "prefer-spread": "error",
    "semi": ["error", "always"],
    "valid-jsdoc": "error",
  },
};
