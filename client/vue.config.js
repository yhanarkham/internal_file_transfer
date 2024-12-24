module.exports = {
  transpileDependencies: true,
  runtimeCompiler: true,
  lintOnSave: false,
  devServer: {
    host: '192.168.0.5',
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://192.168.0.5:3000',
        changeOrigin: true,
        pathRewrite: {
          '^/api': ''
        }
      }
    }
  }
}
