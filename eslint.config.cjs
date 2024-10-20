const { base: tknfConfig } = require("@tknf-labs/eslint-config");

/** @type { import("eslint").Linter.Config } */
module.exports = [
  ...tknfConfig,
  {
    rules: {
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-param-reassign": "off",
      "no-plusplus": "off",
      "comma-dangle": ["error", "always-multiline"],
    },
  },
];
