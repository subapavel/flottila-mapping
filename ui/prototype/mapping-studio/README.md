# Flottila Mapping Studio

Otevři **Mapping-studio.html** v prohlížeči. Soubor obsahuje celý interaktivní prototyp včetně stylů a funguje offline. Otevře se ukázkové mapování **Orders to Doc** v režimu čtení. Tlačítkem **Edit** přejdeš do editace a **Save** uloží změny do úložiště daného prohlížeče.

Na záložce **Definition** můžeš přetáhnout další cílové pole z pravého stromu na plátno. Příkaz **Ungroup** v nabídce cílového uzlu oddělí jeho výraz a zachová jeho vstupní větev. Proměnnou vytvoříš přes **Add Variable** na rodičovském poli. Do výrazu ji pak můžeš přetáhnout z pravého stromu nebo vybrat přes **Add node → Variables**.

Záložka **Test** simuluje ukázkový scénář pro XML a JSON. **Display Queue** umožňuje prohlédnout podporované operace nad vybraným testovacím vstupem. Přenosný HTML soubor obsahuje aplikaci a výchozí příklad. Později uložené změny a testovací instance zůstávají v prohlížeči, kde vznikly.

## Vývoj ze zdrojových kódů

V adresáři projektu spusť `npm install` a poté `npm run dev`. Příkaz `npm run build` vytvoří webovou verzi v `dist/` a obnoví přenosný soubor `Mapping-studio.html`.

Ověřovací scénáře používají Chromium z Playwrightu. Po instalaci prohlížeče příkazem `npx playwright install chromium` jsou v `package.json` k dispozici skripty `verify:mode`, `verify:canvas`, `verify:grouping`, `verify:variables`, `verify:dialogs` a `verify:expression`. Spouštějí se proti sestavenému přenosnému HTML.
