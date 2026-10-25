// AppKit's state (valtio) uses `import.meta`, which Metro only compiles with this flag (Expo SDK 53+).
module.exports = function (api) {
  api.cache(true)
  return { presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]] }
}
