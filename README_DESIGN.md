# What changed in MyWebPortfolio

New: Styles/input.css, wwwroot/css/site.css (prebuilt), wwwroot/js/portfolio.js, Components/*, rewritten Pages/Home.razor + Layout/MainLayout.razor.
Edited: wwwroot/index.html (fonts, site.css, portfolio.js), _Imports.razor (Components using), MyWebPortfolio.csproj (Tailwind build step).

Tailwind: site.css is already built, so the project runs as is. To keep it in sync while you edit:
1. Download the Tailwind v4 standalone CLI for Windows (tailwindcss-windows-x64.exe) from the tailwindcss GitHub releases, save as tools/tailwindcss.exe.
2. Every build now regenerates site.css. For live updates run in the project folder:
   tools\tailwindcss.exe -i Styles/input.css -o wwwroot/css/site.css --watch
