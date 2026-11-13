export default {
  packagerConfig: {
    asar: true,
    appBundleId: "io.botlands.desktop",
    name: "Botlands"
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "botlands"
      }
    },
    {
      name: "@electron-forge/maker-dmg",
      config: {
        format: "ULFO"
      }
    },
    {
      name: "@electron-forge/maker-deb",
      config: {}
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["linux", "darwin", "win32"]
    }
  ]
};
