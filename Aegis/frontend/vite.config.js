import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.png", "models/*.onnx"],
      manifest: {
        name: "Aegis",
        short_name: "Aegis",
        description: "India's mobile security guardian — APK scanner, phishing detector, breach radar",
        theme_color: "#1a1f3c",
        background_color: "#0d1117",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
        share_target: {
          action: "/share",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              { name: "file", accept: ["application/vnd.android.package-archive", ".apk"] }
            ]
          }
        }
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts", expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ],
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          onnx: ["onnxruntime-web"],
          firebase: ["firebase/app", "firebase/auth", "firebase/messaging"]
        }
      }
    }
  }
});
