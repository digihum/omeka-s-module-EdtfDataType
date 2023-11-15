const path = require('path');
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  entry: './asset/src/js/index.js',
  target: 'web',
  mode: 'production',
  devtool: 'source-map',
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
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin({
    }
    )],
  },
};
module.loaders = { 
  test: /\.js$/, 
  loader: 'babel', 
  exclude: /node_modules/ 
};
