## EPG Display(Auto Refresh)

Powered by [Vite](https://vitejs.dev/). HTML provides the basic structure, CSS controls formatting, and JavaScript controls the behavior of different elements.

Hit run to see this project in action. It will auto-refresh as you edit the HTML, CSS and JS files.

## Disable Auto Refresh

If you find the auto refresh getting in your way, go to [vite.config.js](./vite.config.js) and update it set `hmr` to false to disable hot module reloading (HMR). The full config will look like this:

```js
export default defineConfig({
  plugins: [],
  server: {
    host: '0.0.0.0',
    hmr: false, // Change this line to `false` disable auto-refreshing.
  }
})
```

## Packages

Because this template uses Vite to build your code, you can add install and use npm packages. Simple open the Packager tool to search and manage your packages.

## Learn More

Check out [the vite docs](https://vitejs.dev) to learn more about configuring a frontend application.

## Example
<img width="1329" alt="Screenshot 2025-06-23 at 7 28 15 PM" src="https://github.com/user-attachments/assets/a1fa82b2-14f9-4919-b314-26317e39fcec" />

