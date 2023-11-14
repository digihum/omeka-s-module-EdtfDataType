const path = require('path');
var LiveReloadPlugin = require('webpack-livereload-plugin');

module.exports = {
  entry: './asset/src/js/index.js',
  target: 'web',
  mode: 'development',
  output: {
    library:'EdtfDataType',
    filename: 'edtf-data-type.min.js',
    path: path.resolve(__dirname, 'asset/js'),
  },
  resolve: {
    extensions: ['.js']
  },
  externalsType: 'window',
  externals: {
    jquery: 'jQuery',
  },
  plugins: [
    new LiveReloadPlugin({
      protocol: "http"
    })
  ]
};
module.loaders = { 
  test: /\.js$/, 
  loader: 'babel', 
  exclude: /node_modules/ 
};
