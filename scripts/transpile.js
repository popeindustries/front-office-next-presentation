'use strict';

const sass = require('sass');

const RE_SASS = /\.s[ac]ss$/;

module.exports = async function transpile(filepath) {
  if (RE_SASS.test(filepath)) {
    return sass.renderSync({
      file: filepath,
      includePaths: ['node_modules']
    }).css;
  }
};
